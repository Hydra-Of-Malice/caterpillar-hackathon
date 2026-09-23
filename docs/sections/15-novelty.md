# 15 — Novelty and differentiation assessment

Stance: conservative. Our novelty claims are bounded by the sources we reviewed (about 45, listed in 02-feasibility). **We did not run a patent or freedom-to-operate search.** Searches did surface patents in neighbouring areas: operator-skill compensation in hydraulic systems, and telematics fleet analytics. So nothing here should be read as a patentability claim. Wording rule: "we did not find documented evidence of X in the sources reviewed". Never "X does not exist".

## 1. Three-column separation

| Dimension | Established commercial functionality | Research prototypes | Our proposed contribution |
|---|---|---|---|
| Telemetry capture | VisionLink/Product Link hours, idle, fuel, location, faults. ISO 15143-3 API [S1][S2]. KOMTRAX, JDLink and ConSite offer equivalents [S34][S35][S36] [ESTABLISHED] | Multi-sensor excavator datasets, e.g., 107 machines × 26 sensors [S48] [ESTABLISHED] | No new capture. An OEM-agnostic adapter over AEMP 2.0 + J1939 + a labelled SIMULATED generator [PROPOSED] |
| Critical safety alerts | Seat Belt Reminder with supervisor logging [S9]. Cat Detect people/object zones [S5][S6]. E-Fence motion stops [S8]. Komatsu unsafe-operation alarms (over-speed, sudden braking; trucks) [S33] [ESTABLISHED] | ISO 21815 collision warning/avoidance framework [S24] [ESTABLISHED] | No new detection. Deterministic rules that *consume* OEM events, add sensor-health and "protection degraded" states, and log incidents with a ±30 s telemetry snapshot [PROPOSED] |
| Idle / behaviour detection | Idle reporting in every major telematics platform [S1][S34][S35]. Cat Operator Coaching tips for idle and digging technique [S3] [ESTABLISHED] | Activity recognition from joystick, IMU or CAN signals [S43][S44]. Unsupervised anomaly detection [S48] [ESTABLISHED] | Idle gated by task context ("waiting for truck"). Anomaly baselines per machine type × task type, with per-feature deviation explanations [PROPOSED] |
| Operator skill assessment | Simulator benchmark scores for Safety/Production/Maintenance (SimU Campus) [S15]. In-cab efficiency score [S3] [ESTABLISHED] | Expert vs novice indices from trajectories and lever operation [S40][S41]. Learned reward functions [S42] [ESTABLISHED] | Field-behaviour-derived *competency states*, normalised for exposure and context. Not a skill score and not an employment metric [PROPOSED] |
| Behaviour → training link | Cat VisionLink Productivity: managers track tip trends and "focus training" [S4]. Volvo: end-of-shift tips with a QR link to the relevant instructional video [S30] [ESTABLISHED] | Part-task training improves retention in simulated excavator tasks [S51] [ESTABLISHED] | A versioned competency catalog. Event→competency mapping with a recurrence threshold (≥3 events across ≥2 shifts, context-normalised). Automatic assignment of a micro-module, quiz and instructor booking [PROPOSED] |
| Training content | Fixed OEM courses, videos and simulator curricula [S16][S30][S32] [ESTABLISHED] | — | RAG over curated, versioned documents with mandatory span citations, an extractive-only fallback and instructor sign-off [PROPOSED] |
| Re-assessment | Volvo trend graphs over recent shifts [S30]. Cat "track improvements over time" [S4] [ESTABLISHED] | Pre/post skill measurement in lab and simulator studies [S41][S51] [ESTABLISHED] | A pre-specified metric per competency: exposure-normalised event rate before vs after training, with a confidence interval and a within-operator control competency to check regression to the mean [PROPOSED] |
| Machine vs operator attribution | Cat "Machine Health tips" are operator actions that cause wear [S3]. Fault codes are reported separately [S2] [ESTABLISHED] | Data-driven separation of operator impact on digging-machine energy efficiency (Springer, Energy Efficiency, 2015; title-level only) [HYPOTHESIS: relevance unverified] | Explicit routing: anomalies explained by faults or machine baseline drift go to maintenance, never to the operator's competency record [PROPOSED] |
| Fatigue | Cat DSS camera-based eye-closure/head-pose detection, with a 24/7 monitoring centre [S10][S12] [ESTABLISHED] | Fatigue models from operational/work factors [S70][S71] [ESTABLISHED] | Only a research-hypothesis *exposure* indicator (hours on shift, time since break). No diagnosis. Would be validated against DMS events if available [HYPOTHESIS] |
| Task-time estimate | Productivity dashboards (payload, cycle counts) [S14] [ESTABLISHED] | DNN productivity from telematics [S47]. CQR for calibrated intervals [S50] [ESTABLISHED] | P10/P50/P90 per task with split-conformal calibration, shown next to R1 progress [PROPOSED] |
| Alarm governance | Tiered in-cab alerts in Cat Detect (yellow/orange/red) [S6] [ESTABLISHED] | ISA-18.2 / EEMUA 191 rate benchmarks (process industry) [S29] [ESTABLISHED] | Alert tiers T-CRIT…T4 with rate limits and alarm-load KPIs. No duplicate in-cab annunciation where an OEM alarm exists [PROPOSED] |

