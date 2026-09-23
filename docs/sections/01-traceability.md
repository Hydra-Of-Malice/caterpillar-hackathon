# 01 — Requirement traceability

Every feature must trace back to a Caterpillar requirement (R1–R5) and forward to a demonstrable, measurable outcome. Anything that cannot is deferred or rejected (see the final table).

Tags:
- Feasibility ratings are [PROPOSED].
- Any metric measured on generated telemetry is [SIMULATED].
- Data tiers follow the design brief: A = telematics, B = CAN, C = add-on hardware, D = unavailable.

## Traceability matrix

| Caterpillar requirement | Real-world operator problem | Proposed feature | Data required | AI or deterministic method | MVP feasibility | Demonstration | Success metric |
|---|---|---|---|---|---|---|---|
| R1 Daily task dashboard | Shift starts from a verbal or paper briefing, and priorities are unclear | Daily task list with progress bars and a live task state | Schedule/dispatch (mock JSON). Load/cycle counts if supplied (Tier A) | Deterministic | P0 – High | Ravi's dashboard shows 3 tasks, and progress advances from the replay | 100% of scheduled tasks render. Progress lag < 5 s [SIMULATED] |
| R1 | Pre-start walk-arounds get skipped or pencil-whipped | Digital pre-shift checklist that gates the "ready" state. A defect creates an incident | Checklist template from the OEM operation manual, plus operator input | Deterministic | P0 – High | Ravi completes the checklist. One flagged defect appears in the incident log | Completion before first movement. Median completion time. Defects logged = defects entered |
| R1 | Operating information is scattered (hours, fuel, faults, conditions) | Operating-info panel: SMU, fuel, active fault codes, working conditions | Tier A telematics. Weather feed or manual entry | Deterministic | P0 – High | Fields come from the supplied dataset. Anything missing is badged SIMULATED | Share of panel fields sourced from real data, reported honestly |
| R2 Operator safety | Unbelted operation raises the risk of ejection in a rollover | Seatbelt-while-moving T-CRIT advisory, with sensor-health and stale-data checks | Tier B seatbelt switch + travel speed/gear | Deterministic rule | P0 – High on sim. Real use depends on the signal existing | Unbuckle event in the replay → T-CRIT, which cannot be suppressed | 100% pass on the boundary/NaN/stuck-at rule suite. End-to-end p99 latency < 500 ms on demo hardware [SIMULATED] |
| R2 | People or vehicles enter the swing or travel path | Proximity-zone T-CRIT advisory that consumes detections from a Cat Detect-class system (no in-house CV) | Tier C detections (distance, bearing, class) | Deterministic rule | P0 – simulation only | Person enters the zone → T-CRIT. A stale sensor → "PROTECTION DEGRADED" | 100% rule-suite pass. The degraded state appears within 1 s of data going stale [SIMULATED] |
| R2 | Incidents and near-misses are under-reported, and context is lost | Incident log created automatically from rule events, plus manual entry with a telemetry snapshot | Rule events, ±30 s telemetry window, operator notes | Deterministic | P0 – High | T-CRIT auto-creates an incident. Ravi adds a near-miss manually | 100% of T-CRIT events logged. Manual entry < 60 s |
| R2 | Heat, dust and long hours without breaks raise risk | Working-conditions and **fatigue-exposure** indicator (hours on shift, time since last break, temperature) | Shift clock, break log, weather feed | Deterministic thresholds from site policy (not ML) | P1 – High | Banner after N hours without a break [SIMULATED] | Indicator matches the site-policy table in tests. No person is ever labelled "fatigued" |
| R3 Training hub | Training is generic and not tied to what the operator actually did | Module library with quizzes and completion tracking | Curated content, quiz bank | Deterministic | P0 – High | Ravi opens a required module and takes the quiz | Completion rate, quiz score |
| R3 | Instructor time is hard to schedule | Mock instructor booking, pre-filled with the competency gap | Instructor calendar (mock) | Deterministic | P0 – High | Booking created from the post-shift gap card | Booking in 3 clicks or fewer. The gap context is attached |
| R3 | Training is disconnected from field behaviour | Competency catalog + event→competency mapping → targeted microlearning via cited RAG | Event history, competency catalog, versioned document corpus | Deterministic mapping + LLM RAG (extractive fallback) | P1 – Medium | "Approach & swing control" gap → cited micro-module | 100% of published sentences trace to a source span. Instructor-approval flag is set |
| R3 | Simulator and expert demos are not linked to specific gaps | Tagged library of expert demos and external-simulator exercises, recommended by competency | Demo clips/telemetry tagged by machine, task and competency. Instructor sign-off | Deterministic retrieval | P1 – Medium (curation-bound) | The gap card recommends one expert clip and one simulator exercise | Recommendation matches the competency tag. Only approved demos are shown |
| R4 Unusual behaviour | Excessive idle wastes fuel but is hard to separate from legitimate waiting | Idle detection with context gating (e.g., suppressed while "waiting for truck") | Tier A idle time or Tier B engine speed + zero travel. Task state | Deterministic | P0 – High | Idle is flagged, then suppressed during "waiting for truck". Suppression is logged | Flagged idle vs. raw idle per hour. Each operator's suppression rate is auditable |
| R4 | Unusual control patterns go unnoticed because nobody wrote a rule for them | Isolation Forest on 10–30 s windows (one machine type in the MVP) + per-feature z-score explanation | Tier B windowed features (swing rate, travel speed, hydraulic pressure, joystick) | ML (unsupervised) | P0 – Medium (needs Tier B) | Post-shift review queue ranks the top-k windows, each with its "why" | Recall@k on held-out anomaly families [SIMULATED]. On real data: instructor precision@k |
| R4 | Risky approach or swing near the truck-loading zone | Context-aware risk fusion: a rule precondition is required, and the IF score only modulates severity | Swing rate, travel speed, geofence, task state, IF score | Hybrid (deterministic gate + ML severity) | P1 – Medium | Contextual T1 → T2 with an explanation next to the truck | In-cab alerts per operating hour stay within budget. Share rated relevant by the instructor [SIMULATED] |
| R4 | Operators get blamed for machine faults, or the reverse | Machine-vs-operator attribution: sensor-health/fault features scored separately from control-input features | Fault codes (Tier A). Control inputs and sensor diagnostics (Tier B) | Deterministic partition + per-group ML score | P1 – Medium | An event with an active fault code is routed to maintenance, not training | Agreement with scripted scenario labels [SIMULATED] |
| R5 Task-time estimation | Planners and operators get single-point guesses with no uncertainty | LightGBM quantile regression (P10/P50/P90) + conformalized quantile regression (CQR) | Historical task durations, task type, machine, material, weather | ML | P0 – Medium (needs history) | Estimate with an interval on every task card | Empirical 80% coverage within ±5 pts on held-out data. Pinball loss |
| R5 | Nobody knows whether ML beats simple history | Baseline: empirical per-task-type quantiles, shown side by side | Same as above | Statistical (deterministic) | P0 – High | Baseline and model shown together in the model card | Ship LightGBM only if it beats the baseline on pinball loss at equal coverage |
| R5 | Estimates go stale when conditions change mid-shift | Live re-estimate from observed progress rate | Cycle/load counts, elapsed time | Hybrid (remaining work ÷ rate, conformal residuals) | P1 – Medium | The interval narrows as the shift progresses | Width shrinks while coverage holds [SIMULATED] |

