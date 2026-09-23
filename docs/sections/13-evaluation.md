# 13 — Quantitative Evaluation Framework

**Owner:** ML Engineer / AI Research Scientist · **Depends on:** 00-design-brief, 04-ml-approaches (features, fusion, calibration)

Tag legend: [ESTABLISHED] cited · [HYPOTHESIS] · [PROPOSED] · [SIMULATED].

> **Scope statement.** The CAT Sentinel prototype **does not demonstrate accident prevention, injury reduction, or improved operator competency in the real world.** On hackathon data it can show four things only: (a) the deterministic safety rules behave to specification; (b) the ML pipeline detects anomaly patterns we injected into SIMULATED telemetry, at a stated false-alert budget; (c) task-time intervals are calibrated on SIMULATED or supplied logs; and (d) the system meets its latency and offline-reliability targets. Any number from the generator is labelled **SIMULATED**.

## 1. What each evaluation can and cannot claim

| Evidence level | Data | Supports claims about | Does **not** support |
|---|---|---|---|
| E0 Unit / property tests | Scripted signal sequences | Rule correctness, fail-safe behaviour, latency | Any ML performance |
| E1 Injected-anomaly evaluation | SIMULATED telemetry + labelled injections | Pipeline detects the pattern types we designed, at a budget | Detection of real unsafe behaviour |
| E2 Retrospective real logs (if supplied) | Hackathon dataset, unlabelled | False-alert rate per hour, calibration under the null, task-time accuracy | Recall of unsafe events (no labels) |
| E3 Supervised field pilot | Real machines, instructor-reviewed alerts | Alert relevance, usability, operator acceptance | Accident prevention (too rare to measure) |
| E4 Controlled trial | Randomised or stepped-wedge rollout | Change in targeted behaviour rates | Causal injury reduction, unless very large and long |

## 2. Metric table

"Hack" = can be evaluated during the hackathon. "Real" = needs a real-world trial. Every hackathon target applies to SIMULATED data unless it says otherwise.