## 2. Honest gap analysis: is the closed loop already done?

Loop: **detect recurring behaviour → competency gap → targeted training → measured re-assessment → adapt**.

| Loop step | Commercial evidence found | Gap vs. Sentinel | Verdict |
|---|---|---|---|
| Detect behaviour in the field | **Yes.** Cat Operator Coaching tips [S3]. Komatsu unsafe-operation alarms [S33]. Seat-belt logs [S9] | Cat tips are documented as efficiency and machine health. Komatsu's safety alarms are documented for haul trucks | Established |
| Aggregate per operator over time | **Yes.** VisionLink tip count, time and location per operator [S4]. Volvo trend graphs [S30] | We found no documented recurrence threshold or context normalisation (e.g., per task type or exposure hour) | Partially established |
| Map to a named competency gap | We did not find documented evidence of an explicit competency catalog fed by field telemetry. Simulator benchmarks are grouped into Safety/Production/Maintenance, but come from simulator sessions, not field data [S15] | A catalog with versioned mapping rules and auditable evidence per gap | Not found in reviewed sources |
| Targeted training | **Partly.** Volvo auto-links a tip to an instructional video [S30]. Cat leaves training selection to managers [S4] | Automatic assignment of micro-module + quiz + instructor booking, grounded in cited documents | Partially established (Volvo is closest) |
| Measured re-assessment | **Partly.** Trend graphs and "track improvements" [S4][S30] | We did not find documentation of a pre-specified, exposure-normalised pre/post test on the *targeted* behaviour, with a control for regression to the mean | Not found in reviewed sources |
| Adapt (thresholds, content, baseline) | Not documented | Competency-state update and content effectiveness per module | Not found in reviewed sources |
| Safety-behaviour focus in excavator coaching | Not documented for Cat or Volvo excavator coaching (efficiency and wear focus) [S3][S30] | Approach and swing speed near loading zones, seatbelt compliance, proximity-zone entries | Not found in reviewed sources |

**Bottom line** [HYPOTHESIS, based on reviewed sources only]: the *pattern* of behaviour tips → dashboards → training focus is commercial (Cat, Volvo). What we did not find documented is (a) a safety-competency version of it, (b) an explicit, auditable competency model with recurrence and context rules, and (c) statistically framed re-assessment of the specific targeted behaviour. Cat has publicly described interest in fusing DSS fatigue data with machine-behaviour data for risk assessment [S12]. The space is on the OEM roadmap, so our window is **demonstration and design rigour, not category creation**.

## 3. What we explicitly do **not** claim

- Not a new sensor, detector or computer-vision capability. Cat Detect and DSS already do this [S5][S10].
- Not the first operator-coaching or behaviour-to-training system (see Volvo [S30] and Cat [S4]).
- Not a fatigue detector or any medical or fitness-for-duty judgement.
- Not a safety-rated function under ISO 19014 or ISO 21815. Sentinel is advisory decision support [S24][S28].
- Not patentable or novel in a legal sense. No prior-art search was done.
- No field effect size. All improvement numbers in the demo are [SIMULATED].

## 4. Defensible differentiation statements (for judges)

1. **"Safety competencies, not just efficiency tips."** In the sources we reviewed, OEM excavator coaching targets productivity and machine wear [S3][S30]. Sentinel applies the coaching loop to safety behaviours (approach and swing control near loading zones, belt compliance, proximity entries), which are the hazards behind struck-by fatalities [S60][S61]. [PROPOSED]
2. **"An auditable competency model instead of a tip counter."** Every competency gap cites its evidence: event IDs, shifts, context, exposure-normalised rate, and the versioned mapping rule that fired. A supervisor or the operator can inspect why a module was assigned. We did not find this documented in reviewed commercial products. [PROPOSED]
3. **"We measure whether the training worked, on the behaviour it targeted."** Re-assessment is pre-specified per competency (rate ratio with a confidence interval, plus a within-operator control competency). This goes beyond trend graphs [S4][S30]. Honest caveat: in the hackathon it is shown on SIMULATED Shift 2 only. [PROPOSED] / [SIMULATED]
4. **"The machine's fault is not the operator's gap."** Anomalies explained by fault codes or machine-baseline drift go to maintenance and are excluded from competency records. That protects operators from unfair attribution and fits the brief's privacy and no-employment-decision principles. [PROPOSED]
5. **"Complements Cat's stack instead of competing with it."** Sentinel reads VisionLink/AEMP 2.0 [S2], Seat Belt Reminder and Cat Detect events (J1939 interface per ISO/TS 21815-2 [S24b]), and could hand training to Cat Simulators/SimU Campus [S15]. It adds no second in-cab alarm where an OEM alarm exists, and it follows ISA-18.2-style alarm-load limits [S29]. [PROPOSED]

