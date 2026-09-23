# 02 — Research-backed technical feasibility assessment

Scope: can CAT Sentinel's five requirements (R1–R5) and the closed-loop hypothesis be built and defended with the signals, products and standards that exist today? Every [ESTABLISHED] claim links to a source (reference list at the end). "Snippet" in the source list means the page was verified through search-result text because the page timed out or returned 403 to our fetcher. Treat those as lower confidence.

## 1. What Caterpillar already ships (verified on Cat / Cat-affiliated pages)

| Capability | What it does (summarised) | Relevance to Sentinel | Tag |
|---|---|---|---|
| **Product Link / VisionLink** | Cloud fleet management with hours, location, idle time, fuel burn and utilisation dashboards. Mixed fleets can be brought in through Product Link retrofit devices or OEM/third-party APIs [S1] | Tier A source for R1, R4 and R5. The same idle and fuel fields Sentinel needs | [ESTABLISHED] |
| **ISO 15143-3 (AEMP 2.0) API** | Cat publishes an AEMP 2.0 API with time-series endpoints including cumulative idle hours, cumulative fuel used and fault codes [S2] | Vendor-neutral ingestion contract for the Tier A adapter | [ESTABLISHED] |
| **Operator Coaching for Excavators** | In-cab system that detects specific actions and shows "Operational Efficiency" tips (e.g., digging technique, idle) and "Machine Health" tips, plus an efficiency score and a summary at key-off [S3] | Direct precedent for T0 coaching. Its focus is efficiency and wear, not safety | [ESTABLISHED] |
| **VisionLink Productivity – Operator Coaching (offboard)** | Tips are offboarded. Managers see each tip's count, time and location and can "track improvements over time" and focus training on each operator's needs (July 2024) [S4] | **Partial commercial closed loop already exists** (see §15) | [ESTABLISHED] |
| **Operator ID** | Operator ID codes restrict and track machine access (passcode, Bluetooth key, app). Per-operator settings are stored [S18] | Makes per-operator attribution feasible on Next Gen machines | [ESTABLISHED] (snippet) |
| **Cat Detect – People Detection / Detect with Smart Camera** | Camera detection of people (moving and stationary), up to 270° and 9 m, with three zones: yellow = display only, orange = intermittent audible, red = solid audible [S5][S6] | Tier C proximity source. Sentinel consumes these events and does not re-detect | [ESTABLISHED] |
| **Cat Detect for Personnel / Object Detection** | RFID tags + UHF antenna for rear zones [S7]. Camera + radar object alerts [S7b] | Alternative Tier C sources | [ESTABLISHED] (snippet) |
| **2D E-Fence** | Operator-set cab-avoidance, swing (E-Swing) and depth (E-Floor) boundaries. **Stops** implement motion at the boundary [S8] | Machine-level intervention already exists. Sentinel must never duplicate control | [ESTABLISHED] |
| **Seat Belt Reminder** | Triggers on **parking brake released + belt unbuckled** (audible alarm, buckle light, optional external beacon). VisionLink notifies supervisors and logs unbelted-while-moving instances. Fits any brand [S9] | Seatbelt events are commercially obtainable. Anchor the rule on parking-brake state | [ESTABLISHED] |
| **MineStar Detect – Driver Safety System (DSS)** | In-cab camera measures eye-closure duration and head pose. Alerts through seat vibration and audio. A 24/7 monitoring centre reviews events [S10][S12] | Tier C fatigue and distraction source (mining-centric) | [ESTABLISHED] |
| **Seeing Machines partnership** | Global agreement (2015) covering product development, licensing and distribution, with DSS sold through Cat dealers [S11]. Cat has publicly discussed future fusion of DSS with machine-behaviour data for risk assessment [S12] | Shows OEM direction toward behaviour + fatigue fusion | [ESTABLISHED] |
| **Cat Command** | Remote control and semi-autonomous dozing [S13] | Out of scope (no machine control) | [ESTABLISHED] |
| **Cat Payload / Cat Grade** | On-board weighing from attachment-position and hydraulic-pressure sensors [S14]. 2D/3D grade guidance [S17] | Possible Tier A/B source for load counts and cycles (R5) | [ESTABLISHED] |
| **Cat Simulators / SimU Campus** | Caterpillar-licensed simulators (Simformotion). Hundreds of expert-derived benchmarks. SimU Campus reports Safety, Production and Maintenance scores with pass/fail metrics [S15] | R3 integration target. Simulator scores are a *partial* competency proxy | [ESTABLISHED] (snippet) |
| **Cat operator training** | Dealer and Cat operator training courses [S16] | R3 content and instructor source | [ESTABLISHED] |

