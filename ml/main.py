import os
import re
import json
import time
import threading
import sqlite3
import difflib
import ssl
import numpy as np
import cv2
from PIL import Image, ImageEnhance, ImageFilter
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import easyocr

# Disable SSL certificate verification for model downloads (macOS fix)
ssl._create_default_https_context = ssl._create_unverified_context

# Barcode detection - optional, works if ZBar native library is installed
try:
    from pyzbar.pyzbar import decode as zbar_decode
    from pyzbar.pyzbar import ZBarSymbol
    HAS_ZBAR = True
except Exception:
    HAS_ZBAR = False
    def zbar_decode(*args, **kwargs):
        return []
    print("ZBar not available. Barcode detection disabled.")

app = FastAPI(title="MedSecure ML Inference Service v3")

print("Loading EasyOCR model (CPU)...")
reader = easyocr.Reader(['en'], gpu=False, verbose=False)
print("EasyOCR ready.")

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "medsecure.db"))

# In-memory progress store for async scan processing
scan_progress_store = {}
scan_progress_lock = threading.Lock()

STAGES = [
    "preprocessing",
    "ocr_extraction",
    "barcode_decoding",
    "visual_analysis",
    "medicine_matching",
    "batch_validation",
    "scoring"
]

class ScanRequest(BaseModel):
    scan_id: str
    file_path: str

class ProgressResponse(BaseModel):
    scan_id: str
    stage: str
    stage_index: int
    total_stages: int
    progress: float
    status: str

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def set_progress(scan_id, stage, stage_index, progress, status="processing"):
    with scan_progress_lock:
        scan_progress_store[scan_id] = {
            "scan_id": scan_id,
            "stage": stage,
            "stage_index": stage_index,
            "total_stages": len(STAGES),
            "progress": progress,
            "status": status
        }

