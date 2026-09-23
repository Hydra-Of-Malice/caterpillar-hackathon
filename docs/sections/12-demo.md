# 12 — Live Demonstration Scenario

**Owner:** Hackathon Technical Strategist · **Depends on:** 00-design-brief (Ravi journey), 03-architecture, 05-digital-twin, 08-training-loop (demo numbers), 10-mvp (AC*), 13-evaluation

Tag legend: [PROPOSED] unless stated. Every number on screen from the generator is **[SIMULATED]**. Values in `{braces}` are filled from the final rehearsal run and are never typed in by hand.

## 1. Setup

**Stage roles**

| Person | Role on stage |
|---|---|
| D | Presenter and narrator. Owns the timing and the "what's real" call-outs |
| C | Driver at the laptop. Plays Ravi: taps, ACKs, navigates |
| B | Sim operator. Triggers injections from the hidden demo panel, runs the kill/offline actions, calls "switching to replay" |
| A | Watches the health/latency overlay and answers ML questions |

**T−15 min checklist**
- `scripts/demo_reset` → seed Shift 0 (2 C04 events, SIMULATED) → start services → warm the models.
- Tabs open: `/home` (light), `/cab` (dark, full screen), `/incidents`, `/training`, `/supervisor`. Latency overlay on.
- Audio test for the T-CRIT and T2 tones. OS notifications off.
- Backup laptop on the same tag, idling in replay mode. Backup video queued. Phone hotspot ready, used only for the LLM.

**Fallback protocol.** B says "switching to replay". `sim.replay recordings/beatN.jsonl` then drives the same pipeline and UI. Replay is disclosed out loud. If the UI itself fails, play the matching video segment and narrate over it.

## 2. Script (target 6:30, hard stop 7:00)

### 0:00–0:25 — Frame
- **On screen:** Title, the closed-loop diagram (Observe → … → Adapt) and a four-colour strip: REAL models · RULES · SIMULATED telemetry · MOCKED integrations.
- **Say:** "This laptop is acting as the excavator's edge computer. Telemetry is simulated from a seeded generator. Product Link, the CAN bus and Cat Detect are mocked. The models are real, trained on simulated data. Critical safety is owned by rules, not ML."
- **Audience concludes:** The team is precise about evidence. Safety comes first.
- **Backup:** Slide only.

### 0:25–1:10 — Beat 1: Ravi starts his shift (R1, R5, R3)
- **On screen:** Operator Home.
  - Ravi (novice), EX-20t, 5 tasks with progress bars.
  - Each task shows a P50 with its P10–P90 band, e.g., "Load trucks, stockpile A: P50 {p50}, range {p10}–{p90}".
  - Required-training card and conditions card (temperature, visibility, "updated 2 min ago").
  - C leaves one checklist item open, so "Start shift" stays disabled. C completes it and the button enables.
- **Say (real/sim/mock):** "Task times come from a real LightGBM quantile model with conformal calibration, trained on simulated history. The 80 % band covered {coverage} of held-out tasks. Checklist gating is a rule. Weather is mocked."
- **Audience concludes:** R1 is there. R5 gives an honest range, not a single number.
- **Backup:** ETA endpoint fails → fixture flag serves precomputed ETAs (say so). Page fails → screenshot, move on.

### 1:10–1:55 — Beat 2: Seatbelt T-CRIT, offline and without ML (R2)
- **On screen:**
  1. B switches Wi-Fi off, which cuts the real internet and the LLM. B also flips the demo WAN switch (`/demo/wan`), which partitions the sync agent from the cloud process on the same laptop. The header shows "Cloud: offline".
  2. `/cab` (dark). B injects `seatbelt_open` while tracking. A full-screen red octagon "FASTEN SEATBELT" appears with a tone. The overlay shows {tcrit_latency_ms}.
  3. C "fastens", the alert clears, and an incident toast appears.
  4. B kills the edge-api process in a visible terminal. The banner reads "Advisory ML offline".
  5. B injects `seatbelt_open` again. T-CRIT still fires.
  6. The process auto-restarts.