## 2. Competitor and industry precedents (documented only)

| Vendor | Feature | Relevance | Tag |
|---|---|---|---|
| Volvo CE | Operator Coaching (Co-Pilot): real-time guidance, end-of-shift "what to improve / what to keep" feedback, **QR code linking to the relevant instructional video**, trend graphs over recent shifts [S30]. Dig Assist / Load Assist standard in North America since 2019 [S31]. EcoOperator training [S32] | Closest precedent for behaviour → training content | [ESTABLISHED] |
| Komatsu | Operator Guidance Monitor: KPI targets, real-time feedback, and alarms for unsafe operation such as over-speed and sudden braking (haul trucks) [S33]. KOMTRAX: idle, fuel and operator identification [S34] | Safety-behaviour alarms exist commercially (for trucks) | [ESTABLISHED] |
| John Deere / Hitachi | JDLink idle vs. working-hour split [S35]. ConSite hours by front, swing and travel, benchmarked against the same model class [S36] | Tier A parity. Peer benchmarking | [ESTABLISHED] (secondary/snippet) |
| Built Robotics | Autonomous trenching kit with a layered safety system [S37] | Out of scope (autonomy regime) | [ESTABLISHED] |

## 3. Relevant standards

| Standard | Scope (summarised) | Implication for Sentinel | Tag |
|---|---|---|---|
| ISO 5006:2017 | Operator field-of-view test (12 m visibility circle) [S23] | Blind-spot rationale for proximity advisories | [ESTABLISHED] |
| ISO 21815-1:2022 | Collision warning and avoidance (speed reduction or motion inhibit only), "only intended to assist" the operator [S24] | Sentinel is warning-only | [ESTABLISHED] |
| ISO/TS 21815-2:2021 | On-board **J1939** interface for collision warning and avoidance [S24b] | Ingest path for Cat Detect-class events | [ESTABLISHED] |
| ISO 17757:2019 | Autonomous and semi-autonomous machine safety. Excludes remote control [S25] | Not applicable (no autonomous commands) | [ESTABLISHED] |
| ISO 19014-1/-2/-4/-5 | EMM functional safety: MCSSA, MPLr, hardware and software [S28] | **Primary** standard if a function ever touched motion. Sentinel stays outside the safety control system | [ESTABLISHED] |
| ISO 13849-1:2023 / ISO 25119-1:2018 | General machinery SRP/CS [S26] / **agriculture and forestry, not EMM** [S27] | Reference only | [ESTABLISHED] |
| ISO 15143-3 / SAE J1939 | Telematics API [S2] / CAN PGN-SPN protocol [S21] | Tier A / Tier B contracts | [ESTABLISHED] |
| ANSI/ISA-18.2, EEMUA 191 | About 1 alarm per 10 min per operator steady-state; more than 10 per 10 min is a flood [S29] | T1 rate limits and alarm-load KPIs (adapted from the process industry) | [ESTABLISHED] (secondary) |

## 4. Research evidence

