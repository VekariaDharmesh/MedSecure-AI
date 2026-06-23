# MedSecure AI — Full Build Plan
### Biothon 2026 | Team Meridian

---

## What We Are Building

MedSecure AI is a real-time counterfeit medicine detection platform. A user — pharmacist, patient, or government inspector — points their phone camera at any medicine package. Within seconds, the platform returns an authenticity verdict, a risk score, detected anomalies, a full traceability report, and community-sourced alert signals. No manufacturer integration required. No QR dependency. Works offline for the CV scan, syncs when connected.

The version submitted for Round 1 described the concept. This build is the actual working product.

---

## Rule for Every AI Agent Working on This

Write zero placeholder comments. No `// TODO`, no `// implement later`, no `// replace with actual logic`. Every function ships working. Every API call hits a real endpoint. Every UI component renders live data. No hardcoded mock arrays masquerading as real responses. If something needs a real data source and it does not exist yet, build a seed pipeline or a scraper — not a fake array. The visual output must look like a Series A startup shipped it, not a hackathon demo.

---

## Problem Depth

Counterfeit medicines kill approximately 500,000 people annually in sub-Saharan Africa alone. In India, the Central Drugs Standard Control Organisation estimates 4.5% of medicines in circulation are spurious or substandard. Rural and semi-urban pharmacies — the primary healthcare touchpoint for 65% of India's population — have zero verification tooling beyond visual inspection.

Existing interventions:

- QR/RFID track-and-trace: Only works if every manufacturer integrates. Most small and mid-tier pharma companies in India have not.
- Laboratory testing: 3-7 day turnaround, costs Rs 2,000-8,000 per test, inaccessible at point-of-sale.
- Consumer helplines: Reactive, not preventive.

MedSecure AI solves this at the point of dispensing, in under 4 seconds, using only a smartphone.

---

## Tech Stack — Final Decisions

### Frontend
- React 18 (Vite) — web app
- React Native (Expo) — mobile app sharing 80% of the codebase via a monorepo
- TailwindCSS 3 + shadcn/ui for component primitives
- Framer Motion for scan animations and result reveals
- Zustand for client state
- React Query (TanStack) for server state and cache
- Socket.io client for live alert feeds

### Backend
- Node.js + Fastify (chosen over Express for 3x throughput on image upload routes)
- Python FastAPI microservice for all ML inference — keeps Node clean and lets Python own the model runtime
- BullMQ + Redis for scan job queues — heavy CV analysis runs async, result pushed via WebSocket
- JWT + Refresh Token auth with httpOnly cookies
- Rate limiting via Upstash Redis
- Zod for schema validation on every route

### AI/ML Pipeline
- Google Cloud Vision API — primary OCR (production-grade, handles skewed, partial, and low-light images)
- Tesseract OCR — local fallback for offline mode, runs in-browser via tesseract.js
- YOLO v8 nano — packaging defect detection (fine-tuned on synthetic augmented dataset of genuine vs tampered packaging)
- CLIP (OpenAI) — logo and brand authenticity embedding comparison
- Custom rule engine — batch number checksum validation per CDSCO format, expiry date sanity checks, manufacturer code lookup
- Sentence Transformers — fuzzy match of extracted medicine name against reference database

### Database
- PostgreSQL (Supabase) — primary, structured medicine reference data, scan records, user accounts
- pgvector extension — stores CLIP embeddings for packaging logo comparison
- Redis — session store, scan result cache, alert pub/sub
- Supabase Storage — packaging images (encrypted at rest)

### Infrastructure
- Docker + Docker Compose for local dev
- Railway for backend services (Node + Python)
- Vercel for React web frontend
- Expo EAS for React Native builds
- GitHub Actions CI/CD — lint, test, build, deploy on every merge to main
- Sentry for error tracking
- PostHog for product analytics

---

## Architecture — How Data Flows

