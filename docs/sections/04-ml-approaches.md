# 04 — Comparison of Candidate ML Approaches and the Contextual Risk Engine

**Owner:** ML Engineer / AI Research Scientist · **Depends on:** 00-design-brief (signal tiers, P0/P1/P2 scope, alert tiers)

Tags: [ESTABLISHED] cited · [HYPOTHESIS] untested · [PROPOSED] our choice · [SIMULATED] generator data.

## 1. Design stance

- [PROPOSED] Critical protections (seatbelt open while moving, person or object inside the proximity zone, over-speed) are deterministic rules. They run before ML and ML can never suppress them.
- [PROPOSED] Behaviour models are unsupervised because Tier D labels (near-miss, fatigue, verified competency) do not exist. The only supervised model is task-time, where the label (the task's duration) is observed.
- [PROPOSED] Every model must run in under 1 ms per window on a laptop CPU, be exportable to ONNX, and be explainable in feature units.

## 2. Comparison of candidate approaches

●●● good · ●● fair · ● poor. "Data" means normal-operation windows per context.

| Approach | Data needed | Labels | Latency / window | Interpretability | Edge deploy | Maintenance | Robust to context shift | Hackathon fit | Role |
|---|---|---|---|---|---|---|---|---|---|
| Robust z / EWMA / CUSUM [Page 1954] | 10² per feature | None | µs | ●●● | ●●● | ●●● | ● unless baselined per context | ●●● | Explanations, drift, fallback |
| Change-point: PELT [Killick 2012], BOCPD [Adams & MacKay 2007] | Several shifts | None | PELT batch; BOCPD ms | ●●● ("what changed, when") | ●● | ●● (penalty/hazard) | ●● (detects the shift itself) | ●● | P1 degradation, post-shift segmentation |
| **Isolation Forest** [Liu 2008] | ~10³ (256-sample subsampling) | None (assumes training is mostly normal) | < 1 ms | ●● (TreeSHAP possible) | ●●● | ●●● | ● globally; fixed by per-context models | ●●● | **P0 anomaly** |
| One-class SVM [Schölkopf 2001] | 10³–10⁴ (training cost ~quadratic) | None | ms | ● | ●● | ● (ν, γ, scaling) | ● | ●● | Offline benchmark |
| LOF [Breunig 2000] | Stores the training set | None | ms–10s of ms | ●● | ● (memory) | ●● | ●● | ●● | Offline benchmark |
| Dense autoencoder | 10⁴+ | None | ~1 ms | ●● (per-feature error) | ●●● | ●● | ● (can reconstruct anomalies) | ●● | Optional ablation |
| LSTM/GRU AE [Malhotra 2016] | 10⁵+ raw steps | None | ms–10s of ms | ● | ●● | ● | ●● | ● | P2 |
| TCN [Bai 2018] | 10⁵+ raw steps | None | Low | ● | ●●● | ● | ●● | ● | P2 (preferred over LSTM on edge) |
| Transformer (e.g., [Xu 2022]) | Large | None | 10s of ms | ● | ● | ● | Unknown | ● | Out of scope; benchmark gains contested [Wu & Keogh 2021; Kim 2022] |
| Supervised GBDT (LightGBM [Ke 2017]) | 10³+ labelled rows | **Required** | < 1 ms | ●●● (TreeSHAP) | ●●● | ●● | ●● | ●●● task-time; ● incidents | **P0 task-time**; P1 surrogate |

**Why Isolation Forest for P0** [PROPOSED]:
- It needs no labels and trains in seconds.
- It gives a monotone score that we can calibrate per context.
- It explains via per-feature z-scores or TreeSHAP.

Deep temporal models need more data per context than a 36–48 h build can produce credibly. Their published benchmark wins are weak evidence that they would do better here [ESTABLISHED; Wu & Keogh 2021; Kim 2022].

## 3. Recommended stack per job

| Job | Method | Output | Priority |
|---|---|---|---|
| Critical protections | Rules with debounce and hysteresis, e.g., seatbelt open AND travel speed > 0.5 km/h for ≥ 1 s | T-CRIT + incident | P0 |
| Excessive idle | Rule: engine on, RPM in idle band, no travel or implement command, for longer than T_idle (site-set, e.g., 5 min). **Context gate:** suppressed when task_state ∈ {waiting_for_truck, warm-up/cool-down, supervisor hold}. task_state comes from dispatch, an operator tap, or inference (truck absent) | Idle event, or a suppressed-with-reason log | P0 |
| Unsafe-pattern anomaly | IF per (machine type × task type); 100 trees, max_samples = 256. The `contamination` parameter is ignored because thresholds come from the alert budget (§6) | Context percentile p | P0 |
| Procedural violations | Rules, e.g., travelling with the implement raised, or engine start with the pre-shift checklist incomplete | T1 + incident | P0/P1 |
| Machine vs operator | Signature recurrence cross-tab + Tier A DTCs (§5.4) | machine / operator / undetermined | P1 |
| Emerging degradation | EWMA/CUSUM on per-shift aggregates (spike rate, cycle time, idle ratio); BOCPD in P2 | Drift flag | P1 |
| Skill-gap scoring | Map events to competencies. Compute a context-normalised rate ratio with Gamma–Poisson shrinkage (§8). A gap needs recurrence (≥ 3 events across ≥ 2 shifts) AND a shrunk rate ratio > 1.5 | Competency state | P1 |
| Task-time | LightGBM `objective=quantile`, α ∈ {0.1, 0.5, 0.9} [LightGBM docs], then CQR [Romano 2019]. Only features known before the task starts: task type, quantity, material, machine, experience band, weather, truck availability, time of day | P10/P50/P90 | P0 |
| Temporal model | GRU or TCN autoencoder on raw 10 Hz streams, benchmarked against IF | Score | P2 |

**CQR** [ESTABLISHED; Romano 2019]:
1. On a calibration set that is later in time than the training data, compute Eᵢ = max(q̂₀.₁(xᵢ) − yᵢ, yᵢ − q̂₀.₉(xᵢ)).
2. Take Q, the ⌈(n+1)(0.8)⌉-th smallest Eᵢ.
3. Report [q̂₀.₁ − Q, q̂₀.₉ + Q], with the quantiles sorted so they never cross.

Coverage assumes exchangeability [Lei 2018], and task logs drift. We therefore recalibrate on a rolling window of recent tasks, with adaptive conformal inference as the P1 upgrade [Gibbs & Candès 2021; Barber 2023].

## 4. Windowed features (20 s window, 5 s stride; configurable 10–30 s)

↑ means a higher value is more risky. "ctx" means context only, not scored for risk.

| # | Feature | Definition | Tier | Risk |
|---|---|---|---|---|
| F1 | joy_jerk_rms | RMS of the 2nd derivative of joystick commands (max over axes) | B | ↑ |
| F2 | joy_reversals | Sign changes of the command derivative above a deadband | B | ↑ |
| F3 | joy_saturation_frac | Time with any axis at > 90 % deflection | B | ↑ |
| F4 | multi_function_frac | Time with ≥ 3 axes active at once | B | ctx (skilled operators do this too) |
| F5 | swing_speed_p95 | 95th-percentile swing angular speed | B | ↑ |
| F6 | swing_decel_peak | Peak deceleration at swing stop | B | ↑ |
| F7 | swing_speed_loading_zone | F5 inside the loading-zone geofence | B + A (GPS) | ↑ |
| F8 | swing_speed_near_truck | F5 while a truck is within X m of the bucket arc | B + **C** | ↑ |
| F9 | travel_speed_p95, reverse_travel_frac | Travel speed; fraction of travel in reverse | B (A GPS coarse) | ↑ |
| F10 | travel_implement_raised_frac | Travel time with the boom above a height threshold | B (boom sensor where fitted; unverified) | ↑ |
| F11 | approach_speed_to_truck | Closing speed during the final approach | **C** (A GPS too coarse for alerts) | ↑ |
| F12 | min_ttc | min(distance / closing speed) to the nearest object | **C** | ↓ |
| F13 | person_warning_zone_s | Seconds with a person in the outer zone (inner zone is a T-CRIT rule) | **C** | ↑ |
| F14 | throttle_var, throttle_steps | Throttle variance; changes > 20 % within 1 s | B | ↑ |
| F15 | hyd_spike_count, hyd_relief_frac | Pump dP/dt spikes; time at ≥ 95 % of relief pressure | B | ↑ (also a machine-health cue) |
| F16 | brake_hard_count | Hard brake applications | B | ↑ |
| F17 | idle_ratio | Engine on, low RPM, no commands | A / B | ctx → idle rule |
| F18 | cycle_time_s, cycle_time_cv | Last dig–swing–dump–return cycle (segmented from swing angle plus bucket pressure); CV over the last 5 cycles | B | ctx; ↑ for CV |
| — | seatbelt_open_moving_s, dtc_active_count | Rules and attribution only, **not** IF inputs | B / A | rule |
| — | Context keys | machine_type, task_type, zone, task_state, time_into_shift, rpm band, weather if supplied | A / dispatch | gating |

[PROPOSED] Each context gets two model variants:
- **B-only**: all features except F8 and F11–F13.
- **B+C**: all features.

The edge service loads the variant that matches the sensors present. Without Tier C the UI shows "proximity not monitored".

## 5. Contextual risk engine

### 5.1 Why anomalous ≠ unsafe

| Reason | Design consequence |
|---|---|
| Anomalous means rare in the training data: new terrain, a new task or slow careful work can all be rare and still benign | Direction gate: only risk-direction deviations count |
| Unsafe habits can be common, and so look "normal" to the model [HYPOTHESIS] | Rules encode known hazards; risk is scored against population and policy baselines, not personal ones (§8) |
| The same swing speed means something different in an empty pit than next to a truck | Exposure multiplier |
| Real hazards are rare, so even accurate detectors produce mostly false alerts | Alert budget (§6); ML alerts stay advisory |

### 5.2 Taxonomy

| Category | Definition | Decided by | Demo example [SIMULATED] | Tier |
|---|---|---|---|---|
| Normal variation | p < τ₁, no rule hits | ML percentile | Routine loading | None |
| Unusual but harmless | p ≥ τ₁, but not in the risk direction, or the context gate applies | ML + gate | Long idle in `waiting_for_truck`; slow swings on soft ground | Log / T0 |
| Procedural violation | Non-critical rule hit | Rule | Travelling with the bucket raised | T1 + incident |
| Emerging degradation | Sustained drift in shift aggregates | CUSUM/EWMA + attribution | Rising spike rate on one machine for all operators | Maintenance ticket / T0 |
| Dangerous condition | Risk-direction anomaly at p ≥ τ₂ in high exposure, or a procedural hit plus an anomaly | Rule + ML + context fusion | Ravi's fast swing next to the truck | T2 → T3 → T4 |
| Immediate critical | Seatbelt open while moving; person in the zone; over-speed | Rule only; bypasses fusion | Seatbelt unbuckled while tracking | T-CRIT |

### 5.3 Fusion formula [PROPOSED]

For window *w* in context *c* = (machine type, task type, zone, task_state):

- **p**: the context percentile of the IF score (§6). Surprise q = −log₁₀(1 − p), so p = 0.99 gives q = 2 and p = 0.999 gives q = 3.
- **Gating**: zero the contributions of gated features (e.g., F17 in `waiting_for_truck`).
- **d**: 1 if risk-direction features carry ≥ 50 % of the positive deviation mass, otherwise 0.
- **S_proc**: the severity of the worst procedural rule hit, from {0, 2, 3}.
- **m_E**: exposure multiplier, from zone and Tier C:
  - 0.5 in an open area
  - 1.0 in a loading zone or travel lane
  - 1.5 with a person in the warning zone, a truck within X m, or reversing
- **K**: events with the same top-feature signature for this operator over the last 5 shifts.

**r = max(S_proc, d·q) × m_E + 0.5·𝟙[K ≥ 3]**

| Condition | Action |
|---|---|
| Any T-CRIT rule | T-CRIT, ignoring r |
| r < τ₁ (initially 2) | Log only |
| τ₁ ≤ r < τ₂ (initially 3) | T1, at most 1 per 10 min per signature |
| r ≥ τ₂ | T2, ack required |
| ≥ 2 T2 within 30 min after ack | T3 (recommend a safe stop or break) |
| T3 declined, or ≥ 3 T2 in a shift | T4 supervisor notice (operational, never an HR input) |

τ₁ and τ₂ are placeholders that the alert budget replaces. The weights are hand-set and auditable. We do not learn them until reviewer labels exist.

### 5.4 Machine vs operator separation (R4)

| Evidence | Attribution |
|---|---|
| Signature recurs on one machine across ≥ 2 operators, or co-occurs with an active DTC | Machine → maintenance, not coaching |
| Signature follows one operator across ≥ 2 machines of the same type | Operator → competency pipeline |
| Only one operator on one machine so far | Undetermined; T0 until more exposure |

## 6. Calibration and thresholds

| Step | Method |
|---|---|
| Score → percentile | Per-context ECDF of IF scores on a **held-out calibration split** (later in time than training), reported as the conformal-style p-value (1 + #{s_cal ≥ s})/(n+1). It is approximate because overlapping windows are autocorrelated. Resolving p = 0.999 needs ≳ 5,000 windows (≈ 7 h); with fewer, back off to the parent ECDF (§8) |
| Threshold by alert budget | Budgets: B_T1 ≤ 1.0 and B_T2 ≤ 0.2 false alerts per operating hour [PROPOSED]. Replay held-out normal hours through the **whole** pipeline (merging, rate limits, gating). Choose the lowest τ whose bootstrap upper 95 % bound is ≤ B. Sanity check: at 720 windows/h with independent windows, B = 1/h implies a per-window tail of ≈ 0.14 % |
| Percentile → probability | Only once reviewers have labelled logged alerts relevant or not relevant. These are relevance labels, **not** incident labels. Fit isotonic regression per context family [Zadrozny & Elkan 2002; Niculescu-Mizil & Caruana 2005] at ≥ 50 labels per class. Until then the UI never shows "probability of incident" |
| Check | Brier, ECE, reliability diagram [Brier 1950; Naeini 2015; Guo 2017]; see 13-evaluation |

## 7. Explanations

| Layer | Method | Audience |
|---|---|---|
| Primary | Robust z against the context baseline: z_j = (x_j − median_c,j)/(1.4826·MAD_c,j). Show the top 2 risk-direction features as a ratio to baseline | Operator, instructor |
| Secondary | TreeSHAP [Lundberg & Lee 2017] on the IF directly (shap's TreeExplainer accepts scikit-learn IsolationForest; check against the pinned version), or on a LightGBM surrogate of q, shown only if R² ≥ 0.8 | Engineers, judges |
| Consistency | Top-1 feature differs between z and SHAP → mark the explanation "low confidence" | All |

**Templates** [PROPOSED]. They name the behaviour, not the person, and give the baseline, the context and one action.
- In-cab: "*Swing speed near the truck is higher than usual for truck loading (68 vs typical 40 °/s). Ease the swing before dumping.*" [SIMULATED]
- Post-shift T0: "*In 7 of 31 loading cycles, swing speed near the truck was in the top 1 % for this machine and task, mostly in the last 2 s before dumping. This matches 'Approach & swing control'. Suggested: 6-min module + quiz.*" [SIMULATED]

## 8. Cold start: population → machine/task → personal

| Level | Holds | Used for |
|---|---|---|
| L0 population (machine type × task type) | IF, ECDF, medians/MADs | **Risk scoring**, including for new operators |
| L1 machine unit | Shrunk baselines | Attribution, degradation |
| L2 operator | Shrunk baselines, event rates | "vs your usual" coaching and change detection only |

- **Shrinkage** [Efron & Morris 1975]: μ̂_op = w·x̄_op + (1−w)·μ_parent, with w = n/(n + σ²_within/τ²_between). n counts shifts or cycles, not windows, because windows are autocorrelated.
- **Event rates**: Gamma–Poisson, λ̂ = (a + events)/(b + exposure hours).
- **Minimum data** [PROPOSED]: a context IF needs ≥ 2,000 windows from ≥ 3 operators and ≥ 2 machines. Otherwise use the machine-type IF plus a context ECDF (≥ 500 windows), else the population ECDF.
- **Guardrail**: personal baselines never relax risk thresholds. A novice who always swings fast is still scored against the population.

## Challenge to brief

1. **A strict per-(machine × task) IF is data-hungry.** Use the §8 back-off hierarchy and minimum-data rule.
2. **"SHAP on a surrogate" is not needed by default.** TreeSHAP explains the IF directly. Operators should see robust z; SHAP is for engineers.
3. **Split conformal on time-ordered logs violates exchangeability.** Specify CQR with a later-in-time calibration split plus rolling recalibration.
4. **The idle gate needs a named task-state source** (dispatch, operator tap, or inferred truck presence). The demo must script it.
5. **F8 and F11–F13 need Tier C.** B-only deployments must not claim proximity-aware risk.

## References

- Adams & MacKay 2007, BOCPD — https://arxiv.org/abs/0710.3742
- Bai, Kolter, Koltun 2018, TCN — https://arxiv.org/abs/1803.01271
- Barber et al. 2023, Conformal prediction beyond exchangeability — https://projecteuclid.org/journals/annals-of-statistics/volume-51/issue-2/Conformal-prediction-beyond-exchangeability/10.1214/23-AOS2276.full
- Breunig et al. 2000, LOF — https://dl.acm.org/doi/10.1145/335191.335388
- Brier 1950 — https://journals.ametsoc.org/view/journals/mwre/78/1/1520-0493_1950_078_0001_vofeit_2_0_co_2.xml
- Efron & Morris 1975 — https://www.tandfonline.com/doi/abs/10.1080/01621459.1975.10479864
- Gibbs & Candès 2021, Adaptive Conformal Inference — https://arxiv.org/abs/2106.00170
- Guo et al. 2017, calibration — https://proceedings.mlr.press/v70/guo17a.html
- Ke et al. 2017, LightGBM — https://papers.nips.cc/paper/6907-lightgbm-a-highly-efficient-gradient-boosting-decision-tree
- Killick, Fearnhead, Eckley 2012, PELT — https://arxiv.org/abs/1101.1438
- Kim et al. 2022, point-adjust critique — https://cdn.aaai.org/ojs/20680/20680-13-24693-1-2-20220628.pdf
- Lei et al. 2018, Distribution-free predictive inference (arXiv 1604.04173) — https://www.emergentmind.com/papers/1604.04173
- LightGBM parameters (quantile, alpha) — https://lightgbm.readthedocs.io/en/latest/Parameters.html
- Liu, Ting, Zhou 2008, Isolation Forest — https://dl.acm.org/doi/10.1109/ICDM.2008.17
- Lundberg & Lee 2017, SHAP — https://www.semanticscholar.org/paper/A-Unified-Approach-to-Interpreting-Model-Lundberg-Lee/442e10a3c6640ded9408622005e3c2a8906ce4c2
- Malhotra et al. 2016, LSTM encoder-decoder AD — https://arxiv.org/abs/1607.00148
- Naeini, Cooper, Hauskrecht 2015 — https://ojs.aaai.org/index.php/AAAI/article/view/9602
- Niculescu-Mizil & Caruana 2005 — https://dl.acm.org/doi/10.1145/1102351.1102430
- Page 1954, CUSUM — https://academic.oup.com/biomet/article-abstract/41/1-2/100/456627
- Romano, Patterson, Candès 2019, CQR — https://papers.nips.cc/paper/8613-conformalized-quantile-regression
- Schölkopf et al. 2001, One-class SVM — https://direct.mit.edu/neco/article/13/7/1443/6529/Estimating-the-Support-of-a-High-Dimensional
- Wu & Keogh 2021 — https://arxiv.org/abs/2009.13807
- Xu et al. 2022, Anomaly Transformer — https://arxiv.org/abs/2110.02642
- Zadrozny & Elkan 2002 — https://dl.acm.org/doi/10.1145/775047.775151