| # | Metric | Definition / method | Hack | Real | MVP acceptance target |
|---|---|---|---|---|---|
| M1 | Deterministic rule conformance | Truth-table and boundary tests for seatbelt, proximity zone and over-speed, including debounce and hysteresis; missing signal → "sensor fault" alert, never "OK" | ✔ | Re-verify on hardware | 100 % pass; 0 missed T-CRIT in scripted scenarios |
| M2 | Event-level range precision / recall | Range-based P/R [ESTABLISHED; Tatbul 2018]. Recall uses existence weight α = 0.5, front-end positional bias (early detection rewarded) and reciprocal cardinality (fragmentation penalised). Precision uses flat bias. **No point-adjust** (it inflates scores [ESTABLISHED; Kim 2022]). Also report threshold-free VUS [Paparrizos 2022] | ✔ (injected) | Needs labelled real events | At budget: recall ≥ 0.80 for injections at ≥ 1.5× context baseline; precision ≥ 0.60 on a mix that includes benign novelties [SIMULATED] |
| M3 | False alerts per operating hour | Alerts on held-out clean hours, per tier, after merging and rate limiting; bootstrap over shifts for the CI | ✔ | ✔ (reviewer-labelled) | T1 ≤ 1.0/h, T2 ≤ 0.2/h (upper 95 % CI); T-CRIT false alerts = 0 in scripted tests |
| M4 | Alert latency | Time from injected onset (ML) or the triggering sensor message (rules) to the UI alert | ✔ | ✔ | T-CRIT p99 ≤ 500 ms end-to-end over MQTT; ML p50 ≤ 15 s, p90 ≤ 30 s |
| M5 | Null calibration of percentiles | On held-out normal windows, the share with p ≥ 0.99 should be ≈ 1 %; KS test of p-value uniformity per context | ✔ | ✔ | 0.7–1.3 % exceedance at p ≥ 0.99 in every context with ≥ 2,000 test windows |
| M6 | Probability calibration (ECE, Brier, reliability) | For isotonic "alert relevance" probabilities [Brier 1950; Naeini 2015; Guo 2017; Niculescu-Mizil & Caruana 2005]; 10 equal-mass bins | ✘ (no labels) | ✔ | ECE ≤ 0.05; Brier below the base-rate climatology. Before labels exist, show percentiles only |
| M7 | Cross-operator generalisation | Leave-one-operator-out (GroupKFold on operator) | ✔ if the generator has operator random effects | ✔ | False-alert rate ≤ 1.5× in-distribution; recall drop ≤ 10 pp [SIMULATED] |
| M8 | Cross-machine generalisation | Leave-one-machine-out | ✔ (as above) | ✔ | Same as M7 |
| M9 | Temporal generalisation | Train on early shifts, test on later ones, with a purge gap (§4) | ✔ | ✔ | Same as M7 |
| M10 | OOD / unfamiliar-context detection | AUROC for separating windows from unseen contexts (new task or terrain) from in-distribution windows. Flagged windows go to "unfamiliar context, reduced confidence" rather than to alerts | ✔ | ✔ | AUROC ≥ 0.90; false alerts per hour during OOD segments ≤ budget |
| M11 | Task-time interval quality | Empirical coverage of P10–P90, mean width, pinball loss per quantile, MAE of P50; coverage by task type and experience band (a conditional-coverage check) | ✔ | ✔ | Coverage 0.75–0.85 (nominal 0.80); P50 MAE ≥ 15 % better than the historical median per task type; width ≤ a naive empirical-quantile baseline |
| M12 | Training-recommendation relevance | Blinded raters score event → competency → module on a 1–5 scale; inter-rater κ | Proxy only (mentors/judges, **not** experts) | ✔ certified instructors | Mean ≥ 4.0/5 on ≥ 20 cases, ≥ 2 raters |
| M13 | RAG grounding | Share of answers carrying ≥ 1 citation; share of claims supported by the cited passage (manual check); refusal rate on out-of-corpus questions | ✔ | ✔ | 100 % cited; ≥ 90 % supported (30 Qs); ≥ 95 % refusals (10 out-of-corpus Qs) |
| M14 | Competency improvement | Rate ratio (post/pre) of targeted events per context-hour, with 95 % CI, against a control (§6) | Pipeline only [SIMULATED, scripted] | ✔ | Hackathon: pipeline computes RR + CI correctly. **No efficacy claim** |
| M15 | Usability (SUS) | 10-item SUS [Brooke 1996]; normative interpretation per Bangor 2008 | Proxy (≥ 5 hallway testers, not operators) | ✔ operators, in-cab | SUS ≥ 70 [PROPOSED threshold] |
| M16 | Edge latency | Per-window feature extraction + IF + fusion: p50/p99 on the demo laptop; ONNX Runtime on an IPC or Jetson in P2 | ✔ | ✔ target hardware | p99 ≤ 50 ms per window; rule path p99 ≤ 100 ms from message receipt |
| M17 | Offline / fault reliability | Scripted faults: cloud down 30 min, MQTT broker restart, sensor dropout, stuck value, clock skew, disk full | ✔ | ✔ | 100 % of scenarios pass: rules keep running; 0 events lost after resync; dropout → sensor-fault alert |
| M18 | Graceful degradation by tier | Remove Tier C, then Tier B, from the input | ✔ | ✔ | Correct feature-set variant loaded; "proximity not monitored" banner shown; no crash |

## 3. Split protocol

| Split | Purpose | Construction |
|---|---|---|
| Train / calibrate / test in time | Main estimate | Order shifts by time: 60 % train, 20 % calibration (ECDF, conformal, thresholds), 20 % test. Purge gap ≥ 1 window length at each boundary |
| Leave-one-operator-out | M7 | Hold out all shifts of one operator; repeat for each operator; report mean ± SD |
| Leave-one-machine-out | M8 | As above, grouped by machine |
| Injection holdout | M2 | Tune on injection types U1, U2, U5 at 1.5×; test on all types (including the unseen U3, U4) at 1.2×, 1.5× and 2.0× |