```
User opens app
  → Camera activates (React Native camera API or browser MediaStream)
  → Frame captured as JPEG blob

Client sends image to Node/Fastify API
  → Image stored in Supabase Storage (returns image_id)
  → Scan job enqueued in BullMQ with image_id

Python FastAPI worker picks up job
  → Step 1: Google Vision OCR extracts all text regions with bounding boxes
  → Step 2: YOLO v8 runs packaging anomaly detection (color deviation, print quality, logo position)
  → Step 3: Extracted medicine name matched against PostgreSQL reference DB via fuzzy + embedding search
  → Step 4: Batch number validated against CDSCO checksum format rules
  → Step 5: CLIP embedding of detected logo compared against stored genuine logo embeddings via pgvector cosine similarity
  → Step 6: Rule engine scores each signal (0-1) and weights them into composite authenticity score
  → Step 7: Scan result written to PostgreSQL (score, anomalies, extracted fields, image_id, lat/lng)

Node API pushes result to client via WebSocket room (scan_id)
  → Client receives result JSON
  → Framer Motion animates score reveal
  → If score < 0.6, alert pushed to community feed via Redis pub/sub
  → Nearby pharmacists with app open receive live alert
```

---

## Full Feature Set

### Core Scan (Shipped in PPT — Now Real)

**AI Packaging Analysis**
YOLO v8 trained on 12,000+ images (genuine packages + synthetically augmented counterfeits — ink bleed, color shift, font substitution, logo distortion). Detects: color deviation from reference, font mismatch, logo geometry errors, print quality artifacts, hologram absence.

**Smart OCR Verification**
Google Vision API extracts: medicine name, manufacturer, batch number, manufacturing date, expiry date, MRP, CDSCO license number, composition. Each field independently validated. Confidence score per field. Handles blurry, angled, partially occluded images.

**Barcode and Batch Validation**
ZXing decodes all 1D/2D barcode formats. Batch number cross-checked against CDSCO batch format specification (regex + checksum). Barcode data cross-referenced against extracted OCR text — mismatch is a major red flag signal.

**Authenticity Risk Score**
Composite 0-100 score. Each signal contributes weighted points: packaging visual (30%), OCR field match (25%), batch number validity (20%), barcode integrity (15%), community reports (10%). Score displayed with confidence interval and per-signal breakdown. Three verdict tiers: Verified, Caution, High Risk.

---

### Features Added Beyond PPT

**Live Counterfeit Alert Map**
Real-time map (Mapbox GL JS) showing geo-heatmap of High Risk scans in the last 24 hours. Powered by Redis pub/sub — new alerts appear on the map within 200ms of detection. Pharmacists and inspectors can see emerging counterfeit clusters by city and district. Filters: medicine category, manufacturer, time range.

**Medicine Reference Database (CDSCO-aligned)**
PostgreSQL table seeded from public CDSCO approved drug list + Jan Aushadhi database. 80,000+ entries covering generic and branded medicines. Each entry stores: approved batch number format, manufacturer codes, genuine logo CLIP embedding, expected packaging color profile. Continuously updated via scheduled scraper (Python + BeautifulSoup) pulling from CDSCO public portal.

**Offline Scan Mode**
Service worker caches the React web app shell. Tesseract.js runs OCR locally in the browser. YOLO v8 nano exported to ONNX and loaded via onnxruntime-web — full packaging analysis in-browser, no server call. Results queued locally, synced when connection restores. Designed specifically for rural pharmacies with poor connectivity.

**Pharmacist Dashboard**
Role-gated web dashboard for verified pharmacist accounts. Shows: total scans this month, risk breakdown pie chart, recent scan history with images and scores, flagged medicines, download PDF report for any scan (for record-keeping or reporting to authorities). Built with Recharts for live-updating charts.

**Government Analytics API**
Authenticated REST API for authorized government and regulatory bodies. Returns aggregated counterfeit detection data by district, medicine category, manufacturer, and time period. Designed for CDSCO / state drug control offices to identify hotspots without accessing individual scan data. Returns GeoJSON for direct map integration.

**Scan History and Personal Vault**
Every user's scan history stored and searchable. Filter by medicine, date, verdict. Export as PDF or CSV. Shareable scan report link (time-limited, signed URL) for sharing with doctors or reporting to authorities.

**Community Report Signal**
If a scan returns High Risk, user is prompted to confirm or dismiss. Confirmed reports from multiple users on the same batch number elevate a community alert — this signal feeds back into future scans of the same batch, boosting the risk score weighted by report count and geographic spread.

**Push Notifications (Mobile)**
Expo Push Notifications + Firebase Cloud Messaging. Pharmacists subscribed to alerts receive push notifications when a High Risk medicine is detected within their PIN code. CDSCO recall notifications surfaced as system alerts in-app.

**Medicine Lookup (No Camera)**
Search by medicine name, composition, or manufacturer. Returns: all registered variants, approved manufacturers, standard packaging description, and any active community alerts. Useful before purchase, not just after.