## AI justification

Deterministic by design, so not listed below: safety rules, checklist, incident log, idle gating, competency mapping, booking, fatigue-exposure indicator.

| AI feature | Problem solved | Req. | User | Input data | Data available? | Why AI, not rules | Action enabled | Usefulness metric | Hackathon-demonstrable? |
|---|---|---|---|---|---|---|---|---|---|
| Isolation Forest windowed anomaly score | Surfaces control patterns that no existing rule covers | R4 | Instructor (primary). Operator (own data, post-shift) | 10–30 s Tier B feature windows | Only if Tier B is supplied. Otherwise SIMULATED | Multivariate rarity cannot be enumerated as thresholds. Rules still cover the known hazards | Post-shift review queue. Candidate new rules | Instructor precision@k. Recall on held-out simulated families | Yes [SIMULATED] |
| Risk-fusion severity term | Separates the same rule trigger in a risky vs. benign context | R2, R4 | Operator (in-cab). Supervisor (aggregate) | Rule events, IF score, geofence, task state | Partly | **Weak case.** A weighted rule does most of the work, and AI adds only the IF term. Keep the formula simple and inspectable | T1 → T2 escalation | Alert-budget adherence. Share of T2 alerts rated relevant | Yes |
| Machine-vs-operator group scoring | Keeps sensor degradation from being attributed to the operator | R4 | Supervisor, maintenance | Fault codes, sensor diagnostics, control inputs | Fault codes likely. The rest is Tier B | Catches sensor drift that has not yet raised a fault code | Routes the event to maintenance vs. training | Agreement with scripted labels [SIMULATED] | Partly |
| RAG microlearning with verified citations | Turns a detected gap into a short, cited module | R3 | Operator, instructor | Versioned curated corpus + competency ID + event summary | Only if the team curates a licensed corpus | Tailoring prose to a specific pattern. Rules can only pick whole modules | Operator completes a targeted module. Instructor approves it | Unsupported-sentence rate after verification (target 0). Instructor edit rate | Yes, with 20 or fewer chunks |
| LightGBM quantile + CQR | Planning with calibrated uncertainty | R5 | Operator, supervisor, fleet manager | Historical durations + context | Unknown. Likely SIMULATED | Non-linear interactions (material × machine × weather). **It must beat the empirical baseline** | Task sequencing, truck dispatch | Coverage, pinball loss, interval width vs. baseline | Yes |
| Fatigue-risk ML (P2) | Fatigue detection | R2 | — | Behavioural proxies | **No** (Tier D) | Not justifiable without labels | None in the MVP | n/a | No. Replaced by the deterministic exposure indicator |
| GRU/TCN autoencoder (P2) | Temporal anomalies | R4 | Instructor | High-rate sequences | Unlikely | Only if IF demonstrably misses temporal patterns | — | Must beat IF on held-out families | No |