## 4. Leakage traps

| Trap | How it inflates results | Avoidance |
|---|---|---|
| Temporal leakage | A random window split puts near-identical neighbouring windows in both train and test | Time-block split with purge gap [ESTABLISHED principle; Roberts 2017] |
| Window overlap | With a 5 s stride on 20 s windows, one moment appears in 4 windows. Windows cross split boundaries, and event counts inflate | Purge ≥ window length; score at event level (merged ranges), not per window |
| Operator identity | The model learns an individual's style, so a "cross-operator" claim is really within-operator | GroupKFold on operator (M7). Operator ID is never an IF input |
| Machine identity | Same, for per-machine hydraulics signatures | GroupKFold on machine (M8) |
| Preprocessing fit on all data | Scalers, medians/MADs, ECDFs or baselines see the test set | Fit every statistic inside the training (or calibration) fold only [ESTABLISHED; Kaufman 2012] |
| Threshold tuned on test | τ chosen to look good on the reported data | τ comes from the calibration split via the alert budget; the test set is touched once |
| Injector leakage | Detector tuned to the injection generator's exact shape or magnitude | Hold out injection types and magnitudes; ramp injection onset over 2–5 s to avoid step artefacts |
| Trivial-anomaly illusion | Injections so large that a one-line threshold finds them, the flaw Wu & Keogh document in public benchmarks [ESTABLISHED; Wu & Keogh 2021] | Always report a single-feature robust-z baseline. If the IF does not beat it, say so and ship the simpler detector |
| Future features in task-time | Features known only after the task ends (actual loads, actual idle) | Feature whitelist of pre-task fields; calibration set strictly after the training period |
| Circular evaluation | ML "detects" events that a rule already defines, using the rule's own input | Evaluate ML only on injection types that no rule defines, or with the rule's input excluded |

## 5. Class imbalance and why we do not train incident predictors

| Point | Implication |
|---|---|
| Real incidents and near-misses are rare. Near-miss labels are Tier D (unavailable), and reported incidents are under-reported and biased toward severe outcomes [HYPOTHESIS] | Too few positives, from a skewed sample, to train or validate a supervised incident predictor |
| A precise-looking incident model trained on a handful of positives would overfit to site, machine or operator identity | It could encourage misuse, such as ranking operators by "incident probability". The brief forbids this |
| Base rates: even a very specific detector yields mostly false alerts when true hazards are rare | Alert budgets (M3) and advisory-only ML tiers |
| **Our approach** | Known hazards → deterministic rules (M1). Unknown deviations → unsupervised anomaly detection, evaluated on **injected anomalies in SIMULATED data** (M2), explicitly labelled as such |

**Injection catalogue [PROPOSED, SIMULATED]**

| ID | Pattern | Mechanism | Expected handling |
|---|---|---|---|
| U1 | Fast swing near truck | Scale swing rate ×m inside the loading-zone geofence | IF + fusion → T1/T2 (dangerous if exposure is high) |
| U2 | Joystick reversal bursts | Add a 1–3 Hz oscillation to commands | IF → T1 |
| U3 | High approach speed to truck | Scale closing speed ×m (B+C variant) | IF → T2 |
| U4 | Travel with implement raised | Boom above threshold while travelling | Procedural rule + IF |
| U5 | Hydraulic spike bursts on one machine, all operators | Add dP/dt spikes | IF + attribution → **machine** |
| U6 | Slow drift | +2 %/shift in cycle time or spike rate | CUSUM → emerging degradation |
| U7 | Long idle with and without `waiting_for_truck` | Idle segments | Rule fires only when ungated |
| N1 | Benign novelty (new task, soft ground, slow careful work) | Shift the context distribution | **No alert**; OOD flag (M10) |
| N2 | Sensor dropout or stuck value | NaN / constant | Data-quality flag, not an anomaly alert |
| C1–C3 | Seatbelt open while moving; person in inner zone; over-speed | Scripted | T-CRIT (M1) |

