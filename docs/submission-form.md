# CAT Sentinel — Hackathon submission answers
*Status as of 23 Sep 2026, 18:00*

---

## 10. Describe your Solution

**CAT Sentinel — a safety-first operator copilot for CAT excavators.**

Construction and mining face an operator shortage: 77% of firms report they cannot find enough equipment operators (AGC 2025). New operators take months to reach proficiency, and operator skill alone swings machine output by 10–15%. Existing telematics tell a supervisor *what* happened; they rarely explain *why*, and almost never turn it into targeted training.

CAT Sentinel closes that loop on the machine:

**Observe → Understand → Explain → Intervene → Train → Measure → Adapt**

Machine telemetry (10 Hz control inputs, hydraulics, proximity, seatbelt) streams into an edge service in the cab. Deterministic rules handle critical safety advisories — seatbelt, proximity zones, over-speed — in under 0.1 ms, in a process that runs independently of everything else. Machine-learning models sit alongside, not in front: they detect unusual operating patterns in context, explain each one in plain language against the operator's own normal range, and separate machine faults from operator habits.

Recurring, statistically significant patterns become an evidenced competency gap. That gap maps to a short training module, grounded in the site's approved procedures with mandatory citations. After training, the system re-measures the same behaviour on the same task and reports the result with a confidence interval — including when the result is *not yet conclusive*.

The centrepiece is the **Practice Analyser**: a trainee's control inputs are scored against an Expert Motion Model trained on data from highly skilled operators. It segments each work cycle into phases (dig, swing loaded, dump, swing empty), compares every movement against the expert envelope, and returns ranked, phase-level coaching — "slow the swing in the last 5 m before the truck: yours 34°/s vs expert ≤ 20°/s". Safety is a gate, not a trade-off: a cycle with a safety flag cannot score above 60, however fast it is.

All five challenge requirements are covered end to end: daily task dashboard, operator safety, training hub, unusual-behaviour detection, and task-time estimation with honest uncertainty ranges.

---

## 11. Tools & Technology used

**Edge / backend:** Python 3.11, FastAPI (two services: in-cab edge on :8000, cloud on :8100), MQTT (Eclipse Mosquitto) for telemetry and safety alerts, SQLAlchemy 2, SQLite at the edge with store-and-forward sync, WebSockets for live in-cab updates.

**ML / statistics:** scikit-learn (Isolation Forest, Gaussian mixture), LightGBM (quantile regression, phase classification), SciPy, statsmodels, NumPy, pandas, SHAP-style feature attribution, conformal prediction, dynamic time warping.

**LLM / retrieval:** Azure OpenAI (GPT-4o) for the training copilot, with hybrid retrieval (BM25 + TF-IDF, reciprocal rank fusion) over an approved document corpus and a custom per-sentence citation verifier.

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, MQTT-over-WebSocket. Caterpillar's own design tokens, extracted from digital.cat.com, for a dark in-cab theme and a light office theme.

**Simulation:** a physics-lite excavator simulator we built — 10 Hz kinematics, four operator archetypes (expert, intermediate, novice, improving), injectable safety events, and full shift scenarios.

**Infrastructure:** Docker, pytest + Hypothesis (484 automated tests), Git/GitHub.

---

## 12. How are you planning to use AI in building your solution?

**Our governing principle: deterministic rules protect; AI explains, personalises and coaches; AI never controls the machine.** Critical protections cannot be suppressed by a model, and an ML anomaly alone never raises an in-cab alert.

Eight AI/statistical components, each solving a named problem:

1. **Expert Motion Model (the showcase)** — supervised phase segmentation (LightGBM + smoothing), time-normalised expert envelopes (P10–P90) with DTW distance, 15 skill metrics, and a one-class scorer calibrated so the expert median maps to ~85–95. Turns a trainee's raw control inputs into ranked, specific coaching.
2. **Unusual-behaviour detection** — 33 windowed features over 20 s windows, Isolation Forest per machine-and-task context, percentile calibration, and thresholds set by an *alert budget* rather than an arbitrary contamination rate.
3. **Explanation layer** — robust z-scores against the operator's own contextual baseline, so every alert says why in plain language.
4. **Machine-vs-operator attribution** — uncommanded hydraulic pressure and cross-operator patterns route to maintenance, not operator coaching.
5. **Task-time estimation** — LightGBM quantile regression (P10/P50/P90) with conformal calibration, giving an honest range instead of false precision.
6. **Competency gap evidence** — Bayesian Gamma–Poisson on exposure-normalised event rates, so one bad moment never flags anyone; only recurring, statistically supported patterns do.
7. **Training-effect re-assessment** — rate ratio with an exact confidence interval, reported honestly even when the interval spans "no change".
8. **Grounded copilot** — GPT-4o answers *only* from approved site procedures; a verifier checks every sentence against its cited source and falls back to quoting the document verbatim if verification fails. Safety-critical topics are extractive-only. It refuses rather than guesses.

AI also accelerated our build: we used Claude Code to research the domain, generate the simulator and services, and review our own work — every generated component is covered by tests we run.

---

## 13. How is your team approaching this problem

**Safety first, evidence always, honesty as a feature.**

We started by researching the actual problem rather than the technology: what Caterpillar already ships (VisionLink Operator Coaching, Cat Detect), what the published evidence supports, and where the genuine gap is. That research is documented in 16 sections covering feasibility, ML approach selection, human factors, evaluation design, critical risk analysis and business value — with sources cited and every claim tagged as established, hypothesis or assumption.

Three deliberate decisions shaped the build:

**We separated protection from intelligence.** The safety rules run in their own process with no ML imports, enforced by an automated test. If the ML service crashes or the network drops, the safety layer keeps running and the cab shows "protection degraded" rather than silently failing.