**Onboarding and Role Selection**
First-run onboarding flow with role selector: Consumer, Pharmacist, Healthcare Worker, Government Inspector. Role determines dashboard, features visible, and alert radius. Pharmacist and Inspector accounts require verification (GSTIN / license number cross-check).

**Multi-Language Support**
UI strings in English, Hindi, and Gujarati. OCR pipeline handles medicine text in Devanagari and Gujarati script via Google Vision multilingual model. Language auto-detected from device locale, manually overridable.

**Accessibility**
Full WCAG 2.1 AA. Screen reader labels on all interactive elements. High contrast mode. Tap-target minimum 44px. Font size adjustable. Color-blind safe palette for risk indicators (not just red/green — uses shape + label alongside color).

---

## Database Schema

```sql
-- Core reference table
medicines (
  id uuid primary key,
  name text not null,
  generic_name text,
  manufacturer_id uuid references manufacturers(id),
  cdsco_license text,
  approved_batch_format text,  -- regex pattern
  composition text[],
  category text,
  logo_embedding vector(512),  -- CLIP embedding via pgvector
  packaging_color_profile jsonb,  -- { primary_rgb, secondary_rgb, tolerance }
  created_at timestamptz,
  updated_at timestamptz
)

manufacturers (
  id uuid primary key,
  name text not null,
  code text unique,
  state text,
  license_number text,
  verified boolean default false
)

scans (
  id uuid primary key,
  user_id uuid references users(id),
  medicine_id uuid references medicines(id),
  image_url text,
  authenticity_score numeric(5,2),
  verdict text check (verdict in ('verified', 'caution', 'high_risk')),
  ocr_extracted jsonb,
  anomalies jsonb[],
  signal_breakdown jsonb,
  lat numeric,
  lng numeric,
  scanned_at timestamptz default now()
)

community_reports (
  id uuid primary key,
  scan_id uuid references scans(id),
  user_id uuid references users(id),
  confirmed boolean,
  medicine_id uuid,
  batch_number text,
  reported_at timestamptz default now()
)

alerts (
  id uuid primary key,
  medicine_id uuid references medicines(id),
  batch_number text,
  report_count integer default 1,
  geo_centroid point,
  severity text,
  created_at timestamptz,
  last_updated timestamptz
)

users (
  id uuid primary key,
  email text unique,
  role text check (role in ('consumer', 'pharmacist', 'healthcare_worker', 'inspector')),
  verified boolean default false,
  license_number text,
  lat numeric,
  lng numeric,
  pin_code text,
  language text default 'en',
  created_at timestamptz
)
```

---

## API Routes

All routes prefixed `/api/v1`. Authentication via Bearer JWT.

```
POST   /auth/register              Create account, role selection
POST   /auth/login                 Returns access + refresh tokens
POST   /auth/refresh               Refresh access token
DELETE /auth/logout                Invalidate refresh token

POST   /scans                      Upload image, returns scan_id immediately
GET    /scans/:id                  Poll or receive via WebSocket — returns result when ready
GET    /scans/history              Paginated scan history for authed user
GET    /scans/:id/report           Returns signed PDF report URL

GET    /medicines/search           Search reference DB by name, composition, manufacturer
GET    /medicines/:id              Full medicine profile

POST   /reports                    Submit community counterfeit report on a scan
GET    /alerts/map                 GeoJSON feed for live alert map (public)
GET    /alerts/feed                Paginated recent alerts with filters

GET    /dashboard/pharmacist       Stats, recent scans, risk breakdown (pharmacist role)
GET    /analytics/district         Government API — aggregated data by district (inspector role)
GET    /analytics/hotspots         Counterfeit hotspot GeoJSON (inspector role)

GET    /health                     System health check
```

WebSocket namespace: `/ws/scan` — client joins room `scan:{scan_id}`, server emits `scan:result` when ML pipeline finishes.

---

## ML Model Training Plan

**YOLO v8 Packaging Anomaly Detector**

Dataset construction:
- 4,000 genuine medicine package images (scraped from manufacturer websites, open datasets)
- 8,000 synthetic counterfeits — generated via Albumentations pipeline: hue/saturation shift, font substitution using FontTools, logo geometry distortion, print artifact overlays, JPEG compression artifacts

Training:
- YOLOv8n (nano) for mobile inference speed
- Classes: genuine_packaging, color_anomaly, font_anomaly, logo_anomaly, print_quality_defect, text_tampering
- Augmentation: random crops, rotations, lighting variation, motion blur
- Target mAP50: 0.82+
- Export: ONNX for onnxruntime-web, TensorRT for GPU server inference

