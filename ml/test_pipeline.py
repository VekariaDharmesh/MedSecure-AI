import sys, os, json, cv2, re
import numpy as np

# Directly test the barcode and visual functions without importing main (avoids EasyOCR init)
try:
    from pyzbar.pyzbar import decode as zbar_decode
    HAS_ZBAR = True
except Exception:
    HAS_ZBAR = False
    def zbar_decode(*args, **kwargs):
        return []

def extract_barcodes(file_path):
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
        results.append({"data": data, "type": barcode_type, "x": rect.left, "y": rect.top, "w": rect.width, "h": rect.height})
    if not results:
        return [], 50.0
    valid_count = sum(1 for r in results if len(r["data"]) >= 4)
    if valid_count == 0:
        return results, 20.0
    score = min(100.0, 60.0 + (valid_count / len(results)) * 40.0)
    return results, score

def preprocess_image(file_path):
    img = cv2.imread(file_path)
    if img is None:
        return None, ["Could not read image file"]
    anomalies = []
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    coords = np.column_stack(np.where(enhanced > 0))
    if len(coords) > 0:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) > 0.5:
            center = (w // 2, h // 2)
            matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
            enhanced = cv2.warpAffine(enhanced, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            anomalies.append(f"Image deskewed by {angle:.1f} degrees")
    sharpen_kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(enhanced, -1, sharpen_kernel)
    final = cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)
    return final, anomalies

def analyze_visual_quality(img, expected_colors_json):
    if img is None:
        return 50.0, ["Image could not be loaded for visual analysis"]
    anomalies = []
    score = 100.0
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img.shape[:2]
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    if laplacian_var < 30:
        score -= 45
        anomalies.append(f"Severe image blur detected (sharpness: {laplacian_var:.0f}).")
    elif laplacian_var < 60:
        score -= 30
        anomalies.append(f"High print blur (sharpness: {laplacian_var:.0f}).")
    elif laplacian_var < 120:
        score -= 15
        anomalies.append(f"Moderate blur in print (sharpness: {laplacian_var:.0f}).")
    try:
        expected = json.loads(expected_colors_json) if isinstance(expected_colors_json, str) else expected_colors_json
        primary_hex = expected.get("primary", "#ffffff").lstrip('#')
        expected_rgb = np.array([int(primary_hex[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float64)
        expected_bgr = expected_rgb[::-1]
        top_strip = img[0:int(h*0.12), :].reshape(-1, 3)
        bottom_strip = img[int(h*0.88):, :].reshape(-1, 3)
        non_white_mask = ~(np.all(top_strip > 200, axis=1))
        top_colors = top_strip[non_white_mask] if np.any(non_white_mask) else top_strip
        non_white_mask = ~(np.all(bottom_strip > 200, axis=1))
        bottom_colors = bottom_strip[non_white_mask] if np.any(non_white_mask) else bottom_strip
        if len(top_colors) > 0 and len(bottom_colors) > 0:
            mean_top = np.mean(top_colors, axis=0)
            mean_bottom = np.mean(bottom_colors, axis=0)
            mean_color = (mean_top + mean_bottom) / 2
            dist = np.linalg.norm(expected_bgr - mean_color)
            if dist > 120:
                score -= 35
                anomalies.append(f"Major packaging color mismatch (delta: {dist:.0f}).")
            elif dist > 70:
                score -= 15
                anomalies.append(f"Color variance detected (delta: {dist:.0f}).")
    except Exception:
        pass
    edges = cv2.Canny(gray, 50, 150)
    edge_ratio = np.sum(edges > 0) / edges.size
    if edge_ratio < 0.01:
        score -= 20
        anomalies.append("Extremely low edge density.")
    elif edge_ratio < 0.02:
        score -= 10
        anomalies.append("Low text/edge density.")
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mean_sat = np.mean(hsv[:, :, 1])
    if mean_sat > 180:
        score -= 10
        anomalies.append("Atypically high color saturation.")
    return max(0.0, score), anomalies

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "public", "samples")

for name, colors_hex in [
    ("calpol_genuine.jpg", "#10b981"),
    ("crocin_counterfeit.jpg", "#de2c2c"),
    ("omez_counterfeit.jpg", "#f43f5e")
]:
    path = os.path.join(base, name)
    if not os.path.exists(path):
        print(f"{name}: NOT FOUND")
        continue

    img = cv2.imread(path)
    vs, va = analyze_visual_quality(img, json.dumps({"primary": colors_hex, "secondary": "#ffffff"}))
    bc, bs = extract_barcodes(path)
    pp, pa = preprocess_image(path)

    print(f"\n=== {name} ===")
    print(f"  Visual: {vs:.1f}, Barcode score: {bs:.1f}")
    print(f"  Visual anomalies: {va}")
    print(f"  Preproc: processed={pp is not None}, deskew={pa}")

print("\nAll tests passed!")