## Rejected / deferred features

| Feature | Status | Reason |
|---|---|---|
| In-house computer vision (person/object detection) | Rejected | Safety perception needs validated hardware and testing (ISO 21815-1, https://www.iso.org/standard/77302.html) [ESTABLISHED]. Consume vendor Tier C outputs instead. Not feasible in 48 h |
| In-cab driver-monitoring camera, emotion or fatigue inference | Rejected (MVP) | No Tier C hardware. The EU AI Act Art. 5(1)(f) safety exception still needs a proportionality case (https://eur-lex.europa.eu/eli/reg/2024/1689/oj) [ESTABLISHED]. Labour-relations risk |
| Fatigue *diagnosis* | Rejected | No ground truth. It would be a medical-style claim. Replaced by the fatigue-*exposure* rule |
| Reinforcement learning (coaching policy or control) | Rejected | No high-fidelity simulator or ungameable reward, and exploration is unsafe |
| Autonomous control, auto-slowdown, motion inhibit | Rejected | Needs ISO 19014 functional safety and OEM integration. The brief rules out ML control commands |
| Blockchain incident ledger | Rejected | No multi-party trust problem. An append-only, hash-chained, signed log gives tamper evidence |
| Multi-agent LLM system | Rejected | Adds non-determinism and failure modes. One retriever plus a verifier is enough |
| Operator leaderboards and rankings | Rejected | Goodhart effects. EU AI Act Annex III(4)(b). ILO code 5.6 |
| In-cab LLM voice assistant while moving | Rejected | Distraction, latency and hallucination. Conflicts with the rule that T0 is post-shift only |
| Team-built VR/3D simulator | Rejected | Link to existing simulators. Out of 48 h scope |
| Full operator digital twin | Deferred (P2) | Needs longitudinal data and increases surveillance exposure. The MVP operator profile is enough |
| GRU/TCN temporal models | Deferred (P2) | Needs more data. Beat the IF baseline first |
| Edge optimisation (ONNX on a Jetson-class device) | Deferred (P2) | The models are tiny. The real blocker is CAN access, not compute |
| Predictive maintenance models | Out of scope | Not in R1–R5. Fault codes are used only for attribution |
| Federated learning across fleets | Deferred | Premature without multi-site data |
