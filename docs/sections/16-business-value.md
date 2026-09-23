# 16 — Business value: what CAT Sentinel is worth to Cat customers and to Caterpillar

All figures are ESTIMATES from `config/value_model.yaml` (version `value-model-1.0.0`) computed by `sentinel/value/`. Prototype metrics are [SIMULATED]. **No customer ROI has been measured.** A pilot must prove it (§6).

Tags: [ESTABLISHED] = published statistic with URL. [VENDOR CLAIM] = OEM, vendor or trade-press claim, usually phrased "up to". [ASSUMPTION] = team judgement to be replaced by pilot data. "(snippet)" = verified from search-result text only, because the page returned 403 or timed out.

Unit of analysis: one 20 t excavator (Cat 320 class) at a US contractor, 1,500 engine h/yr, of which 35% is idle.

## 1. Headline numbers (the numbers on the judges' slide; `GET /api/v1/value/pitch`)

| Headline | Base | Range (P10–P90) | Stress corners (all-worst / all-best) |
|---|---|---|---|
| Annual value per machine (gross) | **$5,100** | $5,100–9,200 | $700 / $45,000 |
| Net of the $1,200/yr subscription (hypothetical price) | **$3,900** | $4,200–8,000 | −$1,700 / $44,400 |
| 10-machine fleet, gross / net | **$51k / $39k per yr** | net $42k–80k | — |
| Payback on the one-off $1,500/machine | **4.6 months** | 1.9–5.4 months | 0.8 months / never |
| Fleet output uplift from coaching + training | **+2.7%** | +2.1–4.9% | +0.9% / +8.8% |
| Idle fuel saved | **$260/machine/yr** (276 L) | $180–500 | $50 / $980 |

How to read the ranges. P10–P90 comes from 1,000 seeded Monte Carlo draws, with each uncertain assumption drawn independently from a triangular(low, base, high) distribution. Most ranges skew upward, so **our base case sits below the Monte Carlo P10. We quote the base.** Independence narrows the band. Correlated sites, for example high hours together with a large skill gap, would widen it. The corners put all 47 uncertain assumptions at their worst, or all at their best, at once. They are stress tests, not forecasts. With every assumption at its worst and the highest price, Sentinel does not pay back. We say so rather than hide it.

## 2. Value by lever (base case, per machine per year; `POST /api/v1/value/estimate`)

| Lever | Sentinel feature | Gain (operational units) | USD | Evidence strength |
|---|---|---|---|---|
| Productivity | Practice Analyser, T0 coaching (R3) | +2.7% output; +21 m³/shift; 26 productive h freed | **$2,050** | Gap: [VENDOR CLAIM]. Closure: [ASSUMPTION] |
| Planning | Task dashboard + P10/P50/P90 estimates (R1, R5) | 10 truck-wait h avoided; smaller bid contingency | **$1,070** | [ASSUMPTION] |
| Idle | Context-gated idle detection (R4) | −79 idle h (−25 min/shift), −276 L fuel, −740 kg CO₂ | **$810** | Idle share: [ESTABLISHED]. Reduction: [ASSUMPTION] |
| Training | Training hub + Practice Analyser (R3) | 14 days sooner to proficiency and 8 instructor h saved per new operator | **$700** | Analogue evidence (§4) |
| Wear | Smooth-operation coaching, attribution (R4) | −1.5% non-fuel operating cost | **$370** | [ASSUMPTION], weak evidence |
| Safety (expected value) | Seatbelt/proximity rules, fast-swing coaching, incident log (R2) | −25% precursor events (19 per machine-yr) → −10% expected machine-related incidents | **$130** | Rates and costs: [ESTABLISHED]. Reduction: [ASSUMPTION] |
| **Total** | | | **$5,130** | |

Top sensitivity drivers (tornado, net $ swing per machine): gap closure fraction ($2,480), size of the operator skill gap ($2,360), engine hours per year ($2,030), subscription price ($1,800), idle reduction ($1,360). **The pilot must measure the first two.**