**CLIP Logo Embeddings**

For each verified medicine in the reference DB: crop logo region from 10+ genuine package images, generate CLIP ViT-B/32 embeddings, store centroid embedding in pgvector. At scan time: CLIP-embed detected logo, cosine similarity against DB. Threshold 0.85 for pass.

---

## Folder Structure

```
medsecure-ai/
  apps/
    web/               React 18 Vite — web frontend
    mobile/            React Native Expo — mobile app
    dashboard/         Pharmacist and government dashboard (separate Vite app)

  packages/
    ui/                Shared shadcn/ui component library
    types/             Shared TypeScript types
    config/            Shared ESLint, Tailwind, tsconfig

  services/
    api/               Node.js Fastify backend
      src/
        routes/
        workers/       BullMQ job definitions
        db/            Drizzle ORM schema and migrations
        middleware/
        utils/

    ml/                Python FastAPI ML inference service
      src/
        ocr/           Google Vision + Tesseract integration
        cv/            YOLO v8 inference
        embedding/     CLIP logo embedding
        scoring/       Rule engine and composite scorer
        models/        Trained ONNX model files

  infrastructure/
    docker-compose.yml
    nginx/
    scripts/
      seed_medicines.py    CDSCO data scraper and seeder
      train_yolo.py
      generate_embeddings.py

  .github/
    workflows/
      ci.yml
      deploy.yml
```

---

## UI Screens — Full List

**Mobile (React Native)**
1. Splash and onboarding (3 screens — role selection, permissions, language)
2. Home — large camera button, recent scan summary, live alert badge
3. Camera scan — live viewfinder with corner-guide overlay, capture button, flip to gallery option
4. Scanning progress — animated pipeline visualization (OCR → CV → Match → Score), real-time step completion
5. Scan result — score dial (animated 0 to final), verdict badge, per-signal bars, extracted medicine details, anomaly callouts with image region highlights, action buttons (Report, Save, Share)
6. Alert map — Mapbox fullscreen with heatmap layer, filter bottom sheet
7. Medicine lookup — search screen with live results
8. Scan history — list with verdict color coding, search, filter
9. Profile and settings — role, language, notification preferences, account
10. Pharmacist dashboard (pharmacist role only) — stats cards, chart, recent scans table

**Web (React)**
Mirrors mobile screens. Additional:
- Landing page with demo scan (uses a preloaded sample image, runs real pipeline)
- Government analytics dashboard (inspector role)
- Admin panel (internal — medicine DB management, user verification)

---

## CI/CD Pipeline

```yaml
on: push to main

jobs:
  lint:
    runs-on: ubuntu-latest
    steps: eslint, tsc --noEmit, black (Python), ruff

  test:
    steps: vitest (frontend), pytest (ML service), supertest (API routes)

  build:
    steps: docker build api, docker build ml, vite build web

  deploy:
    steps:
      - Railway deploy (api + ml services)
      - Vercel deploy (web + dashboard)
      - Expo EAS build trigger (mobile — OTA update)
      - Run DB migrations (drizzle-kit push)
      - Notify Slack on success/failure
```

---

## Environment Variables Required

```env
# Node API
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=
JWT_REFRESH_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
PYTHON_ML_URL=http://ml-service:8000
SOCKET_PORT=3001

# Python ML
GOOGLE_VISION_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
REDIS_URL=
MODEL_PATH=./models/yolov8_packaging.onnx
CLIP_MODEL=ViT-B/32

# Frontend
VITE_API_URL=
VITE_WS_URL=
VITE_MAPBOX_TOKEN=
VITE_POSTHOG_KEY=

# Mobile
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_MAPBOX_TOKEN=
EXPO_PUSH_TOKEN=
```

---

## Build Order for AI Coding Agents

Follow this exact sequence. Do not jump ahead. Each phase must be fully working before the next starts.

**Phase 1 — Infrastructure**
Set up monorepo with Turborepo. Configure Docker Compose with PostgreSQL, Redis, and service containers. Run `drizzle-kit generate` and `drizzle-kit push` to create all tables. Seed medicines table with 500 real CDSCO-listed medicines using the seed script. Verify pgvector extension is active.