| Topic | Evidence | What it supports | Tag |
|---|---|---|---|
| Operator skill from control/motion data | Bernold (2007): simulator-instrumented backhoe. Experts show smoother bucket motion and better force application [S40]. Sekizuka et al. (2020): five indices (operation time, bucket-trajectory dispersion and length, bucket velocity, lever-operation dispersion) separate experts from non-experts [S41]. Agarwal et al. (2022): learned reward functions that score operators on dynamics and safety criteria [S42] | Behaviour → competency indicators are measurable, **but only with Tier B implement/joystick data** | [ESTABLISHED] |
| Activity recognition | DTW on joystick signals identifies digging, levelling, lifting and trenching [S43]. Work-stage identification from operating-handle signals [S44]. Review of automated activity recognition [S46] | Context gating (task state) is feasible if joystick or IMU data exists | [ESTABLISHED] |
| Anomaly detection on excavator telemetry | ML anomaly detection on 107 excavators × 26 sensors × 40 days [S48] | Per-machine-type unsupervised baselines are a documented approach | [ESTABLISHED] (snippet) |
| Idle analytics | Komatsu reports about 38% average idle across about 75,000 North American machines. A Volvo fleet estimate is 28–30%. About 20% is cited as a realistic target [S49] | Idle is common and partly legitimate, so context gating is essential | [ESTABLISHED] |
| Productivity/time from telematics | A DNN estimates excavator productivity from telematics fields and exposes benchmarking difficulty [S47] | R5 is feasible but noisy, so uncertainty must be shown | [ESTABLISHED] |
| Calibrated intervals | Conformalized quantile regression gives finite-sample coverage under exchangeability [S50] | R5 P10/P90 design | [ESTABLISHED] |
| Training transfer | Part-task simulator training gave better skill retention than whole-task training for simulated excavator operation [S51] | Microlearning targeted at one competency is plausible | [ESTABLISHED] |
| Incident statistics | US construction, 2020: 150 struck-by deaths and 14,000 nonfatal injuries, about 48% of fatal struck-by being transportation-related [S60]. Excavation work, 1992–2002: 253 heavy-equipment deaths, with workers on foot struck by backing equipment a major pattern [S63]. US mining, 2025: powered haulage caused 13 of 33 deaths, and MSHA estimates belt use could save 3–4 lives a year [S61]. GB, 2025/26: 126 worker deaths (25 in construction); all-industry, 24 struck by a moving vehicle [S62] | R2 priority and seatbelt T-CRIT justification | [ESTABLISHED] |
| Fatigue | Camera PERCLOS systems ignore work and environment factors. ML on operational data to model individual haul-truck driver fatigue [S70]. Leading fatigue indicators found in operational data sets [S71] | Fatigue-*risk* indicator as a research hypothesis only, validated against DMS events, never as a diagnosis | [ESTABLISHED] / [HYPOTHESIS] |

## 5. Signal-tier table

