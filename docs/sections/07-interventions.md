# 07 — Explainable safety-intervention architecture

Tags: [ESTABLISHED] cited · [HYPOTHESIS] untested · [PROPOSED] our design choice · [SIMULATED] synthetic data.

**Design goal:** every alert is *rare, true, explained and actionable*. Critical protections are deterministic and never suppressed. Everything else competes for a limited attention budget.

---

## 1. Tier hierarchy [PROPOSED, per brief]

| Tier | Purpose | Trigger source | Modality | Channel | Ack required | Suppression / deferral allowed? | Max rate (per operator) |
|---|---|---|---|---|---|---|---|
| **T-CRIT** | Immediate hazard: seatbelt unbuckled while machine in motion; person/object in the critical proximity zone; over-speed | **Deterministic rule only** (edge safety process) | Full-width red banner + distinct urgent tone + seat haptic (if fitted) | In-cab immediately. Auto-logged to the incident log. Supervisor notified per site policy. | Yes, but it cannot be dismissed while the condition persists. The display clears only after the condition clears plus hysteresis. | **Never.** Only sensor-validation filtering (switch bounce ≤ 200 ms) is allowed. | No cap on onsets. Each continuous condition is announced once and latched (no re-chime until clear, then re-entry). |
| **T2** elevated risk | Contextual risk, e.g., high swing speed near an occupied truck-loading zone | Fusion: rule + ML anomaly + context gate | Amber banner + short two-tone chime | In-cab | Yes (single press or steering-free button) | De-duplication only. No workload deferral, because the risk is present now. | ≤ 1 per 5 min per alert type. ≤ 4 per hour total. |
| **T1** advisory | Early deviation, e.g., approach speed trending up, break check-in | Rule or ML (score ≥ threshold, persistence ≥ N windows) | Icon + ≤ 6-word text. No sound, or a soft chime only at low workload. | In-cab | No (auto-dismiss 8 s, stays in the side list) | **Yes:** workload deferral, context suppression, batching | ≤ 1 per 10 min. ≤ 6 per hour (EEMUA-aligned, §2). |
| **T3** recommended safe stop / break | Time-on-task limit; T2 recurrence; machine-health concern | Deterministic ToT rule, or escalation from T1/T2 recurrence | Banner + one chime | In-cab + logged | Yes, with a choice: "Stopping now" / "In 10 min" / "Not needed (tell us why)" | Deferral to the next safe stopping point, ≤ 10 min | ≤ 1 per 60 min |
| **T4** supervisor escalation | Repeated T-CRIT, unacknowledged T2/T3, operator help request, incident | Deterministic escalation rules only (no ML score alone) | Supervisor console + radio/SMS per site | Supervisor. **The operator is always told an escalation was sent.** | Supervisor ack required | No | Bundled per incident. ≤ 1 per 15 min per operator unless there is a new T-CRIT type. |
| **T0** coaching | Recurring pattern, linked to the competency gap and training | ML + competency mapping (≥ 3 events across ≥ 2 shifts, context-normalised) | Text + chart | **Post-shift report only.** Never in-cab while moving. | No | Batched by design | ≤ 3 coaching items per shift report |

---

## 2. Alarm-fatigue evidence

