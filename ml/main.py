import os
import re
import sqlite3
import json
import difflib
import numpy as np
import cv2
from PIL import Image
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import easyocr

app = FastAPI(title="MedSecure ML Inference Service v2")

print("Loading EasyOCR model (CPU)...")
reader = easyocr.Reader(['en'], gpu=False, verbose=False)
print("EasyOCR ready.")

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "medsecure.db"))

class ScanRequest(BaseModel):
    scan_id: str
    file_path: str

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def extract_fields(ocr_results):
    lines = [r[1].strip() for r in ocr_results if len(r[1].strip()) >= 2]
    full = " ".join(lines)

    fields = {"name": "", "manufacturer": "", "batch_number": "", "expiry_date": "", "mfg_date": "", "mrp": ""}

    # Batch Number — look for the VALUE after the label keyword, not the keyword itself
    batch_m = re.search(
        r'(?:batch\s*(?:no|number|n\.?o?\.?)|b\.?\s*n\.?\s*o?\.?)\s*[:\-\s]*([A-Z0-9][A-Z0-9\-/]{2,})',
        full, re.IGNORECASE)
    if batch_m:
        fields["batch_number"] = batch_m.group(1).strip()
    else:
        standalone = re.search(r'\b([A-Z]{2}\d{4,6})\b', full)
        if standalone:
            fields["batch_number"] = standalone.group(1)

    # Expiry Date
    exp_m = re.search(r'(?:exp\.?\s*(?:date|dt)?|expiry)\s*[:\-\s]*((?:\d{2})[/\-](?:\d{2,4}))', full, re.IGNORECASE)
    if exp_m:
        fields["expiry_date"] = exp_m.group(1)

    # Mfg Date
    mfg_m = re.search(r'(?:mfg\.?\s*(?:date|dt)?|mfd\.?)\s*[:\-\s]*((?:\d{2})[/\-](?:\d{2,4}))', full, re.IGNORECASE)
    if mfg_m:
        fields["mfg_date"] = mfg_m.group(1)

    # MRP
    mrp_m = re.search(r'(?:mrp|m\.?r\.?p\.?|price)\s*[:\-\s]*(?:rs\.?\s*)?(\d+\.?\d*)', full, re.IGNORECASE)
    if mrp_m:
        fields["mrp"] = f"₹{mrp_m.group(1)}"

    # Manufacturer — look for "Mfg By:" or "Manufactured by" followed by text
    mfr_m = re.search(r'(?:mfg\.?\s*by|manufactured\s*by)\s*[:\-\s]*(.+?)(?:\r|\n|$)', full, re.IGNORECASE)
    if mfr_m:
        fields["manufacturer"] = mfr_m.group(1).strip()[:60]

    return fields, lines

def analyze_image_quality(file_path, expected_colors_json):
    img = cv2.imread(file_path)
    if img is None:
        return 70.0, []

    anomalies = []
    score = 100.0

    # Blur / print quality detection
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

    if laplacian_var < 50:
        penalty = 40.0
        score -= penalty
        anomalies.append(f"Severe image blur detected (sharpness: {laplacian_var:.0f}). Indicates low-quality photocopied reproduction.")
    elif laplacian_var < 120:
        penalty = 20.0
        score -= penalty
        anomalies.append(f"Moderate blur in print (sharpness: {laplacian_var:.0f}). Possible scanned/reprinted packaging.")

    # Color profile deviation
    try:
        expected = json.loads(expected_colors_json) if isinstance(expected_colors_json, str) else expected_colors_json
        primary_hex = expected.get("primary", "#ffffff").lstrip('#')
        expected_bgr = np.array([int(primary_hex[i:i+2], 16) for i in (4, 2, 0)], dtype=np.float64)

        # Sample dominant color from the top and bottom strips of the packaging
        h, w = img.shape[:2]
        top_strip = img[0:int(h*0.15), :]
        bottom_strip = img[int(h*0.85):, :]
        combined = np.vstack([top_strip, bottom_strip])
        mean_color = np.mean(combined.reshape(-1, 3), axis=0)

        dist = np.linalg.norm(expected_bgr - mean_color)

        if dist > 150:
            score -= 35.0
            anomalies.append(f"Major packaging color mismatch (delta: {dist:.0f}). Expected primary hue #{primary_hex}, detected significantly different palette.")
        elif dist > 90:
            score -= 15.0
            anomalies.append(f"Minor color variance detected (delta: {dist:.0f}). Possible printing batch color drift.")
    except Exception:
        pass

    # Edge density check — genuine packages tend to have consistent text density
    edges = cv2.Canny(gray, 50, 150)
    edge_ratio = np.sum(edges > 0) / edges.size
    if edge_ratio < 0.02:
        score -= 10.0
        anomalies.append("Unusually low text/edge density. Packaging appears to have missing or obscured printed content.")

    return max(0.0, score), anomalies