- **Say:** "The seatbelt rule is deterministic: belt open while travelling above 0.5 km/h for at least a second. We just killed the entire ML service and the alert still fired. The rule engine is a separate process with no ML code, talking straight to the display. We're also offline. The internet cut is real; the cloud link is a simulated partition, because our 'cloud' runs on this laptop. This is an advisory that mirrors OEM systems, not a certified safety function."
- **Audience concludes:** Safety doesn't depend on ML or the network.
- **Backup:** Kill step misbehaves → show the automated independence test result (AC2.3, 10/10). No T-CRIT → replay `beat2.jsonl`.

### 1:55–3:00 — Beat 3: Truck loading, contextual alerts with explanations (R2, R4)
- **On screen:**
  1. Ravi enters loading zone TL-1. ProximityRing shows the truck at about {truck_m} m.
  2. B injects fast swing near the truck (U1). First a T1 advisory: "Swing speed near the truck is higher than usual for truck loading ({value} vs typical {baseline} °/s). Ease the swing before dumping."
  3. Repeats escalate to a T2 (orange triangle, tone, ACK required). Chips: *swing speed near truck +{z1}σ*, *approach speed +{z2}σ*, *context: loading zone, truck nearby*. C taps ACK.
  4. B injects `person_inner` and a T-CRIT "PERSON IN ZONE" overrides everything.
- **Say:** "The anomaly score comes from a real Isolation Forest for this excavator class doing truck loading, scoring 20-second windows. Anomalous isn't the same as unsafe. An ML alert only reaches the cab in a high-exposure context like this one, and it's compared with the population baseline, not Ravi's own habits. Proximity distances are simulated; on a real machine they'd come from a system like Cat Detect, which is mocked here. The person-in-zone alert is a rule."
- **Audience concludes:** Alerts are context-aware, explained and acknowledged. Critical proximity stays deterministic.
- **Backup:** Replay `beat3.jsonl`. IF misbehaves → `--precomputed` scores, disclosed.

### 3:00–3:40 — Beat 4: Idle in context; machine vs operator (R4)
- **On screen:**
  1. C taps "Waiting for truck". Idle runs 6 simulated minutes (10× speed) with no alert, and a grey line reads "Idle suppressed: waiting_for_truck".
  2. C un-taps. Idle continues and the idle event fires.
  3. B injects hydraulic spike bursts plus a fault code (U5). The in-cab machine card and the event show "MACHINE: hydraulic spikes + active DTC → maintenance flag, excluded from operator competency". This is attributed on the edge, still offline.
- **Say:** "Idle is a rule with a context gate. The tap is self-reported, so we cross-check it against truck presence and audit how often each operator uses it. An active fault code alongside the anomaly means a machine problem, so Ravi is not coached for it. After sync, the cloud adds cross-operator evidence, which you'll see in the supervisor view."
- **Audience concludes:** R4 separates machine from operator. Context removes nuisance alerts.
- **Backup:** Replay `beat4.jsonl`.

### 3:40–4:05 — Beat 5: Incident log and store-and-forward (R2)
- **On screen:**
  - `/incidents` lists both seatbelt T-CRITs (including the one raised while ML was dead), the T2, the person-in-zone T-CRIT and the idle event. Each has a ±10 s sparkline, context, attribution and versions.
  - C adds a manual incident: "Soft ground near trench edge, section T2".
  - The header reads "{n_queued} records queued". B turns Wi-Fi and the WAN switch back on, and the queue drains to "synced".
- **Say:** "Everything is logged locally even offline, and nothing is lost. Events Ravi disagrees with can be annotated and disputed."
- **Audience concludes:** Traceable, offline-safe, operator-facing.
- **Backup:** Sync fails → the "queued" state is itself the point; flush to the local cloud DB.