Why the safety line is small. Safety is an *expected value*: expected machine-related incident cost is about $1,260 per machine-year (0.008 recordables, 0.1 property-damage events, 4×10⁻⁵ deaths), and we claim only a 10% cut. That is conservative on purpose. A single struck-by fatality costs $1.54M in NSC economic cost, before litigation, stop-work, EMR and bid-eligibility effects. Pitch safety as tail-risk protection plus a leading indicator. Do not pitch it as a dollar line.

## 3. Sourced figures that drive the model

| # | Figure | Value | Tag | Source |
|---|---|---|---|---|
| 1 | Average idle share, NA fleets | Komatsu 38% (about 75,000 machines); Volvo 28–30%; 20% realistic target | [ESTABLISHED] (trade press quoting OEM data) | https://www.constructionequipment.com/sustainability/article/10757122/how-to-manage-engine-idling-for-efficiency |
| 2 | Idle fuel burn | About 1 gal (3.8 L) per idle hour; excavators 3–5 L/h | [VENDOR CLAIM] (snippet) | https://www.forconstructionpros.com/business/business-services/coaching-consulting/blog/22578411/caterpillar-cat-save-a-gallon-an-hour-on-the-jobsite-by-reducing-idle-time |
| 3 | Idle hours use up warranty, PM intervals and resale value | Qualitative (Sunrock, Komatsu quotes) | [ESTABLISHED] qualitative; $/h is [ASSUMPTION] | Same as #1 |
| 4 | Diesel price, US on-highway 2025 average | $3.66/gal ($0.97/L) | [ESTABLISHED] (snippet) | https://www.eia.gov/dnav/pet/pet_pri_gnd_a_epd2d_pte_dpgal_w.htm |
| 5 | 20 t excavator fuel cost | $8.55–20.25/h at $4.50/gal (about 7–17 L/h) | [VENDOR CLAIM] (snippet) | https://www.equipmentworld.com/maintenance/maintenance/article/14945250/oo-costs-excavators |
| 6 | Operator skill spread in output | 10–15% tons/h on the same machine (attributed to Caterpillar studies) | [VENDOR CLAIM], secondary | https://www.toolgrit.com/guides/excavator-production-rates |
| 7 | Skilled vs novice fuel efficiency | Up to 30% | [VENDOR CLAIM], secondary | https://www.khl.com/1134885.article |
| 8 | Operator median wage | $28.66/h, $59,600/yr (May 2025); 534,100 jobs; 3–4 yr apprenticeships | [ESTABLISHED] | https://www.bls.gov/ooh/construction-and-extraction/construction-equipment-operators.htm |
| 9 | Operator shortage | 77% of firms find heavy-equipment operators hard to fill; 45% had project delays from shortages; 57% say candidates lack skills; 42% raised training spend | [ESTABLISHED] | https://www.agc.org/sites/default/files/users/user21902/2025%20Workforce%20Survey%20Analysis%20(3).pdf |
| 10 | Cost per work injury / death | $48,000 per medically consulted injury; $1.54M per death (2024) | [ESTABLISHED] (snippet) | https://injuryfacts.nsc.org/work/costs/work-injury-costs/ |
| 11 | Indirect cost multiplier | Indirect costs are 1.1–4.5× direct costs | [ESTABLISHED] (snippet) | https://www.osha.gov/safetypays/background |
| 12 | Construction injury rates, 2023 | 2.3 recordables per 100 FTE; 9.6 deaths per 100,000 FTE (1,075 deaths) | [ESTABLISHED] (snippet) | https://www.bls.gov/iif/ ; https://www.bls.gov/news.release/cfoi.nr0.htm |
| 13 | Struck-by share | 150 construction struck-by deaths in 2020; struck-by = 12.2% of construction injury cost (Liberty Mutual WSI) | [ESTABLISHED] | https://www.cdc.gov/niosh/bulletin/2023/struck-by-stand-down.html ; https://stopconstructionfalls.com/wp-content/uploads/2026/03/Liberty-Mutual_Construction-Workplace-Safety-Index-1.pdf (snippet) |
| 14 | Near-miss ratio | 1 serious : 10 minor : 30 property : 600 near-miss (Bird 1969; contested) | Sanity check only | https://en.wikipedia.org/wiki/Accident_triangle |
| 15 | Cat Next Gen 20 t claims | Up to 45% efficiency vs traditional grading (Cat Grade); up to 25% less fuel; up to 15% lower maintenance vs previous series | [VENDOR CLAIM] | https://hub-4.com/news/three-next-generation-cat-excavators-deliver-more-choices-for-increased-efficiency-and-lower-operating-costs-in-20-ton-size-class |