Magnitude sweep m ∈ {1.2, 1.5, 2.0}. We report recall-versus-magnitude curves per type rather than one headline number.

## 6. Competency improvement: what a real claim needs

The demo's Shift 2 "fewer events" is **scripted by the generator [SIMULATED]**. It demonstrates that the re-assessment pipeline works. It is not evidence that training works.

| Threat | Why it matters | Mitigation in a real trial [PROPOSED] |
|---|---|---|
| Regression to the mean | Operators are chosen *because* their event counts were high, so their counts fall next period even without training [ESTABLISHED; Barnett 2005] | Control group selected by the same rule (randomised delayed training / waitlist); several baseline shifts; baseline-adjusted analysis |
| Exposure change | A different task mix changes event opportunity | Normalise per context-hour; mixed-effects Poisson/NB with random operator intercepts |
| Monitoring effect | Behaviour may change just because it is observed [HYPOTHESIS] | Same monitoring in the control arm |
| Non-specific change | Everything improves (season, site) | Difference-in-differences: targeted vs non-targeted behaviours |
| Multiple testing | Many competencies, many operators | Pre-register a primary outcome per competency |

Claim rule: report RR with 95 % CI. Claim improvement only if the CI excludes 1 **and** the control arm shows no comparable change.

## 7. Reporting rules

- Every chart or table built from generator output carries a **SIMULATED** watermark and the generator version or seed.
- Report distributions (per context, per operator), not only means. Always report the naive baseline beside the model.
- Report the null result if the IF does not beat the robust-z baseline.

## Challenge to brief

1. **Demo Shift 2.** The brief's "measurably fewer events" must appear on screen as scripted SIMULATED output, with the regression-to-the-mean caveat. Otherwise judges may read it as evidence of training efficacy.
2. **Recall of real unsafe behaviour cannot be measured at all** without labelled events. The brief should state that hackathon ML metrics are E1 only.
3. **Split conformal on time-ordered logs** needs a time-later calibration set (§3). Coverage should be reported per subgroup, not only marginally.

## References

- Bangor, Kortum, Miller 2008, SUS evaluation — https://www.tandfonline.com/doi/abs/10.1080/10447310802205776
- Barnett, van der Pols, Dobson 2005, Regression to the mean — https://academic.oup.com/ije/article-abstract/34/1/215/638499
- Brier 1950 — https://journals.ametsoc.org/view/journals/mwre/78/1/1520-0493_1950_078_0001_vofeit_2_0_co_2.xml
- Brooke 1996, SUS — https://www.taylorfrancis.com/chapters/edit/10.1201/9781498710411-35/sus-quick-dirty-usability-scale-john-brooke
- Guo et al. 2017 — https://proceedings.mlr.press/v70/guo17a.html
- Kaufman, Rosset, Perlich, Stitelman 2012, Leakage in data mining — https://dl.acm.org/doi/10.1145/2382577.2382579
- Kim et al. 2022, Towards a Rigorous Evaluation of TSAD — https://cdn.aaai.org/ojs/20680/20680-13-24693-1-2-20220628.pdf
- Naeini, Cooper, Hauskrecht 2015 — https://ojs.aaai.org/index.php/AAAI/article/view/9602
- Niculescu-Mizil & Caruana 2005 — https://dl.acm.org/doi/10.1145/1102351.1102430
- Paparrizos et al. 2022, VUS — https://www.vldb.org/pvldb/vol15/p2774-paparrizos.pdf
- Roberts et al. 2017, Structured cross-validation — https://nsojournals.onlinelibrary.wiley.com/doi/10.1111/ecog.02881
- Romano, Patterson, Candès 2019, CQR — https://papers.nips.cc/paper/8613-conformalized-quantile-regression
- Tatbul et al. 2018, Precision and Recall for Time Series — https://proceedings.neurips.cc/paper/2018/hash/8f468c873a32bb0619eaeb2050ba45d1-Abstract.html
- Wu & Keogh 2021, TSAD benchmarks flawed — https://arxiv.org/abs/2009.13807