def preprocess_image(file_path):
    """Enhance image for better OCR and CV analysis: deskew, denoise, contrast."""
    img = cv2.imread(file_path)
    if img is None:
        return None, ["Could not read image file"]

    anomalies = []
    h, w = img.shape[:2]

    # 1. Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 2. Denoise
    denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)

    # 3. Adaptive contrast enhancement (CLAHE)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    # 4. Deskew - detect rotation angle and correct
    coords = np.column_stack(np.where(enhanced > 0))
    if len(coords) > 0:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) > 0.5:
            center = (w // 2, h // 2)
            matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
            enhanced = cv2.warpAffine(enhanced, matrix, (w, h),
                                      flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            anomalies.append(f"Image deskewed by {angle:.1f} degrees")

    # 5. Sharpen
    sharpen_kernel = np.array([[-1, -1, -1],
                               [-1,  9, -1],
                               [-1, -1, -1]])
    sharpened = cv2.filter2D(enhanced, -1, sharpen_kernel)

    # 6. Convert back to BGR for EasyOCR compatibility
    final = cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)

    return final, anomalies

def extract_barcodes(file_path):
    """Detect and decode barcodes from image using pyzbar."""
    img = cv2.imread(file_path)
    if img is None:
        return [], 0.0

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    barcodes = zbar_decode(gray)

    results = []
    for barcode in barcodes:
        data = barcode.data.decode("utf-8")
        barcode_type = barcode.type
        rect = barcode.rect
        results.append({
            "data": data,
            "type": barcode_type,
            "x": rect.left,
            "y": rect.top,
            "w": rect.width,
            "h": rect.height
        })

    # Score: 
    # - 100 if barcodes found and data is valid
    # - 50 if no barcodes (neutral - could be obscured or lighting)
    # - 0 if barcodes present but all have very short/invalid data
    if not results:
        return [], 50.0

    valid_count = sum(1 for r in results if len(r["data"]) >= 4)
    if valid_count == 0:
        return results, 20.0

    score = min(100.0, 60.0 + (valid_count / len(results)) * 40.0)
    return results, score

def extract_fields(ocr_results):
    lines = [r[1].strip() for r in ocr_results if len(r[1].strip()) >= 2]
    full = " ".join(lines)

    fields = {"name": "", "manufacturer": "", "batch_number": "", "expiry_date": "", "mfg_date": "", "mrp": ""}

    batch_m = re.search(
        r'(?:batch\s*(?:no|number|n\.?o?\.?)|b\.?\s*n\.?\s*o?\.?)\s*[:\-\s]*([A-Z0-9][A-Z0-9\-/]{2,})',
        full, re.IGNORECASE)
    if batch_m:
        fields["batch_number"] = batch_m.group(1).strip()
    else:
        standalone = re.search(r'\b([A-Z]{2}\d{4,6})\b', full)
        if standalone:
            fields["batch_number"] = standalone.group(1)

    exp_m = re.search(r'(?:exp\.?\s*(?:date|dt)?|expiry)\s*[:\-\s]*((?:\d{2})[/\-](?:\d{2,4}))', full, re.IGNORECASE)
    if exp_m:
        fields["expiry_date"] = exp_m.group(1)

    mfg_m = re.search(r'(?:mfg\.?\s*(?:date|dt)?|mfd\.?)\s*[:\-\s]*((?:\d{2})[/\-](?:\d{2,4}))', full, re.IGNORECASE)
    if mfg_m:
        fields["mfg_date"] = mfg_m.group(1)

    mrp_m = re.search(r'(?:mrp|m\.?r\.?p\.?|price)\s*[:\-\s]*(?:rs\.?\s*)?(\d+\.?\d*)', full, re.IGNORECASE)
    if mrp_m:
        fields["mrp"] = f"\u20b9{mrp_m.group(1)}"

    mfr_m = re.search(r'(?:mfg\.?\s*by|manufactured\s*by)\s*[:\-\s]*(.+?)(?:\r|\n|$)', full, re.IGNORECASE)
    if mfr_m:
        fields["manufacturer"] = mfr_m.group(1).strip()[:60]

    return fields, lines

def analyze_visual_quality(img, expected_colors_json):
    """Full visual analysis with better metrics than before."""
    if img is None:
        return 50.0, ["Image could not be loaded for visual analysis"]

    anomalies = []
    score = 100.0
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img.shape[:2]

    # 1. Blur detection (Laplacian variance) - improved thresholds
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    if laplacian_var < 30:
        score -= 45
        anomalies.append(f"Severe image blur detected (sharpness: {laplacian_var:.0f}). Indicates low-quality photocopied reproduction.")
    elif laplacian_var < 60:
        score -= 30
        anomalies.append(f"High print blur (sharpness: {laplacian_var:.0f}). Possible scanned/reprinted packaging.")
    elif laplacian_var < 120:
        score -= 15
        anomalies.append(f"Moderate blur in print (sharpness: {laplacian_var:.0f}). Possible quality issue.")

    # 2. Color profile deviation - sample only non-white/near-white regions for true dominant color
    try:
        expected = json.loads(expected_colors_json) if isinstance(expected_colors_json, str) else expected_colors_json
        primary_hex = expected.get("primary", "#ffffff").lstrip('#')
        expected_rgb = np.array([int(primary_hex[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float64)
        expected_bgr = expected_rgb[::-1]

        # Sample border regions for packaging color (excluding white/near-white pixels)
        top_strip = img[0:int(h*0.12), :].reshape(-1, 3)
        bottom_strip = img[int(h*0.88):, :].reshape(-1, 3)

        # Filter out white/near-white pixels (background)
        non_white_mask = ~(np.all(top_strip > 200, axis=1))
        if np.any(non_white_mask):
            top_colors = top_strip[non_white_mask]
        else:
            top_colors = top_strip

        non_white_mask = ~(np.all(bottom_strip > 200, axis=1))
        if np.any(non_white_mask):
            bottom_colors = bottom_strip[non_white_mask]
        else:
            bottom_colors = bottom_strip

        if len(top_colors) > 0 and len(bottom_colors) > 0:
            mean_top = np.mean(top_colors, axis=0)
            mean_bottom = np.mean(bottom_colors, axis=0)
            mean_color = (mean_top + mean_bottom) / 2

            dist = np.linalg.norm(expected_bgr - mean_color)

            if dist > 120:
                score -= 35
                anomalies.append(f"Major packaging color mismatch (delta: {dist:.0f}). Expected primary hue #{primary_hex}, detected significantly different palette.")
            elif dist > 70:
                score -= 15
                anomalies.append(f"Color variance detected (delta: {dist:.0f}). Possible printing batch color drift.")
    except Exception:
        pass

    # 3. Edge density and text presence
    edges = cv2.Canny(gray, 50, 150)
    edge_ratio = np.sum(edges > 0) / edges.size
    if edge_ratio < 0.01:
        score -= 20
        anomalies.append("Extremely low edge density. Packaging appears blank or severely degraded.")
    elif edge_ratio < 0.02:
        score -= 10
        anomalies.append("Low text/edge density. Packaging may have missing printed content.")

    # 4. Check for unnatural color saturation (common in cheap reprints)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1]
    mean_sat = np.mean(saturation)
    if mean_sat > 180:
        score -= 10
        anomalies.append("Atypically high color saturation. Common in digitally reprinted packaging.")

    # 5. Check for compression artifacts (JPEG blockiness)
    # Low-quality JPEGs have blocky artifacts visible in DCT
    # Check variance of 8x8 blocks
    block_variances = []
    for i in range(0, h - 8, 8):
        for j in range(0, w - 8, 8):
            block = gray[i:i+8, j:j+8]
            block_variances.append(np.var(block))
    mean_block_var = np.mean(block_variances) if block_variances else 0
    if mean_block_var < 20:
        score -= 5
        anomalies.append("Heavy JPEG compression artifacts detected. Suggests digital re-encoding.")

    return max(0.0, score), anomalies

def match_medicine(lines, full_text, medicines):
    best_med = None
    best_score = 0.0

    for med in medicines:
        name_lower = med["name"].lower()
        if name_lower in full_text.lower():
            ratio = 0.95
            if ratio > best_score:
                best_score = ratio
                best_med = med

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

def run_full_pipeline(scan_id, file_path):
    """Execute the full scan pipeline with progress tracking."""
    try:
        set_progress(scan_id, "preprocessing", 0, 0.0)
        time.sleep(0.1)

        if not os.path.exists(file_path):
            with scan_progress_lock:
                scan_progress_store[scan_id] = {
                    "scan_id": scan_id, "stage": "error", "stage_index": -1,
                    "total_stages": len(STAGES), "progress": 0.0, "status": "error",
                    "error": "Image file not found"
                }
            return

        img_cv = cv2.imread(file_path)
        if img_cv is not None:
            height, width = img_cv.shape[:2]
        else:
            width, height = 800, 600

        # Preprocess
        processed_img, preproc_anomalies = preprocess_image(file_path)
        set_progress(scan_id, "ocr_extraction", 1, 0.25)
        time.sleep(0.1)

        # OCR
        if processed_img is not None:
            temp_path = file_path + "_enhanced.jpg"
            cv2.imwrite(temp_path, processed_img)
            ocr_results = reader.readtext(temp_path)
            try:
                os.remove(temp_path)
            except Exception:
                pass
        else:
            ocr_results = reader.readtext(file_path)

        set_progress(scan_id, "barcode_decoding", 2, 0.45)
        time.sleep(0.1)

        # Barcode detection
        barcodes, barcode_score = extract_barcodes(file_path)

        set_progress(scan_id, "visual_analysis", 3, 0.60)
        time.sleep(0.1)

        # Build OCR boxes
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
        fields["barcodes"] = barcodes
        full_text = " ".join(lines)

        set_progress(scan_id, "medicine_matching", 4, 0.75)

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, name, generic_name, manufacturer_name, approved_batch_format, composition, expected_colors FROM medicines")
        medicines = [dict(r) for r in cur.fetchall()]

        matched, match_ratio = match_medicine(lines, full_text, medicines)

        anomalies = []
        ocr_score = 0.0
        visual_score = 100.0
        batch_score = 100.0
        community_score = 100.0
        medicine_id = None

        if matched and match_ratio >= 0.5:
            medicine_id = matched["id"]
            fields["name"] = matched["name"]
            if not fields["manufacturer"]:
                fields["manufacturer"] = matched["manufacturer_name"]

            ocr_score = min(100.0, match_ratio * 100.0)

            set_progress(scan_id, "batch_validation", 5, 0.85)

            # Batch validation
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

            # Visual analysis with the original image (not preprocessed, for true quality check)
            visual_score, vis_anomalies = analyze_visual_quality(img_cv if img_cv is not None else cv2.imread(file_path), matched["expected_colors"])
            anomalies.extend(preproc_anomalies)
            # Don't add deskew note as an anomaly if score is good
            for a in vis_anomalies:
                if "deskewed" not in a.lower():
                    anomalies.append(a)

            # Community alert check
            if batch:
                alert = cur.execute("SELECT report_count FROM alerts WHERE medicine_id=? AND batch_number=?",
                                    (medicine_id, batch)).fetchone()
                if alert:
                    rc = alert["report_count"]
                    if rc >= 3:
                        community_score = 0.0
                        anomalies.append(f"Active recall: {rc} independent pharmacy reports confirm this batch as counterfeit.")
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

        set_progress(scan_id, "scoring", 6, 0.95)

        # Composite score with REAL barcode contribution now
        composite = (visual_score * 0.30) + (ocr_score * 0.25) + (batch_score * 0.20) + (barcode_score * 0.15) + (community_score * 0.10)
        composite = max(0.0, min(100.0, round(composite, 1)))

        result = {
            "medicine_id": medicine_id,
            "authenticity_score": composite,
            "ocr_extracted": fields,
            "anomalies": anomalies,
            "barcodes_detected": barcodes,
            "signal_breakdown": {
                "ocr": round(ocr_score, 1),
                "visual": round(visual_score, 1),
                "batch": round(batch_score, 1),
                "barcode": round(barcode_score, 1),
                "community": round(community_score, 1)
            }
        }

        with scan_progress_lock:
            scan_progress_store[scan_id] = {
                "scan_id": scan_id, "stage": "complete", "stage_index": 7,
                "total_stages": len(STAGES), "progress": 1.0, "status": "complete",
                "result": result
            }

    except Exception as e:
        print(f"Pipeline error for {scan_id}: {e}")
        with scan_progress_lock:
            scan_progress_store[scan_id] = {
                "scan_id": scan_id, "stage": "error", "stage_index": -1,
                "total_stages": len(STAGES), "progress": 0.0, "status": "error",
                "error": str(e)
            }

@app.post("/process_scan")
def process_scan(req: ScanRequest):
    """Start async scan processing and return immediately."""
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail="Image file not found")

    thread = threading.Thread(target=run_full_pipeline, args=(req.scan_id, req.file_path))
    thread.daemon = True
    thread.start()

    return {
        "scan_id": req.scan_id,
        "status": "started",
        "message": "Scan pipeline initiated. Poll /scan_progress/{scan_id} for updates."
    }

@app.get("/scan_progress/{scan_id}")
def get_scan_progress(scan_id: str):
    """Get current progress of an async scan."""
    with scan_progress_lock:
        progress = scan_progress_store.get(scan_id)
        if progress is None:
            return {"scan_id": scan_id, "status": "not_found", "progress": 0.0}
        return progress

@app.get("/health")
def health():
    return {"status": "healthy", "service": "ml", "version": "3.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
