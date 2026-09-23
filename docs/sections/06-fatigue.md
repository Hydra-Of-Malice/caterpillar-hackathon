# 06 — Fatigue-risk research and validation plan

**Status: P2 research only.** Nothing in this section is used to make an in-cab safety decision in the MVP. The only fatigue-related thing that runs in the demo is a deterministic time-on-task and break-history reminder (see §7).

Tags: [ESTABLISHED] cited · [HYPOTHESIS] untested · [PROPOSED] our design choice · [SIMULATED] synthetic data.

---

## 1. Evidence review

### 1.1 Vehicle-control (steering) measures

| Source | Setting / N | Signal & method | Ground truth | Result | What it means for an excavator |
|---|---|---|---|---|---|
| Sayed & Eskandarian 2001, *Proc. IMechE D* 215(9) ([link](https://www.researchgate.net/publication/245390750_Unobtrusive_drowsiness_detection_by_neural_network_learning_of_driver_steering)) | Simulator, 12 drivers, varied sleep deprivation | Steering angle with road curvature removed, binned by amplitude; ANN | Sleep-deprivation condition | About 88% / 90% classification of drowsy vs awake [ESTABLISHED] | They removed road-driven steering first. We would need the equivalent: remove task-driven control input before looking at the operator (§3). |
| Krajewski et al. 2009, Driving Assessment Symposium ([TRID](https://trid.trb.org/view/918391)) | Sleep-deprivation study, n=12 | Slow-drift and fast-correction steering features | Fatigue level | 86.1% for slight vs strong fatigue [ESTABLISHED] | Very small N, two extreme classes, single study. The number is an upper bound. |
| McDonald, Lee, Schwarz & Brown 2014, *Human Factors* 56(5) ([doi](https://doi.org/10.1177/0018720813515272)) | NADS simulator, 72 participants | Random forest on steering-wheel angle | Drowsiness-related lane departures | Beat PERCLOS on accuracy and AUC; similar PPV; predicts departures about 6 s ahead [ESTABLISHED] | The label is an *event* (lane departure), not a state. Excavators have no lane. The closest analogue is a control-error event (§4). |
| Forsman et al. 2013, *Accid. Anal. Prev.* 50 ([PubMed](https://pubmed.ncbi.nlm.nih.gov/22647383/)) | 29 night-shift vs 12 day-shift, simulator | 87 candidate metrics | Moderate fatigue from shift work | Steering-variability metrics detected *moderate* drowsiness [ESTABLISHED] | Supports looking for early, moderate change rather than waiting for microsleeps. |
| Nakayama et al. 1999, SAE 1999-01-0892 ([SAE](https://saemobilus.sae.org/papers/development-a-steering-entropy-method-evaluating-driver-workload-1999-01-0892)) | Driving with secondary tasks | Steering entropy (prediction-error entropy) | Dual-task and subjective workload | Entropy rises with **workload** [ESTABLISHED] | **This is a confounder, not support.** Entropy also rises with task difficulty and distraction. |
| Markkula & Engström 2006, ITS World Congress ([eprint](https://eprints.whiterose.ac.uk/131534/)) | Secondary-task studies | Steering reversal rate (SRR) | Visual and cognitive load | SRR and entropy were the most load-sensitive metrics [ESTABLISHED] | Same caveat: SRR measures *load*. We need a context model to tell load apart from fatigue. |
| Liu, Hosking & Lenné 2009, *J. Safety Res.* 40(4) ([PubMed](https://pubmed.ncbi.nlm.nih.gov/19778647/)) | Review | Vehicle measures (lateral position / SDLP, steering) | — | Most studies average across drivers and use simple tasks. Individual differences are not well covered [ESTABLISHED] | Use within-operator models, not a population threshold. |
| Hallvig et al. 2013, *Accid. Anal. Prev.* 50 ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0001457512003521)) | Same 10 drivers, real road vs moving-base simulator | Subjective and physiological sleepiness, driving performance | KSS, EEG/EOG | The simulator produced *more* sleepiness than real driving [ESTABLISHED] | Thresholds set in a simulator will not transfer 1:1 to the field. Expect more false positives or shifted cut-points. |
| Perkins et al. 2021/22, IEEE ([arXiv](https://arxiv.org/abs/2109.08355)) | Survey | All modalities | — | Main barriers: late detection, differences between subjects, subjective KSS labels, little on-road data. Vehicle-based commercial systems may not be accurate enough [ESTABLISHED] | Real-world false positives are the main risk. Design the output to tolerate them (§6). |

### 1.2 Driver-monitoring cameras and mining

| Source | Finding | Tag |
|---|---|---|
| Dinges & Grace 1998, FHWA-MCRT-98-006 ([ROSA P](https://rosap.ntl.bts.gov/view/dot/113)) | Of the measures tested, PERCLOS (share of time the eyes are ≥80% closed) was the most reliable and valid alertness measure against PVT lapses. | [ESTABLISHED] |
| Cat MineStar DSS (Seeing Machines), trade press ([International Mining 2024](https://im-mining.com/2024/02/08/cat-dss-evolving-and-growing-rapidly/); [Mining Review](https://www.miningreview.com/health-and-safety/caterpillar-to-deliver-fatigue-and-distraction-monitoring-system/)) | A camera tracks eye-closure duration and head pose. Alerts use seat vibration and audio. A 24/7 monitoring centre handles escalation. The roughly 80% reduction in fatigue/distraction events is **vendor-reported and not independently verified**. | [ESTABLISHED] for the design; effect size unverified |
| Monash MUARC field study, trucking ([Monash](https://www.monash.edu/news/articles/world-first-study-tests-distraction-and-fatigue-in-truck-drivers)) | 100+ drivers, about 1.5 M km. Camera DMS detected fatigue before safety-critical events. This is road haulage, not mining. | [ESTABLISHED] |
| Talebi, Rogers & Drews 2022, *Mining* 2(3) ([MDPI](https://www.mdpi.com/2673-6489/2/3/29)) | Operational and environmental data from haul-truck fleets were used as leading indicators of camera-detected fatigue events, with models per individual. PERCLOS systems ignore those work factors. | [ESTABLISHED] |
| Haul-truck drivers, first vs second night shift, *Chronobiol. Int.* 39(6) 2022 ([T&F](https://www.tandfonline.com/doi/abs/10.1080/07420528.2022.2034838)) | PVT lapses and simulator violations were worst at the **end of the second night shift**. The first night showed little start-to-end change. KSS, PVT and a truck simulator were used together. | [ESTABLISHED] |
| "65% of haul-truck accidents are fatigue-related" (widely attributed to Caterpillar) | No primary source found. **Do not use.** | unverified |

### 1.3 Time-on-task vs time-of-day

| Effect | Evidence | Tag |
|---|---|---|
| Time on shift | Risk rises roughly exponentially after the 8th hour. The 12th hour carries more than twice the risk of the first 8 hours (Folkard & Tucker 2003, [Occup. Med.](https://academic.oup.com/occmed/article-pdf/53/2/95/4362669/kqg047.pdf)). | [ESTABLISHED] |
| Time since break | Risk more than doubles over about 2 h of continuous work. Breaks reduce risk (same source). | [ESTABLISHED] |
| Successive nights | Risk rises over consecutive shifts, faster on nights (same source; consistent with the haul-truck N1/N2 study above). | [ESTABLISHED] |
| Circadian low | The window around 02:00–06:00 is the expected high-risk period. **Model it as a covariate; do not claim it from telemetry.** | [HYPOTHESIS] for our data |

### 1.4 Construction-equipment operators

| Source | Finding | Caveat |
|---|---|---|
| Li et al. 2019, *Autom. Constr.* 109:103000 ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0926580519304066)) | Wearable eye-tracking classified mental fatigue from long operating tasks. Bi-LSTM reported about 99.9% accuracy [ESTABLISHED]. | Accuracy this high suggests leakage within subjects or sessions. Treat as a proof of feasibility, not a benchmark [HYPOTHESIS]. |
| Li et al. 2019, *Autom. Constr.* ([ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0926580518312792)) | Hazard-detection ability declined with mental fatigue, measured by eye-movement metrics [ESTABLISHED]. | Tier C hardware (eye tracker). Not machine telemetry. |

**Bottom line:** there is no published validation of *excavator machine-control telemetry* as a fatigue indicator that we could find. Everything below is a hypothesis to test.

---

## 2. What machine-control telemetry can and cannot tell us

| Can observe (Tier A/B) | Cannot observe |
|---|---|
| Time-on-task, time since last break (parking brake / hydraulic lockout), clock time, shift ordinal (from roster) | Sleep history, hours awake, sleep debt |
| Changes in control smoothness, correction rate and cycle-time variability **relative to the operator's own baseline** | Alertness, microsleeps (unless a long input gap happens during an active phase) |
| Unusual input gaps during active work phases | Whether the cause is fatigue, distraction, boredom, workload, illness, medication, or a machine problem |
| Response latency to a machine-visible event, e.g., truck-in-position, if that signal exists | Internal state. Any claim beyond "behaviour changed" is inference. |

---

## 3. Confounders and controls

| Confounder | How it mimics fatigue | Control [PROPOSED] |
|---|---|---|
| Task type (trenching, truck loading, grading) | Different control patterns and entropy | Compute features **per task segment**, normalised to that (operator × task) baseline. Stratify the model by task. |
| Task difficulty / precision demand | More corrections, higher entropy (Nakayama; Markkula) | Task-difficulty covariate (dig depth, target tolerance, near-truck flag). Compare only like-for-like segments. |
| Material (rock, clay, wet soil) | Longer cycles, jerky breakout | Material class from the job plan or bucket-fill proxy as a covariate. Features conditioned on material. |
| Terrain / slope / ground | Travel corrections, stability pauses | Terrain class and pitch/roll covariate if available. Exclude travel phases from control features. |
| Machine condition | Hydraulic lag leads to operator over-correction | Fault codes and hydraulic-pressure health covariate. **Exclude windows with active faults.** Machine-vs-operator separation per R4. |
| Experience / skill | Novices have high variability at baseline | Within-operator baselines only. **Disable the indicator until ≥20 h of baseline** for that task. |
| Learning effects | Variability falls over weeks; within a shift, warm-up improves then fatigue worsens | Operator-level trend term (log cumulative hours). Drop the first 20 min of shift (warm-up) from baseline. |
| Weather / visibility / night lighting | Slower, more cautious control | Visibility and precipitation covariate (weather API or manual flag). Night lighting is confounded with circadian phase, so this needs a simulator to separate. |
| Shift schedule / time of day | *A cause of fatigue*, not only noise | Keep as an explanatory covariate. **Do not adjust it away.** Report ToT and circadian effects separately. |
| Truck availability / queueing | Idle and pause patterns | Context gating: exclude "waiting for truck" states (brief P0 rule). |
| Radio / secondary tasks | Workload spikes | Exclude windows around PTT activity if the signal exists. Otherwise note as a residual confounder. |

---

## 4. Hypothesis, features, statistical model

### 4.1 Features [HYPOTHESIS] (Tier B; computed per active work segment, 30–60 s windows)

| Feature | Definition | Expected change under fatigue |
|---|---|---|
| Control entropy (per joystick axis) | Nakayama-style entropy of second-order prediction error of the command signal | ↑ |
| Micro-correction rate | Command reversals > θ° per minute of active control (SRR analogue) | ↑ or ↓ (fatigue may cause sparse, large corrections) |
| Swing stop-position variability | SD of swing angle at dump or return endpoints | ↑ |
| Cycle-time CV | Coefficient of variation of dig-swing-dump-return cycle time within a segment | ↑ |
| Input-gap events | No command > 3 s during an active phase that is not a waiting state | ↑ (lapse proxy) |
| Event response latency | Time from truck-in-position to first swing command (if signal exists) | ↑ (closest PVT analogue) |
| Composite **CVI** | Mean of per-feature within-operator z-scores after the context residualisation in §4.3 | ↑ |

### 4.2 Hypotheses

- **H1 (primary):** For the same operator and task stratum, after adjusting for task difficulty, material, terrain, machine health, visibility and the learning trend, the residualised CVI **rises with time since last break** (β_ToT > 0). CVI also discriminates independently measured high sleepiness (KSS ≥ 7) from low (KSS ≤ 5) with leave-one-subject-out **AUC ≥ 0.70**.
- **H0:** β_ToT ≤ 0, or the LOSO AUC 95% CI includes 0.60, meaning no useful association beyond context.
- **Pre-registration:** feature definitions, windows, exclusions and thresholds are frozen before the validation data are unblinded. One-sided α = 0.05 for β_ToT. Holm correction across the six component features.

### 4.3 Model [PROPOSED]

1. **Context model (residualisation):** gradient-boosted or linear model of each feature using the context covariates only, fitted on rested and early-shift data. Residual r = observed − expected.
2. **Mixed-effects test of H1:**
   `CVI_ijt = β0 + β1·ToT + β2·sin/cos(clock) + β3·shift_ordinal + γ·context + δ·log(cum_hours) + u0_i + u1_i·ToT + ε`
   with operator random intercept u0_i and random ToT slope u1_i (statsmodels `MixedLM` or R `lme4`). Validation outcomes: ordinal mixed model for KSS, negative-binomial GLMM for PVT lapses.
3. **Online detection (prototype only):** within-operator z-score of residual CVI → Bayesian online change-point detection (Adams & MacKay 2007, [arXiv](https://arxiv.org/abs/0710.3742)) or CUSUM. A flag requires P(change) > 0.8 **and** a sustained shift ≥ 10 min **and** ToT ≥ 60 min. The false-positive budget is ≤ 1 prompt per operator per 2 shifts under rested conditions.

---

## 5. Validation design (independent ground truth required)

Telemetry cannot validate itself. Tier D (fatigue ground truth) has to be *created* in a study.

| Phase | Design | Ground truth | Notes |
|---|---|---|---|
| A. Simulator (primary) | Within-subject crossover. **Rested** (≥ 7 h time in bed for 3 nights) vs **sleep-restricted** (≤ 5 h TIB for 1–2 nights, or post-night-shift), each with 2 × 90 min continuous excavator-loading blocks. Order counterbalanced, ≥ 1 week washout. | KSS every 15–20 min (Åkerstedt & Gillberg 1990, [ref](https://www.med.upenn.edu/cbti/assets/user-content/documents/Karolinska%20Sleepiness%20Scale%20(KSS)%20Chapter.pdf)); Samn-Perelli 7-point at block start and end ([Samn & Perelli 1982](https://www.semanticscholar.org/paper/Estimating-Aircrew-Fatigue:-A-Technique-with-to-Samn-Perelli/1528369301f0a69d2172b8584de09492cda3e5f0)); PVT-B (3 min) between blocks ([Basner et al. 2011](https://pubmed.ncbi.nlm.nih.gov/22025811/)) and 10-min PVT pre/post ([Basner & Dinges 2011](https://pubmed.ncbi.nlm.nih.gov/21532951/)); wrist actigraphy + sleep diary for 7 days before ([AASM 2018](https://jcsm.aasm.org/doi/10.5664/jcsm.7230)). Optional convergent DMS/PERCLOS. | The EU DDAW type-approval rules validate against KSS, warn at KSS ≥ 8, and require ≥ 10 participants ([EU 2021/1341](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32021R1341)) [ESTABLISHED]. We use that as the *minimum* template. |
| B. Field observational | Consented operators on sites that already run a camera DMS. Compare residual CVI flags with DMS events and end-of-shift KSS. | DMS events and KSS. **Neither is true ground truth.** Report as convergent validity. | Tests whether simulator thresholds transfer (see Hallvig 2013). |

**Ethics / safety [PROPOSED]:** HREC/IRB approval. Written informed consent with right to withdraw. Sleep-restricted participants get transport home and **never drive or operate real machines** during restriction. Data pseudonymised. A contractual bar on any employment use of study data. Participants may view their own data.

**Sample size (rough) [PROPOSED]:** paired rested-vs-restricted contrast on CVI, assumed within-subject effect d_z = 0.6, two-sided α = 0.05, power 0.8 → n ≈ ((1.96 + 0.84)/0.6)² + 2 ≈ **24**. Recruit **30** to allow for about 20% attrition. This is above the DDAW minimum of 10. For the AUC criterion, the effective sample is subjects, not windows. LOSO cross-validation over 24–30 subjects gives a 95% CI half-width of roughly ±0.08–0.10 around AUC 0.70 [HYPOTHESIS; confirm by bootstrap on pilot data]. Recruit a stratified mix of novice and experienced operators so the learning confounder can be estimated.

---

## 6. Uncertainty-aware output language

| Allowed [PROPOSED] | Never |
|---|---|
| "Possible fatigue-related change in control pattern — suggest a break check-in." | "Operator is fatigued." / "Drowsy." |
| "You've operated 2 h 10 min without a break." (fact) | Any fatigue score shown to supervisors |
| Confidence shown as low / medium, with the top 2 contributing features | Single number presented as a diagnosis |
| Operator response options: "Taking a break" · "I'm fine" · "Alert was wrong" | Automatic lockout, pay, rostering or disciplinary effects |

The EU AI Act Commission guidance reportedly treats fatigue as a physical state rather than an emotion, so fatigue detection falls outside the Art. 5(1)(f) workplace emotion-recognition ban ([FPF summary](https://fpf.org/blog/red-lines-under-eu-ai-act-unpacking-the-prohibition-of-emotion-recognition-in-the-workplace-and-education-institutions/)). Using it to evaluate workers' behaviour may still be high-risk under Annex III(4) ([Reg. 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)). Get a legal review before any deployment.

---

## 7. MVP status and demo content

| Item | In MVP? | Behaviour |
|---|---|---|
| **Break-reminder rule** (deterministic) | **Yes (P0/P1)** | If continuous active operation ≥ 120 min since the last ≥ 10 min break (parking brake / lockout engaged), raise a **T1** "break check-in" at the next low-workload moment. If ≥ 150 min, or the site fatigue-plan limit is reached, raise **T3** "recommended break". Thresholds are configurable per site. The 2 h default follows Folkard & Tucker [ESTABLISHED basis; threshold PROPOSED]. |
| Break history on dashboard | Yes | Timeline of breaks, current ToT, shift ordinal. Visible to the operator. |
| **Research prototype panel** | Demo only, labelled | Banner: **"RESEARCH PROTOTYPE — SIMULATED DATA — NOT VALIDATED — NOT USED FOR ALERTS."** Shows Ravi's residual-CVI trend, context covariates and a change-point marker [SIMULATED]. |
| Fatigue input to risk fusion | **No** | Excluded until Phase A succeeds. |
| Supervisor view of fatigue signal | **No** | Supervisors see only aggregate break-rule compliance. |

---

## Challenge to brief

1. **Exclude the fatigue prototype from P1 risk fusion explicitly.** The brief lists fusion inputs broadly. An unvalidated CVI feeding the T2 logic would turn a research signal into an operational alert.
2. **Novice operators (Ravi):** learning effects will dominate within-operator baselines. The indicator should be off until a minimum baseline exists (≥ 20 h per task). The demo should *show* it saying "insufficient baseline" for Ravi in Shift 1.
3. **Time-on-task is the only defensible in-cab fatigue feature for the MVP.** Present it as a break-management rule, not "fatigue detection."