def match_medicine(lines, full_text, medicines):
    best_med = None
    best_score = 0.0

    # Strategy 1: Direct substring containment in full text (most reliable)
    for med in medicines:
        name_lower = med["name"].lower()
        if name_lower in full_text.lower():
            ratio = 0.95
            if ratio > best_score:
                best_score = ratio
                best_med = med

    # Strategy 2: Line-by-line fuzzy matching
    if best_score < 0.7:
        for line in lines:
            if len(line) < 3:
                continue
            for med in medicines:
                ratio = difflib.SequenceMatcher(None, line.lower(), med["name"].lower()).ratio()
                if ratio > best_score:
                    best_score = ratio
                    best_med = med

    return best_med, best_score

@app.post("/process_scan")
def process_scan(req: ScanRequest):
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail="Image file not found")

    try:
        img_cv = cv2.imread(req.file_path)
        if img_cv is not None:
            height, width = img_cv.shape[:2]
        else:
            width, height = 800, 600

        ocr_results = reader.readtext(req.file_path)
        
        ocr_boxes = []
        for bbox, text, conf in ocr_results:
            try:
                xs = [pt[0] for pt in bbox]
                ys = [pt[1] for pt in bbox]
                x_min = min(xs) / width * 100
                y_min = min(ys) / height * 100
                x_max = max(xs) / width * 100
                y_max = max(ys) / height * 100
                ocr_boxes.append({
                    "text": text,
                    "confidence": float(conf),
                    "x": round(x_min, 1),
                    "y": round(y_min, 1),
                    "w": round(x_max - x_min, 1),
                    "h": round(y_max - y_min, 1)
                })
            except Exception:
                pass

        fields, lines = extract_fields(ocr_results)
        fields["ocr_boxes"] = ocr_boxes
        full_text = " ".join(lines)

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, name, generic_name, manufacturer_name, approved_batch_format, composition, expected_colors FROM medicines")
        medicines = [dict(r) for r in cur.fetchall()]

        matched, match_ratio = match_medicine(lines, full_text, medicines)

        anomalies = []
        ocr_score = 0.0
        visual_score = 100.0
        batch_score = 100.0
        barcode_score = 100.0
        community_score = 100.0
        medicine_id = None

        if matched and match_ratio >= 0.5:
            medicine_id = matched["id"]
            fields["name"] = matched["name"]
            if not fields["manufacturer"]:
                fields["manufacturer"] = matched["manufacturer_name"]

            ocr_score = min(100.0, match_ratio * 100.0)

            # Batch format validation
            batch = fields["batch_number"]
            if batch:
                pattern = matched["approved_batch_format"]
                try:
                    if not re.match(pattern, batch):
                        batch_score = 0.0
                        anomalies.append(
                            f"Batch '{batch}' does not match registered format '{pattern}' for {matched['name']}. "
                            f"Possible counterfeit or re-labelled packaging.")
                except Exception:
                    pass
            else:
                batch_score = 40.0
                anomalies.append("Batch number not detected on packaging. Field may be obscured or absent.")

            # Visual analysis
            visual_score, vis_anomalies = analyze_image_quality(req.file_path, matched["expected_colors"])
            anomalies.extend(vis_anomalies)

            # Community alert check
            if batch:
                alert = cur.execute("SELECT report_count FROM alerts WHERE medicine_id=? AND batch_number=?",
                                    (medicine_id, batch)).fetchone()
                if alert:
                    rc = alert["report_count"]
                    if rc >= 3:
                        community_score = 0.0
                        anomalies.append(f"⚠ ACTIVE RECALL: {rc} independent pharmacy reports confirm this batch as counterfeit.")
                    elif rc >= 1:
                        community_score = 50.0
                        anomalies.append(f"Community caution: {rc} suspect report(s) filed for batch {batch}.")

        else:
            ocr_score = 0.0
            visual_score = 35.0
            batch_score = 0.0
            barcode_score = 0.0
            fields["name"] = "Unidentified Medicine"
            fields["manufacturer"] = "Unknown Manufacturer"
            anomalies.append("No matching CDSCO-registered medicine brand identified from packaging text.")

        conn.close()

        composite = (visual_score * 0.30) + (ocr_score * 0.25) + (batch_score * 0.20) + (barcode_score * 0.15) + (community_score * 0.10)
        composite = max(0.0, min(100.0, round(composite, 1)))

        return {
            "medicine_id": medicine_id,
            "authenticity_score": composite,
            "ocr_extracted": fields,
            "anomalies": anomalies,
            "signal_breakdown": {
                "ocr": round(ocr_score, 1),
                "visual": round(visual_score, 1),
                "batch": round(batch_score, 1),
                "barcode": round(barcode_score, 1),
                "community": round(community_score, 1)
            }
        }
    except Exception as e:
        print(f"ML error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
