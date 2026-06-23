You are building MedSecure AI — a production-grade counterfeit medicine detection platform for Biothon 2026. The attached plan.md is your feature bible and architectural reference. Read every line of it. Then build something better.

---

## Your Mandate

The plan.md defines what must exist. It does not constrain how you build it, what stack you pick, what you add, or how it looks. You have full creative and technical freedom. The only non-negotiables are: every feature in the plan ships working, nothing is hardcoded or mocked, and the visual output looks like a funded startup built it.

If you see a better way to architect something, use it. If you think of a feature that would make this more impressive, add it. If a newer library solves something cleaner, use that instead. The plan is a floor, not a ceiling.

---

## Code Quality — Non-Negotiable Rules

Write zero placeholder code. No `// TODO`, no `// implement later`, no `// mock data`, no fake arrays pretending to be API responses. Every function has a real implementation. Every API call hits a real endpoint. Every UI component renders live data from the actual backend. If something does not exist yet, build it — do not stub it.

Write no AI-generated filler comments. No lines of dashes. No `// =====================`. No `// Helper function to do X` above a function named doX. Comments exist only when the logic is genuinely non-obvious. The code should read like a senior engineer wrote it at a company that does code review.

Every route has input validation. Every async operation has error handling. Every component has a loading state and an error state. No unhandled promise rejections. No raw console.log left in production paths.

---

## Visual Design — This Is What Wins

The UI is not a bonus. It is half the score. Build something that makes judges stop and look.

Pick a design direction and commit to it completely. Dark, clinical, high-contrast — like a medical-grade instrument. Or clean, minimal, high-information-density like a Bloomberg terminal for drug safety. Or bold, consumer-facing, trust-signaling like a fintech app. Pick one and execute it flawlessly across every single screen.

Every screen needs a visual element. No text-only pages. Use real icons from Lucide or Phosphor — no emoji as UI elements. Typography must have clear hierarchy: one dominant size, one supporting size, one caption size. Never more than two font weights per screen.

Animations must be purposeful. The scan progress sequence — OCR running, CV analysis, scoring — should animate in real time as each pipeline step completes via WebSocket. The authenticity score should count up to its final value with an easing curve. Anomaly bounding boxes on the result image should draw in. These are not decorative — they show the system is actually working, which is what judges need to see.

The alert map must look like a real geospatial intelligence dashboard. Not a tutorial Mapbox embed. Dark basemap, glowing heatmap, cluster markers, smooth animation when new alerts arrive live.

Every data visualization — score dials, signal breakdown bars, analytics charts — must render live data and look like they belong in a product, not a hackathon submission.

Mobile screens must feel native. Proper safe area insets, bottom sheet interactions, haptic feedback on scan complete, camera viewfinder with a real scanning guide overlay that tracks detected package edges.

---

## Features — Everything in plan.md Ships, Plus Whatever You Add

Every feature described in plan.md must be present and working:

Real-time camera scan with AI packaging analysis. OCR extraction with field-level confidence. YOLO-based anomaly detection with bounding box visualization on the result image. Composite authenticity score with per-signal breakdown. Batch number and barcode validation. Medicine reference database with real data. Community report system that feeds back into scoring. Live counterfeit alert map with real-time updates. Offline scan mode. Pharmacist dashboard with live-updating analytics. Government inspector API with district-level aggregation. Scan history with export. Multi-language support. Push notifications for nearby alerts. Role-based access with proper verification flow.

Beyond that, add whatever you believe makes this a winning product. Some directions worth considering: AR overlay mode where the camera continuously scores the package in real-time as it moves without requiring a manual capture. Voice output of the verdict for visually impaired users or situations where hands are full. Batch scan mode where a pharmacist scans multiple medicines in a session and gets a session-level risk summary. A medicine substitution suggester — if a scanned medicine is flagged, suggest verified alternatives with the same composition from the reference DB. WhatsApp integration to share a scan report as a link. FSSAI/CDSCO recall feed integration so active recalls surface as banners in the app. These are suggestions, not requirements. You decide what ships.

---

## The Demo Must Work Live

The demo is not a video. It is not slides. It is the product running in front of judges.

A real medicine package is scanned. The result appears in under 5 seconds. All fields are correctly extracted. The score animates to its final value. The alert map on a second device updates within 2 seconds. The pharmacist dashboard reflects the new scan immediately. Every feature that is described is demonstrated live.

Build for the demo. Every happy path must be instant and flawless. Error handling must be graceful — no raw error objects on screen. Loading states must always be present. The app must not crash.

---

## Stack Freedom

Use whatever stack makes this ship fastest and look best. The plan.md suggests a stack — treat it as a reference, not a constraint. If you want to use a different ML inference runtime, use it. If you want to use a different database, use it. If a newer framework solves the problem better, use it. The requirement is that the output is production-grade and fully functional, not that it matches any specific technology choice.

One constraint: the ML pipeline must be real. Actual model inference on real images. Not a random number generator returning fake scores. Not a hardcoded response based on filename. Real computer vision, real OCR, real scoring logic.

---

## Deliverable

A fully working application. Every service running. Every screen implemented. Every feature functional with real data. Deployed and accessible via URL. Code in a GitHub repository with a clear README covering setup, environment variables, and deployment.

The last line of your work should be a working product, not a list of what you built.