| Source | Domain | Finding | Design implication |
|---|---|---|---|
| Breznitz 1984, *Cry Wolf* ([Routledge](https://www.routledge.com/Cry-Wolf-The-Psychology-of-False-Alarms/Breznitz/p/book/9780898592962)) | Psychology of warnings | False alarms erode the credibility of later warnings ("cry-wolf" effect) [ESTABLISHED] | Every non-critical alert has a precision target and a false-alarm budget. |
| Bliss, Gilson & Deaton 1995, *Ergonomics* 38 ([PubMed](https://pubmed.ncbi.nlm.nih.gov/7498189/)) | Lab, 138 participants, 25/50/75% reliable alarms | Confirmed the cry-wolf effect. Response rates tracked alarm reliability (probability matching) [ESTABLISHED] | A T1 that is right 50% of the time will get about 50% compliance. Promote to audible only if field precision is high. |
| Dixon, Wickens & McCarley 2007, *Human Factors* ([PubMed](https://pubmed.ncbi.nlm.nih.gov/17702209/)) | Dual-task simulation | False-alarm-prone automation hurt performance more than miss-prone automation. It reduced both compliance and reliance [ESTABLISHED] | For non-critical ML tiers, tune toward fewer false alarms and accept some misses. Critical hazards stay deterministic. |
| Lees & Lee 2007, *Ergonomics* 50(8) ([T&F](https://www.tandfonline.com/doi/full/10.1080/00140130701318749)) | Collision-warning simulator | False alarms reduced trust and compliance. "Unnecessary" alarms (a real threat condition the driver judged benign) did not [ESTABLISHED] | **Explain** why an alert fired, so justified but unexpected alerts are not read as false. |
| Joint Commission SEA 50, 2013 ([JC](https://www.jointcommission.org/en-us/knowledge-library/newsletters/sentinel-event-alert/issue-50)) | Hospitals | 85–99% of alarm signals need no clinical action. 98 alarm-related events, 80 deaths (2009–2012) [ESTABLISHED] | Alarm flooding kills. Treat the alert rate as a safety KPI. |
| Sendelbach & Funk 2013, *AACN Adv. Crit. Care* 24(4) ([AACN](https://aacnjournals.org/aacnacconline/article/24/4/378/14745/Alarm-FatigueA-Patient-Safety-Concern)) | ICU review | 72–99% of clinical alarms are false. Desensitisation leads to missed alarms [ESTABLISHED] | Same as above. |
| ANSI/ISA-18.2-2016 ([ISA](https://www.isa.org/products/ansi-isa-18-2-2016-management-of-alarm-systems-for)) | Process industry | Alarm lifecycle: philosophy → identification → rationalisation → design → monitoring → management of change [ESTABLISHED]. The flood definition of >10 alarms per 10 min is taken from secondary summaries (standard is paywalled; verify). | Maintain an **alert rationalisation register**: every alert type has a documented consequence, operator action, allowed response time and priority. |
| EEMUA 191 ([EEMUA](https://www.eemua.org/products/publications/digital/eemua-publication-191)); ASM Consortium benchmark ([Honeywell ASM](https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/white-papers/February%2028%202005%20-%20Acheiving%20Effective%20Alarm%20System%20Performance%20Benchmarking.pdf)) | Process industry | Steady-state target is < 1 alarm per 10 min per operator. Only about one-third of benchmarked consoles achieved it (per secondary summary of the ASM paper; verify against the PDF) [ESTABLISHED, figures to verify] | Total in-cab non-critical budget: **≤ 6 per hour**, target ≤ 3. |
| Scott & Gray 2008, *Human Factors* 50(2) ([PubMed](https://pubmed.ncbi.nlm.nih.gov/18516837/)) | Rear-end warnings, 16 drivers | Tactile warnings gave faster responses than visual or auditory [ESTABLISHED] | Seat haptic reserved for T-CRIT, so it keeps its meaning. |
| Edworthy, Loxley & Dennis 1991, *Human Factors* 33(2) ([SAGE](https://journals.sagepub.com/doi/10.1177/001872089103300206)) | Auditory warnings | Pitch, speed, rhythm and envelope reliably change perceived urgency [ESTABLISHED] | Map urgency to sound parameters (§5.2). |
| NHTSA visual-manual guidelines 2013 ([Fed. Reg.](https://www.federalregister.gov/documents/2013/04/26/2013-09883/visual-manual-nhtsa-driver-distraction-guidelines-for-in-vehicle-electronic-devices)) | In-vehicle HMI | ≤ 2 s single glance, ≤ 12 s total eyes-off-road per task [ESTABLISHED] | In-cab alerts must be readable in one glance of ≤ 2 s. No multi-step interaction while moving. |

---

## 3. Suppress / delay / escalate / immediate rules [PROPOSED]

**Workload state** (computed on the edge every 250 ms):
- **HIGH:** travel > 1 km/h, or swing/boom active with a loaded bucket, or proximity warning zone occupied, or a T2/T-CRIT within the last 30 s.
- **LOW:** parking brake or hydraulic lockout engaged, or idle ≥ 10 s, or task state = "waiting for truck".

| ID | Rule | Applies to |
|---|---|---|
| IMM-1 | T-CRIT fires within **≤ 500 ms p99** of the condition becoming true. It bypasses all queues, workload checks and rate limits. | T-CRIT |
| IMM-2 | "Moving" for the seatbelt rule means **any** of travel, swing or implement motion with lockout disengaged, not travel only. | T-CRIT |
| IMM-3 | A T-CRIT pre-empts the display. Pending T1 items are cleared from the screen and requeued. | All |
| SUP-1 | Context suppression: excessive-idle T1 is suppressed while task state = "waiting for truck", or during a scheduled break or warm-up period. It is still logged with `suppressed_reason`. | T1 idle |
| SUP-2 | Machine-caused anomalies (active fault code on the relevant subsystem) are routed to maintenance, not to the operator as behaviour. | T1/T2 |
| SUP-3 | ML-only alerts are suppressed when input data quality is flagged (stale > 2 s, out-of-range, clock jump). | T1/T2 |
| SUP-4 | Never suppress a T-CRIT for any reason, including operator feedback, context, or model state. | T-CRIT |
| DEL-1 | Non-critical info is **never** shown during HIGH workload. T1 waits for LOW or a 30 s HIGH-free gap. It is dropped (logged) if still pending after 10 min. | T1 |
| DEL-2 | T3 break recommendation is deferred to the next LOW state, max 10 min. | T3 |
| DEL-3 | All T0 items are batched to the post-shift report. | T0 |
| DEB-1 | Onset debounce: ML/fusion alerts need persistence ≥ 3 consecutive 10 s windows (or 2 of 3). Rule-based T1 needs ≥ 5 s. | T1/T2 |
| HYS-1 | Hysteresis: separate raise/clear thresholds, e.g., swing-speed z ≥ 2.5 to raise, ≤ 1.5 to clear. Proximity clears only after the zone has been empty for ≥ 2 s. | T-CRIT clear, T1/T2 |
| DED-1 | De-duplication: same (type, zone, cause) within a 5 min window becomes one alert with a count, not repeats. | T1/T2 |
| ESC-1 | Recurrence: ≥ 3 T1 of the same type in 30 min → one T2. ≥ 3 T2 of the same type in a shift → T3 "safe stop and review". | T1→T2→T3 |
| ESC-2 | T2 unacknowledged for 20 s → re-annunciate once. Still unacknowledged at 60 s → T4. | T2 |
| ESC-3 | Second T-CRIT of the same type in one shift → T4 (incident review), operator informed. | T-CRIT |
| ESC-4 | Operator "Help" button → T4 immediately. | Any |
| RATE-1 | Global non-critical budget: if T1+T2 > 6 in the last 60 min, raise the T1 thresholds by one step for that operator and log an "alert flood" event for engineering review. T2 thresholds stay unchanged. | T1 |

---

## 4. Alert content design

**Template [PROPOSED]:** `WHAT (≤ 6 words)` · `WHY (evidence vs your baseline / rule)` · `DO (one action verb)` · tier colour + icon. The WHY line is also stored in the incident log so the explanation can be audited.

| Alert | In-cab text (glanceable) | Detail (post-shift / on tap when stationary) |
|---|---|---|
| **T-CRIT seatbelt** | **FASTEN SEATBELT — MACHINE MOVING** · Rule: belt open + swing active · **Stop and buckle** | "Seatbelt switch open for 3 s while swing active at 12:41. Logged as incident #0142. Rule SB-01 (deterministic)." |
| **T2 swing near truck** | **SLOW SWING — TRUCK ZONE** · Swing 38°/s, usual ≤ 25°/s here · **Reduce swing speed** | "Swing speed 2.9 SD above your truck-loading baseline for 40 s. Truck zone occupied. Top factors: swing rate, approach speed. Anomaly score 0.81 (model v0.3). Tap 'Alert was wrong' if the context was different." [SIMULATED values] |
| **T1 excessive idle** (shown when not suppressed) | **IDLE 12 MIN** · No task waiting · **Shut down if waiting > 5 min** | "Engine idle 12 min with no 'waiting for truck' state. Earlier idle 09:10–09:25 was suppressed: waiting for truck." |
| **T3 break check-in** | **BREAK CHECK-IN** · 2 h 10 min without break · **Take a break at next stop** | "Continuous operation since 10:05. Site plan recommends a break every 2 h. Choose: Stopping now / In 10 min / Not needed." |

Wording rules: plain language; state the measured fact before any interpretation; no blame words ("careless", "unsafe operator"); fatigue phrasing follows §6 of section 06.

---

## 5. Human-machine interaction

### 5.1 In-cab display constraints [PROPOSED]

| Constraint | Value |
|---|---|
| Glance time | Readable in ≤ 2 s (NHTSA basis above). One alert on screen at a time. Queue shown as a count badge. |
| Text | ≤ 3 lines. Headline in capitals, ≥ 8 mm character height at the seated eye point. |
| Colour + shape redundancy | Red/amber/blue plus a distinct icon shape, readable by colour-blind operators and in sunlight or at night (auto-dim). |
| Input | Gloved-hand targets ≥ 15 mm. No typing. No scrolling while any motion is active. |
| Placement | Near the line of sight to the working area, not blocking the field of view. Coordinate with the OEM display. |
| Status strip | Always-visible health: "Safety rules OK / DEGRADED", "Proximity: available / NOT FITTED". Missing protection must be visible, never silent. |

### 5.2 Audio [PROPOSED]

| Tier | Sound | Rationale |
|---|---|---|
| T-CRIT | Fast pulsed, higher pitch, repeats until ack or clear, plus haptic | High urgency mapping (Edworthy 1991) |
| T2 | Two-tone, played once, re-annunciated once at 20 s | Medium urgency |
| T1 | Silent, or a single soft chime at LOW workload | Avoids habituation |
| All | Must remain audible over cab noise. Level set per machine against measured cab noise (ISO 7731 method; specific margins unverified). Maximum 3 distinct sounds in total. | Learnability |

### 5.3 Operator feedback loop

A "**This alert was wrong**" button appears on every T1/T2/T3 (in-cab when LOW workload, or post-shift). It offers reasons: *not a hazard · wrong context (e.g., waiting for truck) · sensor/machine issue · other*.

| Step | Mechanism |
|---|---|
| Capture | Feedback is stored with the alert ID, model version, feature snapshot and context state. |
| Monitor | Per alert type × context: precision proxy (1 − wrong-rate), alert rate/hour, ack latency, suppression counts. Drift check on feature distributions. |
| Act | Weekly **human** review, with no online auto-retraining from feedback (prevents gaming). Threshold changes go through a management-of-change record (ISA-18.2 lifecycle). |
| Limits | Feedback on T-CRIT creates a *sensor-check work order*. It never mutes the rule. |

---

## 6. Offline, failure behaviour and independence

**Architecture:** the deterministic safety process (`safety-rules`) runs as its own OS process on the edge. It subscribes directly to raw Tier B/C topics and drives the alert display and sound with its own watchdog. It has **no dependency** on the ML service, database, cloud or LLM. The ML and fusion services only *publish* candidate T1/T2 events to the arbiter.

| Failure | Behaviour [PROPOSED] |
|---|---|
| Network / cloud loss | No change in-cab. Events are queued in SQLite (store-and-forward). The dashboard shows "offline since hh:mm". |
| ML service crash / latency > 1 s | T1/T2 ML alerts pause. The status strip shows "Advisory degraded". T-CRIT is unaffected. Watchdog restarts the service. |
| Stale or implausible sensor (> 1 s) | Show "Seatbelt sensor fault — check belt" (fail-visible). Log a maintenance event. Do not assume the safe state. |
| Proximity hardware absent | Status shows "Proximity: NOT FITTED". The rule is not silently disabled. |
| Broker (MQTT) down | The safety process falls back to a direct CAN/serial reader if present. Otherwise it shows "SAFETY MONITOR OFFLINE" and gives an audible notice. |
| Clock jump | Monotonic clock for all timers. Wall clock is used only for logs. |

**Scope caveat [ESTABLISHED context]:** real machine safety functions fall under ISO 19014 functional safety for earth-moving machinery ([ISO 19014-1](https://www.iso.org/standard/70715.html)). Collision warning systems fall under ISO 21815-1, which states such systems assist, and responsibility stays with the operator ([ISO 21815-1](https://www.iso.org/standard/77302.html)). Our prototype is **not** a certified safety system. It is a supplementary warning layer.

**Testing [PROPOSED]:**
- **Unit:** a truth table per rule, covering boundary values, hysteresis edges and the debounce timing.
- **Property-based:** Hypothesis library. For example, "T-CRIT always fires within 500 ms for any belt-open + motion sequence" and "T1 never displays during HIGH".
- **Scenario replay:** the demo shifts [SIMULATED] replayed as golden tests. Assert the exact alert sequence and the alert budget (≤ 6/h non-critical).
- **Fault injection:** kill the ML process, drop the broker, send NaN or stale values, jump the clock, starve CPU. Assert that T-CRIT latency and status-strip behaviour hold.
- **Latency:** p99 onset-to-display measured on the target edge device.

---

## 7. Privacy and anti-surveillance

| Data / view | Operator | Supervisor | Fleet / engineering |
|---|---|---|---|
| Own alerts, explanations, feedback, training, competency states | **Full** (operator-owned view, export on request) | No | Pseudonymised aggregates only |
| T-CRIT incidents and T4 escalations | Yes | **Yes** (event + context, as needed for safety response) | Pseudonymised |
| T0/T1 coaching detail, ML anomaly scores | Yes | **No.** Aggregates only (e.g., crew-level alert rates) | Pseudonymised |
| Fatigue research signal (06) | Yes (labelled research) | **Never** | Study data only under consent |

**Rules [PROPOSED]:**
- No automated disciplinary, pay, rostering or authorisation decision from any score (brief).
- No per-operator risk leaderboards.
- Retention: raw telemetry 30 days on the edge, incidents per site legal requirement.
- Run a DPIA and consult worker representatives before a pilot.
- Using AI to evaluate worker behaviour may be high-risk under EU AI Act Annex III(4) ([Reg. 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)). Legal review is required.

---

## Challenge to brief

1. **Define "moving" for seatbelt T-CRIT as any travel, swing or implement motion with hydraulic lockout disengaged.** Travel-only misses the main excavator hazard: swinging while unbelted.
2. **"Never suppressed" needs a precise meaning.** It should mean never *hidden or rate-limited*. Switch-bounce filtering, latching (no re-chime during one continuous condition) and clear-hysteresis are required. Without them a chattering belt switch causes an alarm flood, which is itself a hazard.
3. **Proximity T-CRIT depends on optional Tier C hardware.** Absence must be shown explicitly ("NOT FITTED"). Use a two-zone design: warning zone → T2, critical zone → T-CRIT.
4. **T4 transparency:** the brief should state that the operator is always notified when a supervisor escalation is sent. This supports trust and the anti-surveillance goal.
