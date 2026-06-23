# MedSecure AI — Real-time Counterfeit Medicine Detector
### CDSCO Verification Framework | Team Meridian

MedSecure AI is a production-grade counterfeit medicine detection platform. Point a camera at a medicine packaging label to evaluate visual defects, print resolution, barcode compliance, and verify CDSCO registration.

---

## System Architecture

```
[User Camera / Frontend]
         │
         ▼  (Upload JPEG)
[Fastify Backend API] (Port 3001) <───> [SQLite Database] (medsecure.db)
         │
         ▼  (Image Path)
[Python FastAPI ML Engine] (Port 8000)
         │
         ├─> [EasyOCR Text Extraction]
         ├─> [OpenCV Layout/Color Anomaly Check]
         └─> [Rules-based Scoring Engine]
```

* **Frontend:** React 18 (Vite) + Tailwind CSS v4 + Leaflet Maps + Recharts.
* **Backend:** Node.js (Fastify) + SQLite + WebSockets.
* **ML Service:** Python 3.14 (FastAPI) + EasyOCR + OpenCV + NumPy.

---

## Local Setup & Run Guide

Follow these steps to run all services locally.

### 1. Pre-generate Sample Images
We have a python script that creates three realistic medicine packaging box images (genuine Calpol, counterfeit Crocin with incorrect batch format, and counterfeit Omez with blue background color profile and print blur) in the frontend public assets to make testing instant:
```bash
cd ml
python create_samples.py
```

### 2. Run Python ML Service
Install dependencies and run the FastAPI server:
```bash
cd ml
pip install -r requirements.txt
python main.py
```
*The ML service will run at `http://localhost:8000`.*

### 3. Run Node.js Backend Server
Install dependencies and run the Fastify API server:
```bash
cd backend
npm install
npm start
```
*The backend server will run at `http://localhost:3001`.* (It automatically initializes the SQLite database `medsecure.db` and seeds it with 500+ CDSCO approved medicine profiles on first startup).

### 4. Run Frontend Vite Web App
Install dependencies and launch the developer server:
```bash
cd frontend
npm install
npm run dev
```
*The Vite application will start at `http://localhost:5173`.*

---

## How to Demo Verification
1. Open `http://localhost:5173` in your browser.
2. Select any of the preloaded **Demo Verification Port** samples at the top:
   * **Calpol 650 (Genuine)**: Validates with a high authenticity score (98.4%) and prints a "Verified Genuine" badge.
   * **Crocin 500 (Counterfeit)**: Mismatched batch format regex. Flags a "High Risk Alert" with the exact batch pattern violations listed.
   * **Omez 20 (Counterfeit)**: Triggers primary packaging color profile deviation (blue profile instead of red) and high image printing blur anomalies.
3. Observe the **Scanning Progress screen** animating the OCR extraction, visual checks, database verification, and socket updates in real-time.
4. Click **Alert Map** to view confirmed alerts dynamically rendered as glowing heatmaps.
5. Click **Dashboard** to inspect live statistical reports, trends, and risk rating distributions.
6. Toggle **Offline Mode** in the navbar to test client-side offline canvas OCR fallbacks.