Figures that are pure assumptions: machine ownership cost ($40/h), non-fuel operating cost ($25/h), time-value realisation (50%), truck-wait hours, subscription price, wear reduction. Before the pilot, cross-check the cost rates against EquipmentWatch and USACE EP 1110-1-8 (https://www.usace.army.mil/Missions/Cost-Engineering/EP1110-1-8/).

## 4. Training effect (`training_effect` in the YAML, for the practice cohort simulation)

We found no field study of targeted feedback for Cat excavator operators. The evidence below comes from analogue domains.

| Evidence | Domain / design | Result | Tag |
|---|---|---|---|
| Seymour et al. 2002, https://pubmed.ncbi.nlm.nih.gov/12368674/ | Surgery, RCT (n = 16), VR training to expert criterion | 29% faster in the operating room; 6× fewer errors | [ESTABLISHED] |
| Mazzone et al. 2021, https://pubmed.ncbi.nlm.nih.gov/33630473/ | Proficiency-based progression (PBP) meta-analysis | −60% errors, −15% procedure time vs standard training | [ESTABLISHED] (snippet) |
| Cook et al. 2011, https://jamanetwork.com/journals/jama/article-abstract/1104300 | Simulation meta-analysis | About 1.1 SD skill gain vs no intervention; 0.5 SD on patient outcomes | [ESTABLISHED] |
| PBP for utility excavation, https://pmc.ncbi.nlm.nih.gov/articles/PMC7217447/ | RCT (n = 12) + rollout (44 workers) | −33% critical errors; utility strikes −35% to −61% | [ESTABLISHED] |
| Excavator simulator transfer, https://ascelibrary.org/doi/10.1061/9780784479827.196 | Simulator vs real machine | Simulator group matched the real-machine group after about 10 h on the real excavator | [ESTABLISHED] (snippet) |
| CM Labs, https://cm-labs.com/en/resource/11-benefits-of-training-with-simulators/ | Vendor | Up to 40% less real-equipment training time | [VENDOR CLAIM] |

| Parameter | Low | Base | High | Rationale |
|---|---|---|---|---|
| Time-to-proficiency reduction | 5% | **15%** | 29% | Base = PBP procedural-time gain; high = Seymour RCT |
| Learning-rate multiplier (= 1 / (1 − reduction)) | 1.05× | **1.18×** | 1.41× | Derived |
| Critical-error reduction | 20% | **33%** | 60% | Utility-excavation RCT (base), PBP meta-analysis (high) |

## 5. How value accrues to Caterpillar (generic; no Cat financials assumed)

| Channel | Mechanism | Evidence |
|---|---|---|
| Digital subscription revenue | Per-machine subscription layered on VisionLink/Product Link data. Sentinel reads the AEMP 2.0 API and needs no new hardware | VisionLink Productivity is already a Cat subscription [S4 in 02-feasibility] |
| Dealer services | Instructor-led training and simulator bookings (SimU Campus, Demonstration & Learning Centers) triggered by gap evidence. Wear events routed to dealer service | Cat already sells operator training through dealers [S16] |
| Technology attach | Payload, Detect and Seat Belt Reminder become more valuable when their events feed a coaching loop, which supports attach rates | [PROPOSED] |
| Retention and differentiation | A "safety-competency" loop plus measured re-assessment goes beyond efficiency tips (15-novelty §4). Customer switching costs rise once operator records live in the Cat ecosystem | [HYPOTHESIS] |
| Fleet sales story | "More m³ per operator-hour" helps sell machines into the operator shortage (77% of firms report operators hard to find) | AGC 2025 [ESTABLISHED] |

## 6. Pilot design to prove ROI (90 days, 10 machines)

| Item | Design |
|---|---|
| Arms | 5 treatment machines (Sentinel on) vs 5 control machines (telemetry logged, no Sentinel UI). Same site or matched sites, same machine class and task mix. Randomise machine–operator pairs to arms; pairs never cross arms |
| Timeline | Days 1–30: baseline on all 10 (Sentinel silent). Days 31–90: treatment active. Analysis: difference-in-differences with an exposure (engine-hour) offset |
| Primary KPIs | (1) m³ per productive hour (Cat Payload / VisionLink Productivity); (2) avoidable idle share of engine hours (AEMP 2.0 idle vs task state); (3) precursor events per 100 engine h (belt off while moving, person in zone, fast swing near truck) |
| Secondary KPIs | Fuel L/m³; cycle time and bucket fill; days to proficiency for new operators; instructor hours; truck wait min/load; P50 task-time error and P10–P90 coverage; near-miss reports per 100 h; alert acknowledgement and false-alarm ratings |
| Lagging (report, do not power on) | Recordable injuries and property damage. 90 days × 10 machines cannot detect them statistically |
| Success threshold (pre-registered) | Output ≥ +1.5% and avoidable idle ≤ −8% vs control, with 90% CI excluding zero. Converts to ≥ the model's low case |
| Guardrails | No operator ranking. Operators see their own data. Machine-attributed events excluded from competency records |
| Output | Replace the ASSUMPTION rows (gap closure, idle reduction, precursor reduction, realisation) with measured values in `config/value_model.yaml` and version-bump |

## 7. Honesty notes and challenge to brief

- The user suggestion "+15–25% output from trained operators" is **not supported for a fleet**. The evidence supports a 10–15% skill spread between operators [VENDOR CLAIM]. Closing 20% of it gives about +2.7% fleet output. For an individual **novice** trainee (30% deficit, closing 25% of the gap), we can defend **+11% (P10–P90: 7–18%)**. That figure is in `GET /value/gains-headline`.
- The Practice Analyser example (trainee 180 vs expert 245 m³/h, SIMULATED) gives: closing 25% of the gap = **+84 m³/shift, +9% output, about $6,400/yr per operator**.
- The planning lever is second largest yet rests entirely on assumptions. Present it as upside until R5 accuracy is measured.
- Wear is excluded from the pitch headline. Cat's own "Machine Health" tips show the lever exists, but we found no public % to support it.
- Cat already sells engine idle shutdown and Operator Coaching (efficiency and machine-health tips). Sentinel's idle value is *incremental*: context gating and coaching on avoidable idle only. We therefore claim −15% idle hours, not the −45% implied by moving to the 20% target.

## 8. API (router `sentinel.value.api:router`, mounted under `/api/v1`)

| Call | Returns |
|---|---|
| GET `/value/assumptions` | All assumptions (low/base/high, unit, tag, source, note) + `training_effect` |
| POST `/value/estimate` `{fleet_size?, overrides?, scenario?: low\|base\|high, top_n?}` | `gains` (operational units, per machine and fleet), `usd` (per lever, gross, net, payback), `scenarios`, `uncertainty` (P10/P50/P90), `sensitivity` tornado, `label` |
| POST `/value/practice` `{productivity, overrides?, scenario?, closure?}` | "Closing X% of your gap = +Y m³/shift = $Z/yr per operator", gains, usd, ladder (10/25/50%), assumptions |
| GET `/value/levers` | Feature (R1–R5 + Practice Analyser) → lever, KPI, how measured |
| GET `/value/unit-costs` | $/idle min ($0.17), $/m³ ($0.53), $/cycle-second/shift ($21), EV $/avoided DANGER/WARNING event ($7), $/training day ($124), $/hour of earlier completion ($130), $/incident type |
| POST `/value/today` `{fleet_summary?}` | Gains first, then USD line items. With no body it uses the SIMULATED demo shift |
| GET `/value/pitch` · GET `/value/gains-headline` | §1 numbers · five hero gains with ranges and evidence |