**Phase 2 — Auth**
Build register, login, refresh, logout routes in Fastify. JWT signing, httpOnly cookie for refresh token. Zod schema validation on all inputs. Role stored in token payload. Write supertest integration tests for all auth routes. Ensure tests pass before moving on.

**Phase 3 — ML Service**
Build Python FastAPI app. Implement Google Vision OCR endpoint — accepts image URL, returns extracted text regions with bounding boxes and confidence. Implement YOLO v8 inference endpoint — accepts image URL, returns detected anomaly classes with bounding boxes and confidence scores. Implement CLIP embedding endpoint — accepts image URL + medicine_id, returns cosine similarity score against stored embedding. Implement scoring rule engine — accepts all signal outputs, returns composite score and per-signal breakdown. All endpoints testable via pytest.

**Phase 4 — Scan Pipeline**
Implement image upload route in Node API — stores to Supabase Storage, creates scan record, enqueues BullMQ job. Implement BullMQ worker — calls each ML service endpoint in sequence, aggregates results, writes to scans table, pushes result via WebSocket. Test full pipeline: upload image → receive WebSocket result. Verify end-to-end with a real medicine package photo.

**Phase 5 — Community and Alerts**
Implement community report submission route. Write alert aggregation logic — when report_count hits threshold, create or update alerts record and publish to Redis channel. Build alert map GeoJSON endpoint. Implement WebSocket pub/sub for live map updates. Test: submit 3 reports on same batch → verify alert appears in map feed.

**Phase 6 — Web Frontend**
Build all web screens in order: landing page → camera scan page → scan result page → alert map → medicine lookup → scan history → dashboard. Connect to API. Real-time WebSocket integration for scan result. Mapbox integration for alert map. Framer Motion animations on scan result reveal. Run on localhost and verify every screen with real API calls.

**Phase 7 — Mobile App**
Mirror web screens in React Native. Shared types package. Camera integration with Expo Camera. Offline mode: service worker equivalent via Expo background fetch, tesseract.js replaced with expo-ml-kit for on-device OCR. Push notification setup with Expo Notifications.

**Phase 8 — Government Dashboard**
Build separate Vite app for inspector-role analytics. District-level counterfeit heatmap. Time series charts. Manufacturer risk rankings. Export to CSV/PDF. Auth-gated to inspector role only.

**Phase 9 — Polish**
Multi-language strings (i18next). Accessibility audit. Error boundaries on all major components. Loading skeletons on every data-fetching component. Rate limiting on public API routes. Sentry integration. PostHog event tracking on key actions.

**Phase 10 — Deployment**
Docker build and push to registry. Railway deploy. Vercel deploy. Expo EAS build. Smoke test every route and screen in production. Monitor Sentry for first-hour errors.

---

## Judging Criteria Alignment

**Innovation** — CLIP embedding-based logo similarity is not present in any existing consumer-facing medicine verification app. Offline YOLO + Tesseract mode works without connectivity. Community alert network creates a crowdsourced early warning system no existing solution has.

**Technical Depth** — YOLO fine-tuned on domain-specific synthetic dataset. pgvector for embedding similarity search. BullMQ async pipeline decouples upload latency from ML processing time. Full monorepo with shared types ensures no interface drift between services.

**Real-World Impact** — Designed ground-up for rural pharmacies (offline mode, Gujarati language support, sub-4-second scan time on mid-range phones). Government analytics API creates a direct regulatory use case beyond end-consumer utility.

**Completeness** — Every feature demonstrated live. No mocked data. Seeded medicine DB means real lookups return real results. Live alert map shows real scan data from the demo session.

**Scalability** — Stateless Node API scales horizontally. BullMQ workers can be replicated. PostgreSQL with connection pooling via PgBouncer. Redis cluster-ready. Railway auto-scales on load.

---

## What a Winning Demo Looks Like

Open the mobile app. Point camera at a genuine medicine package — scan completes in under 4 seconds, verified verdict, all OCR fields correctly extracted, shown on result screen. Switch to a physically modified or printed counterfeit package — High Risk verdict, anomaly bounding boxes highlighted on the package image, specific reasons listed (color deviation 23%, font mismatch in manufacturer name, barcode data inconsistent with OCR text). Open the web app on a laptop beside the phone — the alert map shows a new pin appearing for the scan in real time, within 2 seconds of the mobile verdict. Open the government dashboard on a second screen — the district-level chart updates to reflect the new scan. That is the demo. No slides, no mockups, no verbal explanations of what it "would" do. Every feature working, live, in front of the judges.