| Signal | Tier | Source | Status for a real Cat deployment | Status in hackathon |
|---|---|---|---|---|
| SMU / engine hours | A | [S2] | **Confirmed** | Supplied or SIMULATED |
| Idle hours | A | [S1][S2] | **Confirmed** (cumulative, coarse) | Supplied or SIMULATED |
| Fuel used | A | [S2] | **Confirmed** | Supplied or SIMULATED |
| GPS location | A | [S1] | **Confirmed** | SIMULATED |
| Fault/diagnostic codes | A | [S2] | **Confirmed** | SIMULATED |
| Payload / load counts | A/B | [S14] | **Plausible** (needs Cat Payload; AEMP exposure unverified) | SIMULATED |
| Operator Coaching tip events | A | [S4] | **Confirmed** (VisionLink Productivity subscription) | SIMULATED |
| Seatbelt-unfastened-while-moving events | A/C | [S9] | **Confirmed** (Seat Belt Reminder kit + VisionLink) | SIMULATED |
| Operator ID | A/B | [S18] | **Plausible** offboard. Confirmed on-machine | SIMULATED |
| Engine speed, fuel rate, vehicle speed | B | [S21][S21b] | **Confirmed** as standard J1939 parameters. Machine exposure plausible | SIMULATED |
| Seatbelt switch | B | [S22] | **Plausible** (J1939 SPN 1856 exists. Presence on a given Cat ECU unverified) | SIMULATED |
| Parking brake | B | [S9] | **Plausible** (used by Cat's reminder logic) | SIMULATED |
| Hydraulic pressures, swing angle/rate, boom/stick position | B | [S8][S14] | **Plausible but proprietary**: sensors exist (E-Fence, Payload), with no public third-party access | SIMULATED |
| Joystick/implement commands | B | [S40][S43] | **Plausible but proprietary**: research uses instrumented or simulator machines | SIMULATED |
| Person/object proximity (zone, distance) | C | [S5][S6][S24b] | **Confirmed** as a product. Messaging standardised in ISO/TS 21815-2 | SIMULATED |
| Driver-monitoring fatigue/distraction events | C | [S10] | **Confirmed** (mining-focused) | SIMULATED or absent |
| Wearables | C | — | **Plausible**, unverified for Cat | Absent |
| Simulator benchmark scores | C | [S15] | **Confirmed** (SimU Campus). Integration API unverified | Mock |
| Fatigue ground truth | D | [S70] | **Unavailable** | Absent |
| Near-miss labels | D | — | **Unavailable** (only self-reported) | Absent |
| Verified competency labels | D | [S15] | **Unavailable** (simulator scores are a partial proxy) | Absent |

## 6. Feasibility verdict

| Item | Feasibility (36–48 h demo) | Feasibility (site pilot) | Evidence | Key risk |
|---|---|---|---|---|
| R1 Daily task dashboard | **High** | High | Tier A fields confirmed [S1][S2]. Tasks come from mock dispatch | Task schedule data is not in telematics and needs a dispatch integration |
| R2 Operator safety | **High** (deterministic rules on SIMULATED data) | **Medium** | Seatbelt and proximity events exist commercially [S5][S9]. Standards bound the scope to warnings [S24] | Duplicate in-cab alarms alongside Cat Detect and Seat Belt Reminder. Signal access (Tier B/C) |
| R3 Training hub | **High** (content, quiz, booking) | Medium | Simulator scoring exists [S15]. Part-task training evidence [S51] | Content curation and instructor sign-off. Efficacy is unproven |
| R4 Unusual behaviour | **Medium**: idle is high; unsafe-pattern anomaly is medium | **Low–Medium** | Idle prevalence [S49]. Anomaly and skill literature [S41][S48] | Skill signals are Tier B proprietary. Separating machine from operator needs fault codes + Operator ID. False positives |
| R5 Task-time estimation | **Medium** | Medium | Telematics productivity modelling is noisy [S47]. CQR coverage [S50] | Little historical task-labelled data. Exchangeability breaks across sites and seasons |
| Closed-loop hypothesis | **Medium** (demonstrable only as SIMULATED) | **Low** evidence today | Cat and Volvo run partial loops [S4][S30]. Skill metrics exist [S41] | Effect not measurable without field A/B or pre/post data. Regression to the mean. Goodhart effects |

## Challenge to brief

1. **The closed loop is partly commercial already.** VisionLink Productivity lets managers track coaching-tip trends and target training [S4], and Volvo links end-of-shift tips to instructional videos with trend graphs [S30]. The innovation claim should narrow to *safety-behaviour* competencies, context-normalised recurrence, and statistically tested re-assessment (see 15-novelty).
2. **Tier B implement, joystick and hydraulic signals are OEM-proprietary.** The anomaly model should also be demonstrable on a **Tier A + seatbelt/proximity-events-only** feature set, and should report how performance changes when Tier B is removed. [PROPOSED]
3. **Seatbelt rule anchor.** Cat's product triggers on *parking brake released + belt unbuckled* [S9]. Sentinel's T-CRIT should use `parking_brake_off OR travel_speed > v0` with belt unbuckled, so it still works when speed is unavailable. [PROPOSED]
4. **Avoid alarm stacking.** When an OEM system (Cat Detect, Seat Belt Reminder) already annunciates in-cab, Sentinel should **log, contextualise and escalate (T4)** rather than add a second in-cab alarm. Its own T-CRIT in-cab alert fires only where no OEM annunciator is present, and that is configured per machine. This follows the ISA-18.2 rate principles [S29]. [PROPOSED]
5. **ISO 25119 is agriculture/forestry, not EMM.** Cite ISO 19014 as the EMM functional-safety standard and ISO 13849 as the general one. ISO 21815 is the standard directly relevant to proximity.

## References

"(snippet)" means verified through search-result text only.

- [S1] Cat VisionLink Full Fleet Management — https://www.cat.com/en_US/products/new/technology/equipment-management/equipment-management/102680.html (snippet)
- [S2] Cat ISO 15143-3 (AEMP 2.0) API Developer Guide — https://digital.cat.com/knowledge-hub/articles/iso-15143-3-aemp-20-api-developer-guide (snippet; 403 on fetch)
- [S3] Cat Operator Coaching for Excavators — https://www.cat.com/en_US/products/new/technology/productivity/productivity/123420.html (snippet)
- [S4] Caterpillar: three new VisionLink Productivity features (8 Jul 2024) — https://highways.today/2024/07/08/caterpillar-3-visionlink/ ; Cat release: https://www.cat.com/en_US/news/machine-press-releases/caterpillar-launches-three-new-features-for-visionlink-productivity.html (snippet)
- [S5] Cat Detect – People Detection — https://www.cat.com/en_US/products/new/technology/detect/detect/117380.html (snippet)
- [S6] Cat Detect with Smart Camera — https://www.cat.com/en_US/products/new/attachments/technology-kits/technology-kits/113860.html (snippet)
- [S7] Cat Detect for Personnel — https://h-cpc.cat.com/cmms/v2?f=product&it=product&cid=423&lid=en&sc=US&gid=1000027535&pid=1000030201&nc=1 (snippet); [S7b] Object Detection — https://h-cpc.cat.com/cmms/v2?f=product&it=product&cid=423&lid=en&sc=US&gid=1000027535&pid=102400&nc=1 (snippet)
- [S8] Cat 2D E-Fence — https://www.cat.com/en_US/products/new/technology/detect/detect/15969806.html (snippet)
- [S9] Cat Seat Belt Reminder — https://www.cat.com/en_US/products/new/attachments/technology-kits/technology-kits/113020.html ; https://www.cat.com/en_US/articles/for-owners/enhance-safety-with-cat-seat-belt-reminder.html (snippet)
- [S10] Cat MineStar Detect – Fatigue — https://www.cat.com/en_US/by-industry/mining/surface-mining/surface-technology/detect1/fatigue.html (snippet)
- [S11] Seeing Machines–Caterpillar agreement (2015) — https://www.prnewswire.com/news-releases/seeing-machines-and-caterpillar-sign-global-agreement-for-product-development-licensing-and-distribution-300142076.html (snippet)
- [S12] International Mining, "Cat DSS – evolving and growing rapidly" (2024) — https://im-mining.com/2024/02/08/cat-dss-evolving-and-growing-rapidly/
- [S13] Cat Command — https://www.cat.com/en_US/by-industry/construction-industry-resources/technology/command.html (snippet)
- [S14] Cat Payload for Excavators — https://www.cat.com/en_US/products/new/technology/payload/payload/15969808.html (snippet)
- [S15] Cat Simulators — https://www.cat.com/en_US/support/cat-training/simulators.html ; https://catsimulators.com/ (snippet)
- [S16] Cat Heavy Equipment Operator Training — https://www.cat.com/en_US/support/cat-training/Heavy-Equipment-Operator-Training.html (snippet)
- [S17] Cat excavator line update (Grade, Payload) — https://www.forconstructionpros.com/equipment/earthmoving/product/22942839/caterpillar-cat-caterpillar-updates-excavator-line-with-grade-tech-new-interface-and-payload-upgrades (secondary)
- [S18] Cat 320 Excavator (Operator ID) — https://www.cat.com/en_US/products/new/equipment/excavators/medium-excavators/126532.html (snippet; exact page attribution unverified)
- [S21] SAE J1939 top-level — https://www.sae.org/standards/content/j1939_201104/ ; [S21b] https://www.csselectronics.com/pages/j1939-explained-simple-intro-tutorial
- [S22] J1939 Body/Cab parameters (SPN 1856 seat belt switch) — https://j1939hub.com/j1939-network-categories-pgn-spn-and-diagnostic-reference/ (secondary)
- [S23] ISO 5006:2017 — https://www.iso.org/standard/45609.html
- [S24] ISO 21815-1:2022 — https://www.iso.org/standard/77302.html ; [S24b] ISO/TS 21815-2:2021 — https://www.iso.org/standard/77303.html
- [S25] ISO 17757:2019 — https://www.iso.org/standard/76126.html
- [S26] ISO 13849-1:2023 — https://www.iso.org/standard/73481.html
- [S27] ISO 25119-1:2018 — https://www.iso.org/standard/69025.html
- [S28] ISO 19014-1 https://www.iso.org/standard/70715.html ; -2 https://www.iso.org/standard/73568.html ; -4 https://www.iso.org/standard/70718.html ; TS 19014-5 https://www.iso.org/standard/80996.html
- [S29] Yokogawa/Control Engineering, ISA-18.2 implementation — https://www.yokogawa.com/library/resources/media-publications/implementing-alarm-management-per-the-ansi-isa-182-standard-control-engineering/ (secondary; benchmark figures via snippet)
- [S30] Volvo Operator Coaching for Excavators — https://www.volvoce.com/europe/en/volvo-services/dig-assist/operator-coaching/
- [S31] Volvo Dig Assist Start / Load Assist (2019) — https://www.volvogroup.com/en/news-and-media/news/2019/jun/volvo-dig-assist-start.html
- [S32] Volvo EcoOperator Advanced — https://www.volvoce.com/europe/en/volvo-services/advanced-operator-training/
- [S33] Komatsu Operator Guidance Monitor — https://www.komatsu.com/en-ae/services/fleet-optimization/operator-guidance-monitor (snippet)
- [S34] Komatsu KOMTRAX — https://www.komatsu.com/en-za/services/remote-monitoring/komtrax (snippet)
- [S35] John Deere JDLink — https://www.forconstructionpros.com/construction-technology/equipment-monitoring-logistics/product/10088033/john-deere-jdlink (secondary)
- [S36] Hitachi machine reports (ConSite) — https://www.hitachicm.com/eu/en/service/fleet-management/machine-reports-apps/ (snippet)
- [S37] Built Robotics Exosystem — https://www.builtrobotics.com/technology/exosystem (snippet)
- [S40] Bernold (2007), JCEM 133(11) — https://ascelibrary.org/doi/10.1061/(ASCE)0733-9364(2007)133:11(889)
- [S41] Sekizuka et al. (2020), Front. Robot. AI — https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2019.00142/full
- [S42] Agarwal et al. (2022) — https://arxiv.org/abs/2211.07941
- [S43] Bae, Kim, Hong (2019), IJPEM 20(12) — https://doi.org/10.1007/s12541-019-00219-5
- [S44] Working stage identification of excavators from operating-handle signals — https://www.sciencedirect.com/science/article/abs/pii/S0926580521003241 (title only)
- [S46] Automated activity recognition of construction workers and equipment: review, JCEM 146(6) — https://ascelibrary.org/doi/abs/10.1061/(ASCE)CO.1943-7862.0001843 (title only)
- [S47] Kassem et al. (2021), Autom. Constr. 124 — https://doi.org/10.1016/j.autcon.2020.103532
- [S48] Automatically detecting excavator anomalies based on ML, Symmetry (2019) — https://doi.org/10.3390/sym11080957 (snippet)
- [S49] Construction Equipment, "How to manage engine idling" — https://www.constructionequipment.com/sustainability/article/10757122/how-to-manage-engine-idling-for-efficiency
- [S50] Romano, Patterson, Candès (2019), Conformalized Quantile Regression — https://papers.neurips.cc/paper/8613-conformalized-quantile-regression.pdf
- [S51] So et al. (2013), Human Factors — https://doi.org/10.1177/0018720812454292 (snippet)
- [S60] NIOSH Science Blog, struck-by (2023) — https://www.cdc.gov/niosh/bulletin/2023/struck-by-stand-down.html
- [S61] MSHA Powered Haulage Safety — https://www.msha.gov/safety-and-health/safety-and-health-initiatives/powered-haulage-safety
- [S62] HSE, Work-related fatal injuries in GB — https://www.hse.gov.uk/statistics/fatals-overview.htm
- [S63] Heavy equipment and truck-related deaths on excavation work sites, J. Safety Res. (2006) — https://www.sciencedirect.com/science/article/abs/pii/S002243750600106X (snippet)
- [S70] Talebi, Rogers, Drews (2022), Mining 2(3) — https://doi.org/10.3390/mining2030029 (snippet)
- [S71] Modeling mine workforce fatigue: leading indicators in operational data sets, Minerals (2021) — https://doi.org/10.3390/min11060621 (title only)
