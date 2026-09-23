# 14 — Critical risk analysis

Reviewer stance: skeptical (industrial safety + ML). Risks are ranked by likelihood × impact across the **hackathon demo** and a **hypothetical site pilot**. Ratings are reviewer judgement [HYPOTHESIS] unless cited.

## Risk register

| # | Risk | Likelihood | Impact | Hits hardest |
|---|---|---|---|---|
| 1 | Insufficient telemetry, and simulated data that proves itself | Very high | High | Demo credibility |
| 2 | Safety-critical failure, overclaimed safety status, liability | Medium | Critical | Pilot |
| 3 | False alarms, alarm fatigue, "anomalous" read as "unsafe" | High | High | Pilot |
| 4 | Operator surveillance, labour relations, Goodhart effects | High | High | Adoption |
| 5 | Domain shift (site, machine, season, operator) | Very high | Medium–High | Scale-up |
| 6 | Hackathon scope too large | High | High | Demo |
| 7 | No usable fatigue labels (or near-miss or competency labels) | Certain | High if overclaimed | Both |
| 8 | Quality of expert demonstrations | High | Medium | Training loop |
| 9 | Hallucinated training content | Medium | Medium–High | Training loop |
| 10 | Edge compute, CAN access, connectivity | Medium | Medium | Pilot |

---

### 1. Insufficient telemetry, and simulated data that proves itself
- **Description:** Nobody has inspected the supplied dataset yet. If it looks like a telematics export (Tier A, often hourly or daily), it cannot support 10–30 s windows, seatbelt or proximity rules, swing-rate features or task-state context. The gaps then get filled by a simulator that the same team writes. Detectors scored on that simulator mostly recover the anomalies the team injected, from distributions the team picked. That is circular [HYPOTHESIS].
- **Why it matters:** The headline numbers (anomaly recall, fewer events in Shift 2, coverage) become circular. R2 is the primary focus, and it depends on exactly the Tier B/C signals most likely to be missing.
- **Likelihood / impact:** Very high / High.
- **Mitigation [PROPOSED]:**
  - Hour 0–2 audit: map each column to a tier, build a feature-feasibility matrix and show it in the pitch.
  - Two visibly separate tracks. The real-data track uses supplied columns only. The simulated track is watermarked SIMULATED.
  - The person who writes the injectors does not tune the detectors. Keep some anomaly families held out from tuning. Inject noise, dropouts, stuck-at sensors and clock skew.
- **Residual limitation:** Circularity can be reduced but not removed. Simulated metrics show that the pipeline works, not that it detects real unsafe behaviour. The slides must say so.

### 2. Safety-critical failure, overclaimed safety status, liability
- **Description:**
  - *False negatives:* a faulty seatbelt switch that reads "buckled", a mud-blocked proximity sensor, GPS multipath near pit walls.
  - *Rule defects:* unit or threshold errors, the wrong speed signal, a state machine that suppresses re-alerts.
  - *Latency:* the MQTT → Python → WebSocket → React chain has no timing bound. At ~10 rpm swing and ~9 m reach the bucket tip moves ~9.4 m/s, so 500 ms of latency is about 4.7 m of travel [HYPOTHESIS; illustrative, not a Cat 320 spec].
