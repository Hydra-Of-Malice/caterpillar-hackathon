# CAT Sentinel — Shared Design Brief (canonical decisions for all sections)

Every section must stay consistent with these decisions. If you believe one is wrong, say so explicitly in a "Challenge to brief" note in your section — do not silently diverge.

## Problem
Caterpillar "Smart Operator Assistant" hackathon. Five non-negotiable requirements:
- R1 Daily task dashboard (scheduled tasks, progress, operating info)
- R2 Operator safety (seatbelt compliance, proximity hazards, incident logging, working conditions) — PRIMARY FOCUS
- R3 Training hub (e-learning, instructor booking, simulation, expert demos)
- R4 Unusual-behavior detection (excessive idling, unsafe operating patterns; separate machine vs operator)
- R5 Task-time estimation (historical data + environment, with uncertainty)

Product name: **CAT Sentinel — Safety-First Operator Copilot**. Closed loop: Observe → Understand → Predict → Explain → Intervene → Train → Evaluate → Adapt.
Innovation = the closed loop connecting detected recurring behavior → competency gap → targeted training → measured re-assessment. Not model count.

## Data assumption (user decision, 2026-09-23) — overrides the tiering below for implementation
For every function we implement we may assume the required data is **available and clean** (well-formed, time-synchronised, correct units), including all Tier B CAN signals (engine speed, throttle, travel speed, gear, hydraulic pressures, joystick/implement commands, seatbelt, brakes, swing, parking brake), Tier C proximity, operator IDs and task labels. Validate schema at boundaries only; no imputation pipelines. Honesty rules still apply: demo data is SIMULATED, and the pitch states "assumes a clean data feed; Cat system integration is future work".

## Training showcase (user decision, 2026-09-23)
R3's centrepiece is the **Practice Analyser**: a trainee's control inputs (simulator/practice machine/upload) are scored against an **Expert Motion Model pre-trained on data from highly professional operators** (SIMULATED expert data in the prototype). It segments the work cycle into phases, compares each movement with the expert envelope, scores expert-likeness, and gives specific, phase-level coaching on how to improve movement and machine handling. Expert data is filtered for safety (no rule violations) before training — fast is not automatically good.

## Data reality (research view; see assumption above)
- No Caterpillar dataset was found in the project. Treat any hackathon-supplied dataset as unknown until inspected. Design must work on (a) whatever columns are supplied and (b) a clearly-labelled SIMULATED telemetry generator.
- Signal tiers (verify/cite where possible):
  - Tier A, typically available via telematics (Cat Product Link / VisionLink; ISO 15143-3 "AEMP 2.0" API): SMU/engine hours, idle hours/idle time, fuel used, GPS location, fault/diagnostic codes, sometimes payload/load counts.
  - Tier B, plausible on the machine CAN bus (SAE J1939) but not guaranteed in a hackathon dataset: engine speed, throttle, travel speed, gear, hydraulic pressures, implement/joystick commands, seatbelt switch, brake, swing, parking brake.
  - Tier C, optional add-on hardware: proximity/object detection (radar/camera, e.g., Cat Detect), wearables, in-cab driver-monitoring camera.
  - Tier D, unavailable: fatigue ground truth, near-miss labels, verified competency labels.
- All numeric results produced on simulated data must be labelled SIMULATED.

## Fixed MVP scope
- P0 (mandatory): React dashboard; pre-shift checklist; deterministic seatbelt + proximity-threshold rules; incident log (auto-created from rule events + manual entry); excessive-idle detection (rule with context gating, e.g., "waiting for truck" task state); per-(machine type × task type) Isolation Forest on 10–30 s windowed telemetry features; training hub (modules, quizzes, mock instructor booking); task-time estimate via LightGBM quantile regression (P10/P50/P90) with split-conformal calibration.
- P1 (differentiating): context-aware risk fusion (deterministic rules layer + ML anomaly score + context gating); explanations as feature deviations vs baseline (SHAP on a surrogate or per-feature z-scores); competency catalog + event→competency mapping with a recurrence threshold (e.g., ≥3 events across ≥2 shifts, context-normalized); RAG over curated, versioned training docs with mandatory citations (extractive-only fallback); before/after re-assessment of the targeted behavior.
- P2 (research / future): full operator digital twin (MVP has only a lightweight "operator profile": per-operator baseline stats + competency states + training history); temporal models (GRU/TCN autoencoder); fatigue-risk indicator (research hypothesis only, never a diagnosis); multimodal fusion; edge optimization (ONNX Runtime on an industrial PC / Jetson-class device).
- Explicitly OUT: computer vision built by the team, RL, autonomous machine control, blockchain, multi-agent LLM systems.

## Safety principles
- Critical protections (seatbelt unbuckled while moving, person/object inside proximity zone, over-speed) are deterministic, independently testable, never suppressed, never depend on ML.
- ML is decision support only; it never sends machine-control commands.
- Alert tiers: T-CRIT deterministic immediate; T1 advisory (in-cab, rate-limited); T2 elevated-risk (audible, ack required); T3 recommended safe stop/break; T4 supervisor escalation; T0 informational coaching (post-shift only, never in-cab while moving).
- No automatic employment or authorization decisions from risk scores. Operator sees their own data; privacy by design.
- Edge-first: safety rules and anomaly inference run on the edge; cloud sync optional; system must degrade gracefully offline.

## Prototype stack (default; justify or challenge)
Python 3.11, FastAPI, MQTT (Mosquitto) from telemetry simulator → edge service, SQLite for edge (PostgreSQL/TimescaleDB for cloud/fleet), React + Vite + Tailwind dashboard, scikit-learn, LightGBM, SHAP, ONNX Runtime for edge, FAISS or Chroma for RAG, an LLM API with a citation-enforcing prompt. Redis only if justified.

## Demo journey (fictional operator "Ravi", novice, 320D-class excavator, fictional site)
Shift 1: dashboard shows tasks + pre-shift checks + required training → operation (SIMULATED telemetry) → T-CRIT seatbelt alert; repeated high approach/swing speed near truck-loading zone → contextual T1/T2 alerts with explanations; excessive idle flagged but context-suppressed during "waiting for truck" → incident log.
Post-shift: recurring pattern → "approach & swing control" competency gap → microlearning module (RAG-grounded, cited) + quiz + instructor booking.
Shift 2 (SIMULATED): measurably fewer events → competency state updated. Task-time estimate shown with P10–P90 interval throughout.

## Team / time assumptions
4-person AI-focused team, 36–48 hour hackathon.

## Writing rules for sections
- Tag claims: [ESTABLISHED] (with citation), [HYPOTHESIS], [PROPOSED], [SIMULATED].
- Cite primary sources (papers, official Caterpillar/standards pages) with URLs. Never invent citations; if unsure, say "unverified".
- Quote at most one short phrase per source; summarise instead.
- Concise, technical, implementation-oriented. Tables over prose where possible.