## Challenge to brief

- The brief's innovation line ("closed loop connecting detected recurring behavior → competency gap → targeted training → measured re-assessment") is **too broad to defend as novel**. Cat [S4] and Volvo [S30] document most of that chain. Recommend rewording to: "a **safety-competency** closed loop with **auditable gap evidence** and **statistically framed re-assessment of the targeted behaviour**".
- The demo should say out loud that it builds on Cat Operator Coaching and VisionLink Productivity. Judges from Caterpillar will know these products, and ignoring them would cost credibility.

## References

(Same IDs as 02-feasibility. "(snippet)" means verified through search-result text only.)

- [S1] https://www.cat.com/en_US/products/new/technology/equipment-management/equipment-management/102680.html (snippet)
- [S2] https://digital.cat.com/knowledge-hub/articles/iso-15143-3-aemp-20-api-developer-guide (snippet)
- [S3] https://www.cat.com/en_US/products/new/technology/productivity/productivity/123420.html (snippet)
- [S4] https://highways.today/2024/07/08/caterpillar-3-visionlink/ ; https://www.cat.com/en_US/news/machine-press-releases/caterpillar-launches-three-new-features-for-visionlink-productivity.html (snippet)
- [S5] https://www.cat.com/en_US/products/new/technology/detect/detect/117380.html (snippet)
- [S6] https://www.cat.com/en_US/products/new/attachments/technology-kits/technology-kits/113860.html (snippet)
- [S8] https://www.cat.com/en_US/products/new/technology/detect/detect/15969806.html (snippet)
- [S9] https://www.cat.com/en_US/products/new/attachments/technology-kits/technology-kits/113020.html (snippet)
- [S10] https://www.cat.com/en_US/by-industry/mining/surface-mining/surface-technology/detect1/fatigue.html (snippet)
- [S12] https://im-mining.com/2024/02/08/cat-dss-evolving-and-growing-rapidly/
- [S14] https://www.cat.com/en_US/products/new/technology/payload/payload/15969808.html (snippet)
- [S15] https://www.cat.com/en_US/support/cat-training/simulators.html ; https://catsimulators.com/ (snippet)
- [S16] https://www.cat.com/en_US/support/cat-training/Heavy-Equipment-Operator-Training.html (snippet)
- [S24] https://www.iso.org/standard/77302.html ; [S24b] https://www.iso.org/standard/77303.html
- [S28] https://www.iso.org/standard/70715.html
- [S29] https://www.yokogawa.com/library/resources/media-publications/implementing-alarm-management-per-the-ansi-isa-182-standard-control-engineering/ (secondary)
- [S30] https://www.volvoce.com/europe/en/volvo-services/dig-assist/operator-coaching/
- [S32] https://www.volvoce.com/europe/en/volvo-services/advanced-operator-training/
- [S33] https://www.komatsu.com/en-ae/services/fleet-optimization/operator-guidance-monitor (snippet)
- [S34] https://www.komatsu.com/en-za/services/remote-monitoring/komtrax (snippet)
- [S35] https://www.forconstructionpros.com/construction-technology/equipment-monitoring-logistics/product/10088033/john-deere-jdlink (secondary)
- [S36] https://www.hitachicm.com/eu/en/service/fleet-management/machine-reports-apps/ (snippet)
- [S40] https://ascelibrary.org/doi/10.1061/(ASCE)0733-9364(2007)133:11(889)
- [S41] https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2019.00142/full
- [S42] https://arxiv.org/abs/2211.07941
- [S43] https://doi.org/10.1007/s12541-019-00219-5
- [S44] https://www.sciencedirect.com/science/article/abs/pii/S0926580521003241 (title only)
- [S47] https://doi.org/10.1016/j.autcon.2020.103532
- [S48] https://doi.org/10.3390/sym11080957 (snippet)
- [S50] https://papers.neurips.cc/paper/8613-conformalized-quantile-regression.pdf
- [S51] https://doi.org/10.1177/0018720812454292 (snippet)
- [S60] https://www.cdc.gov/niosh/bulletin/2023/struck-by-stand-down.html
- [S61] https://www.msha.gov/safety-and-health/safety-and-health-initiatives/powered-haulage-safety
- [S70] https://doi.org/10.3390/mining2030029 (snippet)
- [S71] https://doi.org/10.3390/min11060621 (title only)
- Energy-efficiency operator-impact paper (title-level only, not cited as [ESTABLISHED]): https://link.springer.com/article/10.1007/s12053-015-9353-3