**We chose defensible over impressive.** We rejected in-house computer vision, reinforcement learning, autonomous control and fatigue *diagnosis* — that last one because no published evidence validates excavator control data as a fatigue signal. We say so rather than claim it.

**We built the honest version of the numbers.** Our business case uses sourced figures with low/base/high ranges. When our own model showed fleet-wide output uplift of only ~2.7%, we changed the pitch to focus on trainees (+11%) rather than inflate the number.

We worked as parallel specialist tracks — simulator, safety, ML pipeline, practice analyser, edge, cloud, frontend, business value — against a shared written contract of data schemas and API definitions, which let the pieces integrate on first connection.

---

## 14. Key Features and Unique Selling Point of your Product

**USP: the only operator assistant that turns what happens on the machine into evidenced, targeted training — and then proves whether the training worked.**

Operator coaching exists in the market. What we did not find in the sources we reviewed: safety-focused excavator coaching, a competency catalogue fed by field data with auditable evidence per gap, and statistically framed re-assessment of the specific behaviour that was trained.

**Key features:**

- **Practice Analyser** — trainee control inputs scored against an Expert Motion Model, with phase-level coaching, trajectory overlays, and a safety gate that caps unsafe-but-fast cycles.
- **Independent safety layer** — seatbelt, proximity and speed advisories in <0.1 ms, in a process that survives failure of everything else, with a visible "protection degraded" state instead of silent failure.
- **Explainable alerts** — every alert says what, why (against your own normal range) and what to do, in ≤12 words each, with a "not correct?" feedback button that feeds model monitoring.
- **Context-aware idle detection** — waiting for a truck is not wasted time, and the system knows the difference.
- **Evidenced competency gaps** — recurrence thresholds and Bayesian rates, so coaching is never based on a single bad moment.
- **Grounded copilot** — answers only from approved procedures, with citations, or it refuses.
- **Task-time estimates with real uncertainty** — P10–P90 ranges that narrow as the task progresses.
- **Business Value page** — editable assumptions, sourced ranges, per-lever breakdown and payback.
- **Privacy by design** — operators see their own data; supervisors see escalations and team aggregates; no ranking leaderboards; no automated employment decisions.

---

## 15. Milestones achieved as of 06:00 PM on 23rd September 2026

**A complete, running end-to-end system — not slides.**

**Research (complete):** 16 documented sections — requirement traceability, feasibility against what Caterpillar already ships, AI architecture, ML approach comparison, operator profile design, fatigue-risk validation plan, intervention design, training loop, dataset plan, MVP spec, execution roadmap, demo script, evaluation framework, critical risk analysis, novelty assessment and a sourced business-value model. Plus an ML overview written for the judging panel.

**Built and running live:**
- Excavator simulator — 10 Hz telemetry, four operator archetypes, injectable safety events, full shift scenarios
- Independent safety process — seatbelt, proximity, over-speed, sensor-fault detection; p99 latency 52 µs; 146 tests
- Behaviour pipeline — 33 windowed features, procedural rules, context gating, explanations, machine-vs-operator attribution
- Edge API — shift lifecycle, checklist gating, six alert tiers with escalation, incident logging, task-time estimates, offline store-and-forward, live WebSocket
- Cloud API — competency gaps, training modules and quizzes, re-assessment statistics, supervisor views, monitoring
- **Practice Analyser** — phase segmentation, expert envelopes, 15 skill metrics, safety-gated scoring, ranked coaching, cohort simulation
- **Azure OpenAI GPT-4o copilot** — live, answering from approved procedures with verified citations
- React UI — 28 routes across in-cab (dark) and office (light) themes, ported from our Caterpillar-themed designs
- Business value model — sourced assumptions, Monte Carlo ranges, per-lever breakdown
- Expert motion replay — animated side and top view comparing expert vs novice technique

**Quality:** 484 automated tests passing. Full stack running locally: MQTT broker, safety process, simulator, both APIs and the web app. Code on GitHub.

**Headline business case (estimates, sourced):** +11% output per trainee (range 7–18%), −15% avoidable idle hours, ~$5,100 value per machine per year, ~4.6 month payback.

---

## 16. Outstanding milestones planned for the next ~15 hours

**1. Train the ML models on simulated data (~2 h).** All three training pipelines are written and ready — one command. This replaces rule-only mode and the labelled demo fixtures with live model output: Isolation Forest anomaly detection, LightGBM quantile task-time estimation, and the Expert Motion Model scoring real trainee sessions.

**2. Build the Operator Responsiveness Guard (~3 h).** A new AI safety feature: detect a distracted or incapacitated operator from control-input signatures (control gaps, frozen inputs, loss of micro-variance against their personal baseline) plus seat presence. Staged response with a human gate — check-in prompt, then escalation, then a *controlled* safe stop sequenced to avoid creating a new hazard (ramp hydraulics, ground the bucket, park brake, alert nearby machines, escalate to supervisor with location). Deterministic controller, AI detection only.

**3. Validate and measure (~2 h).** Run the evaluation framework against the trained models: event-level precision and recall on injected anomalies, false alerts per operating hour against budget, task-time interval coverage, and expert-vs-novice score separation. Publish the real numbers in the model cards — including any that disappoint.

**4. Demo rehearsal and resilience (~2 h).** Rehearse the seven-beat demo including the live failure test: kill the ML service and drop the network in front of the judges to show safety advisories keep running. Recorded fallback for every beat.

**5. Pitch and documentation (~3 h).** Finalise the judge-facing pitch built around the business case, the traceability matrix and the honest limitations. Polish the Demo Tour page so judges can trigger every outcome themselves.

**6. Buffer (~3 h)** for integration issues and UI polish.

---

## 17. Notice of filming and photography

Acknowledged and agreed.