- **Why it matters:** The brief calls these rules "critical protections". Functional safety for earth-moving machinery is governed by ISO 19014 [ESTABLISHED] (https://www.iso.org/standard/70715.html). Collision warning and avoidance is covered by ISO 21815-1:2022 [ESTABLISHED] (https://www.iso.org/standard/77302.html). A Python service on a non-rated PC meets neither. If a site relies on it and it fails silently, it is unclear who is liable, and operators may already have grown complacent [HYPOTHESIS].
- **Likelihood / impact:** Medium / Critical.
- **Mitigation [PROPOSED]:**
  - Reframe T-CRIT as the *highest-priority advisory*, which mirrors OEM interlocks and certified detection systems and never replaces them.
  - Add a watchdog: stale data or bad sensor health shows a persistent "PROTECTION DEGRADED" state, never green. An unknown seatbelt state while moving raises an alert.
  - Run the rules in a separate process from ML, with table-driven and property-based tests (boundaries, NaN, stuck-at).
  - Measure p50/p99 end-to-end latency live in the demo.
- **Residual limitation:** This is still not a safety function. No risk-reduction claim is possible without an ISO 19014-style analysis and OEM integration. Liability is a contractual question outside hackathon scope.

### 3. False alarms, alarm fatigue, "anomalous" read as "unsafe"
- **Description:** Isolation Forest scores how statistically rare a window is, not how hazardous it is (Liu, Ting & Zhou, ICDM 2008, doi:10.1109/ICDM.2008.17) [ESTABLISHED]. Novices, legitimate but unusual work and sensor faults all score as anomalous. Risky habits shared by the whole crew score as normal. The `contamination` parameter fixes the alert rate by fiat.
- **Why it matters:** Once operators learn to ignore nuisance alerts, trust in T-CRIT erodes too. The process-industry EEMUA 191 benchmark is under one alarm per 10 min per operator [ESTABLISHED] (https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/white-papers/February%2028%202005%20-%20Acheiving%20Effective%20Alarm%20System%20Performance%20Benchmarking.pdf). An operator actively controlling a machine probably tolerates far fewer [HYPOTHESIS].
- **Likelihood / impact:** High / High.
- **Mitigation [PROPOSED]:**
  - An ML score alone never raises an in-cab alert. T1/T2 need a rule precondition (e.g., in the loading zone AND swing rate above threshold), and ML only adjusts severity.
  - Enforce a per-operator hourly alert budget, with hysteresis and de-duplication. Everything else goes to T0 post-shift review.
  - Score machine-health features separately from operator control-input features.
- **Residual limitation:** With no near-miss labels, precision cannot be measured. The alert budget is a design choice, not a validated threshold.

### 4. Operator surveillance, labour relations, Goodhart effects
- **Description:** Per-operator baselines, event counts and competency states amount to behavioural monitoring.
  - *EU AI Act:* AI that monitors and evaluates workers' "performance and behaviour" is high-risk under Annex III(4)(b) [ESTABLISHED] (https://artificialintelligenceact.eu/annex/3/). Inferring emotions at work is banned except for medical or safety reasons, Art. 5(1)(f) (https://eur-lex.europa.eu/eli/reg/2024/1689/oj).
  - *GDPR:* Art. 88 lets member-state law or collective agreements add rules for employee data, explicitly including workplace monitoring systems [ESTABLISHED] (https://eur-lex.europa.eu/eli/reg/2016/679/oj).
  - *Germany:* works councils co-determine the introduction of monitoring devices, BetrVG §87(1) Nr. 6 [ESTABLISHED] (https://www.gesetze-im-internet.de/betrvg/__87.html).
  - *ILO code of practice (non-binding):* advance notice of monitoring (6.14(1)). Continuous monitoring only for health, safety or property (6.14(3)). Monitoring data must not be the sole basis of performance evaluation (5.6). Workers' representatives consulted before monitoring starts (12.2) [ESTABLISHED] (https://www.ilo.org/publications/protection-workers%E2%80%99-personal-data-ilo-code-practice).
  - *Goodhart effects:* once scores carry consequences, operators optimise the indicator: selecting "waiting for truck" to silence idle flags, slowing only inside the geofence, rushing quizzes [HYPOTHESIS].
- **Why it matters:** Unions and works councils can block a deployment. Gaming corrupts the closed-loop metric that the pitch rests on.
- **Likelihood / impact:** High / High.
- **Mitigation [PROPOSED]:**
  - Purpose limited to safety and training. Operators see their own data first.
  - Supervisors see crew-level, context-normalised trends only. No leaderboards.
  - Retention limits. A DPIA template (GDPR Art. 35). Operators can contest events. Co-design with workers' representatives.
  - Cross-check self-selected task states against telemetry, and audit each operator's suppression rate.
- **Residual limitation:** An employer can repurpose any operator-level data. Non-EU regimes are not analysed here.

### 5. Domain shift (site, machine, season, operator)
- **Description:** Baselines come from one site, one machine configuration and one crew. Attachment, hydraulic tuning, material, bench geometry, temperature (cold-start idling), operator mix and CAN-scaling firmware all vary.
- **Why it matters:** Both the IF false-alarm rate and interval coverage degrade. Split-conformal guarantees assume calibration and test data are exchangeable (Angelopoulos & Bates, https://arxiv.org/abs/2107.07511) [ESTABLISHED]. A new site breaks that assumption silently.
- **Likelihood / impact:** Very high / Medium–High.
- **Mitigation [PROPOSED]:**
  - Stratify by machine × task × site, with minimum-sample fallback to coarser strata.
  - Monitor drift (PSI/KS, rolling coverage). Use Mondrian conformal with rolling recalibration.
  - New sites run in *cold-start mode*: rules only, ML hidden until N baseline hours are collected.
- **Residual limitation:** Drift detection lags. The first weeks at a new site run on weak baselines.

### 6. Hackathon scope too large
- **Description:** P0 alone has eight components, and P1 adds five more. Four people over 36–48 h is roughly 120–150 productive person-hours [HYPOTHESIS].
- **Why it matters:** Integration fails late, the live demo breaks, and judges see breadth without depth.
- **Likelihood / impact:** High / High.
- **Mitigation [PROPOSED]:** Seeded replay file instead of a live simulator. One machine type and two task types. Z-score explanations instead of SHAP. RAG over 20 or fewer chunks, extractive by default. Feature freeze at T−12 h. A pre-recorded fallback video.
- **Residual limitation:** The P1 closed loop is both the stated innovation and the likeliest thing to be cut. Cut P0 polish first.

### 7. No usable fatigue labels (or near-miss or competency labels)
- **Description:** Tier D. Fatigue has no ground truth, and behavioural proxies are confounded by task and skill. Near-miss and verified-competency labels are also absent.
- **Why it matters:** An unvalidated "fatigue score" reads as a fitness-for-duty or medical judgement. No supervised model on these targets is possible.
- **Likelihood / impact:** Certain / High if overclaimed.
- **Mitigation [PROPOSED]:** A deterministic *fatigue-exposure* indicator (hours on shift, time since last break, night-shift window) based on site policy. Never label a person "fatigued". Competency states are "observed-behaviour indicators" that need instructor confirmation.
- **Residual limitation:** Exposure rules ignore individual variation. Real validation needs a consented human-subjects study.

### 8. Quality of expert demonstrations
- **Description:** "Expert demos" assume experts are safe and consistent. In reality styles vary, shortcuts get ingrained, and productivity technique (fast swing over trucks) can conflict with safety.
- **Why it matters:** Novices get trained toward expert habits, shortcuts included. And departing from what an expert does is not the same as being unsafe.
- **Likelihood / impact:** High / Medium.
- **Mitigation [PROPOSED]:** Reference behaviour comes from documented procedures and the OEM manual first, with expert data second. An instructor signs off each demo. Show a multi-expert envelope, and exclude expert windows that trigger rules.
- **Residual limitation:** Curating expertise is human work that a hackathon can only mock.

### 9. Hallucinated training content
- **Description:** LLM microlearning can invent procedures or thresholds and misattribute citations. Commercial RAG legal-research tools hallucinated on 17–33% of queries (Magesh et al., https://arxiv.org/abs/2405.20362) [ESTABLISHED].
- **Why it matters:** Wrong safety guidance is worse than none, and a citation makes it look trustworthy.
- **Likelihood / impact:** Medium / Medium–High.
- **Mitigation [PROPOSED]:** Enforce citations in code, not in the prompt. Check every sentence against the retrieved spans (lexical overlap + NLI) and drop any that fail. Numbers and procedure steps are extractive only. An instructor approval queue gates publication, and the corpus is versioned.
- **Residual limitation:** Entailment checkers make errors, and approval queues get rubber-stamped.

### 10. Edge compute, CAN access, connectivity
- **Description:** Inference for IF and LightGBM is cheap [HYPOTHESIS]. The binding limits are elsewhere:
  - OEM or dealer gateway access and data rights to read the CAN bus.
  - Ruggedised hardware.
  - Update and version management.
  - Offline periods.
  - Python's non-deterministic timing.
- **Why it matters:** Without OEM integration, "edge-first" may not be buildable.
- **Likelihood / impact:** Medium / Medium.
- **Mitigation [PROPOSED]:** The edge runs rules, IF and z-scores only. LLM/RAG is cloud-only and post-shift. Use store-and-forward. Record the model hash in every event.
- **Residual limitation:** A hackathon cannot validate CAN integration or ruggedisation.

---

## Challenges to the brief

| # | Brief decision | Problem | Recommended change |
|---|---|---|---|
| C1 | Rules are called "critical protections" | Not an ISO 19014 safety function, and latency is unbounded (Risk 2) | Rename them "safety advisories that mirror OEM systems". Add a latency budget, a heartbeat and a "PROTECTION DEGRADED" state. Put an explicit non-claim on the slide |
| C2 | R2 is PRIMARY but relies on Tier B/C signals | These are the signals least likely to be in the dataset | Add a **Tier-A-only R2 path**: GPS geofence dwell, safety-relevant fault codes, shift exposure, working conditions, incident logging |
| C3 | Isolation Forest per (machine × task) | Tier A has no task labels, and strata will be sparse | One machine type. Task comes from the R1 schedule or operator selection, flagged as self-report and cross-checked against telemetry. Machine-level fallback |
| C4 | ML score feeds in-cab T1/T2 | Anomalous ≠ unsafe, which drives alarm fatigue | ML never raises an in-cab alert on its own. It adjusts severity and fills the T0 queue |
| C5 | Shift 2 "measurably fewer events" | Scripted on simulated data, so it proves nothing | Label it a SIMULATED plumbing demo. Add a pre-registered protocol: exposure-normalised rates in matched contexts, a comparison group, and named confounders (regression to the mean, Hawthorne effect) |
| C6 | Gap trigger "≥3 events across ≥2 shifts" | Arbitrary and not exposure-normalised. Most novices will trip it | Test the rate per operating hour against a reference with a confidence bound (Poisson), plus instructor confirmation |
| C7 | Per-operator profile + task-time estimates | Amounts to performance evaluation (Annex III(4)(b), ILO 5.6) | Task-time uses machine, task and environment features only. Operator effects are visible to the operator alone. No rankings |
| C8 | Fatigue indicator as ML (P2) | No labels, and it invites medical-style claims | Promote a deterministic fatigue-exposure indicator to P1. Leave ML fatigue out of the pitch |
| C9 | "Citation-enforcing prompt" | A prompt enforces nothing | Enforce citations in code with span verification and instructor approval. Extractive mode is the default |
| C10 | LightGBM quantile regression + split-conformal | Quantiles can cross, and there is no proof it beats a trivial baseline | Use CQR (Romano et al., https://arxiv.org/abs/1905.03222) with Mondrian strata. Ship the empirical-quantile baseline if LightGBM loses on pinball loss |
| C11 | SHAP on a surrogate for IF | Explains the surrogate, not the detector | Per-feature z-scores by default. SHAP only if time remains |