### 4:05–5:05 — Beat 6: Post-shift gap → targeted training (R3)
- **On screen:**
  1. C ends the shift, and only now does the T0 summary appear: "In 5 of 42 loading cycles, swing speed near the truck was above the expert P90."
  2. Training Hub gap card: **C04 Approach & swing control, observed gap, 7 events across 2 shifts, P = 0.91 (high)**, evidence first.
  3. A 3-minute module with citations `[sop-loading@1.2 §3]`.
  4. Copilot question: "How should I control swing speed approaching the truck?" The answer carries citations and a badge "3/3 citations verified".
  5. Out-of-corpus question: "What is the relief pressure on a 320?" Answer: "No approved source covers this."
  6. Quiz (3 items), then a mock instructor booking.
- **Say:** "The gap comes from rules and statistics, not the LLM: a recurrence floor plus exposure-normalised evidence. Shift 0 is seeded simulated history. The content is team-written sample SOPs, not Caterpillar material. The LLM is live, but code checks every sentence against its cited source. Safety-critical topics are extractive only. Booking is mocked."
- **Audience concludes:** The closed loop runs from behaviour to competency to grounded, targeted training.
- **Backup:** LLM slow or down → extractive toggle (badge) or cached answer (badge "cached"). Gap evaluation fails → precomputed profile JSON.

### 5:05–5:55 — Beat 7: Shift 2 re-assessment and supervisor view (loop closure)
- **On screen:**
  1. B replays Shift 2 at 20× (about 15 s). Fewer advisories appear.
  2. Before/after chart: 7/81 → 2/45 over-envelope loading cycles, **RR 0.51 (95 % CI 0.05–2.70) [SIMULATED]**. `behavior_trend = improving → assessment scheduled`.
  3. Role switch to Instructor (mocked auth), sign-off, state becomes `demonstrated`.
  4. `/supervisor`: crew aggregates, escalations, alert rate vs budget. A machine ticket reads "EX-20t-02: same hydraulic signature with 2 operators + DTC → MACHINE"; the other operator's history is SIMULATED. No leaderboard.
- **Say:** "Shift 2 is a generator parameter change. This shows the measurement pipeline works, not that training works. The confidence interval spans 1, so we would never claim improvement from this. Only an instructor sets 'demonstrated', and that sign-off is mocked. Proving efficacy needs the stepped-wedge pilot in our evaluation plan."
- **Audience concludes:** The loop is measurable end to end and honest about what the evidence supports.
- **Backup:** Precomputed re-assessment JSON; screenshot.

### 5:55–6:30 — Close
- **On screen:** Architecture slide (two paths, edge-first) and the what's-real table (10 §8). Measured today: T-CRIT p99 {tcrit_p99_ms} ms, ML processing p95 {ml_p95_ms} ms, injected-anomaly recall {m2_recall} at {m3_rate} false T1/h, ETA coverage {coverage}, all SIMULATED.
- **Say:** "Next step: a four-week pilot on three machines with Product Link and CAN access, instructor-labelled alerts and a stepped-wedge rollout."
- **Audience concludes:** Credible, buildable, safety-first, with a clear path from demo to evidence.
- **Backup:** None needed. 0:30 buffer to the 7:00 hard stop.

## 3. Requirement coverage

| Req | Beats |
|---|---|
| R1 Dashboard | 1 |
| R2 Safety | 2, 3, 5 |
| R3 Training | 1 (required), 6, 7 |
| R4 Unusual behaviour | 3, 4 |
| R5 Task time | 1, plus EtaBand in-cab throughout |

## Challenge to brief

1. **Shift 0 must be seeded.** "≥ 3 events across ≥ 2 shifts" cannot fire after Shift 1 alone. This agrees with 05 and 08. We disclose it out loud in Beat 6.
2. **Add the offline and ML-kill proof (Beat 2).** The brief's journey does not include it, yet it is the strongest evidence that the architecture is safety-first.
3. **"Measurably fewer events" in Shift 2 is not statistically distinguishable** at demo sample sizes (CI 0.05–2.70). Show the CI rather than hide it. Judges who know statistics will reward this.
