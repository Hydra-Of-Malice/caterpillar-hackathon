# 10 — MVP Implementation Architecture

**Owner:** Edge AI Architect · **Depends on:** 03-architecture, 04-ml-approaches, 05-digital-twin (tables), 08-training-loop, 13-evaluation (M1–M18), ui-theme.md

Tag legend: [ESTABLISHED] cited · [HYPOTHESIS] · [PROPOSED] · [SIMULATED].

## 1. Scope pins [PROPOSED]

| Dimension | MVP value |
|---|---|
| Machines | 1 machine type (`EX-20t`, 320D-class excavator), 2 machine units (needed for machine-vs-operator attribution) |
| Tasks | 2 task types: `truck_loading`, `trenching`. Idle and travel are handled by rules |
| Operators | 4 fictional operators; Ravi (novice) is the demo subject |
| IF models | 2 contexts × 2 sensor variants (B-only, B+C) = 4 models (04 §4) |
| Host | One laptop as the stand-in edge, with the "cloud" as a second process on the same host. A second laptop holds a cloned copy |

## 2. Repository layout

```text
cat-sentinel/
├─ docker-compose.yml          # broker, db; python services run natively for fast iteration
├─ Makefile / scripts/demo_up.ps1
├─ config/
│  ├─ mosquitto.conf           # persistence true; listener 1883; listener 9001 + protocol websockets
│  ├─ rules.yaml               # T-CRIT + procedural thresholds, debounce, rule_version
│  ├─ fusion.yaml              # tau1, tau2, m_E table, in-cab gate, rate limits
│  ├─ alert_policy.yaml        # tier timers (ack 60 s, T3/T4 conditions)
│  ├─ geofences.geojson        # loading zone TL-1, trench edge, travel lane (fictional site)
│  ├─ competencies.yaml        # catalog v0.1 + event→competency map (08 §8.2–8.3)
│  └─ checklist.yaml           # pre-shift items, critical flags
├─ shared/  schemas.py (pydantic: TelemetrySample, FeatureWindow, Event, Alert, Incident) · topics.py
├─ sim/
│  ├─ generator.py             # seeded physics-lite excavator cycles + operator random effects
│  ├─ injectors.py             # U1–U7, N1–N2, C1–C3 (13 §5)
│  ├─ scenarios/  ravi_shift0.yaml · ravi_shift1.yaml · ravi_shift2.yaml · baseline_fleet.yaml
│  ├─ replay.py                # JSONL → MQTT at 1× or N×
│  └─ recordings/              # rehearsed runs, one per demo beat
├─ edge/
│  ├─ safety/  main.py · rules.py · health.py      # separate process, no ML imports (lint-enforced)
│  ├─ pipeline/ features.py · context.py · anomaly.py · machine_health.py · fusion.py · explain.py
│  ├─ alerts/  manager.py                           # tiering, rate limit, ack, escalation, incidents
│  ├─ eta/     estimator.py                         # LightGBM quantiles + CQR offset
│  ├─ store/   db.py · schema.sql · outbox.py
│  ├─ sync/    agent.py
│  └─ api/     main.py · routes/{shift,tasks,alerts,incidents,training,health,demo}.py · ws.py
├─ cloud/
│  ├─ api/     main.py · routes/{ingest,profile,competency,training,copilot,supervisor,monitoring}.py
│  ├─ db/      schema.sql (Postgres; hypertables for feature_window, telemetry_agg)
│  ├─ profile/ baselines.py · gap_evidence.py (Gamma–Poisson) · reassess.py (Poisson GLM)
│  ├─ rag/     ingest.py · index.py (FAISS + BM25) · answer.py · verify.py · corpus/ (SAMPLE SOPs)
│  └─ monitoring/ drift.py · alert_rates.py
├─ ml/
│  ├─ train_iforest.py · calibrate_ecdf.py · set_thresholds.py (alert budget)
│  ├─ train_tasktime.py · conformalize.py · export_onnx.py (P2)
│  ├─ eval/   injected_eval.py · null_calibration.py · coverage.py   # 13 M2, M5, M11
│  └─ models/ <model_id>/{model.pkl|booster.txt, model_card.json, sha256}
├─ web/src/
│  ├─ pages/ OperatorHome.tsx · InCabLive.tsx · IncidentLog.tsx · TrainingHub.tsx · Supervisor.tsx
│  ├─ components/ TCritOverlay · AlertBanner · EtaBand · ProximityRing · ProtectionStatus · ExplanationChips · SimWatermark
│  └─ lib/ mqtt.ts (mqtt.js over WS) · api.ts (generated from OpenAPI) · theme.css (ui-theme.md tokens)
└─ tests/ test_rules_truth_table.py · test_rules_property.py (hypothesis) · test_fusion.py ·
          test_independence.py · test_latency_e2e.py · test_offline_faults.py · test_conformal_coverage.py ·
          test_rag_citations.py · test_role_guard.py
```

## 3. Services

| # | Service | Command | Port | Contents |
|---|---|---|---|---|
| 1 | broker | `eclipse-mosquitto:2` (docker) | 1883, 9001 (WS) | Local pub/sub |
| 2 | sim | `python -m sim.run --scenario ravi_shift1 --seed 42` or `python -m sim.replay recordings/beat3.jsonl` | — | Generator, injectors, demo-control subscriber |
| 3 | safety | `python -m edge.safety.main` | — | Rule engine, 1 Hz heartbeat |
| 4 | edge-api | `uvicorn edge.api.main:app --port 8000` | 8000 | Pipeline, alert manager, ETA, SQLite and sync as asyncio tasks. Also serves the web build |
| 5 | cloud-api | `uvicorn cloud.api.main:app --port 8100` | 8100 | Ingest, profile, competency, RAG, supervisor, monitoring |
| 6 | db | `timescale/timescaledb` (docker) | 5432 | Fallback: `cloud.db` SQLite via the same SQLAlchemy models |
| 7 | web | `npm run dev` (5173) → `npm run build` for the demo | 5173 | React app |

## 4. MQTT topics

Prefix: `sentinel/v1/{site}/{machine_id}/`. JSON payloads carry `schema_version`, `ts`, `seq`, `source ∈ {SIM, REPLAY, REAL}` and `t_pub_ns`.

| Topic | Publisher → subscribers | QoS | Retained | Rate | Payload (abridged) |
|---|---|---|---|---|---|
| `telemetry/raw` | sim / replay / CAN adapter → safety, edge-api | 0 | no | 10 Hz | travel_kmh, swing_dps, seatbelt, joy[4], throttle, rpm, hyd_bar, prox_person_m, prox_truck_m, gps, dtc[] |
| `telemetry/tier_a` | telematics adapter → edge-api | 1 | no | 1/min | smu_h, idle_h, fuel_l, dtc[] |
| `safety/alert` | safety → UI, edge-api (mirror) | 1 | no | event | alert_id, rule_id, rule_version, state (raised/cleared), evidence |
| `safety/heartbeat` | safety → UI, edge-api | 0 | **no** (a retained beat would look alive after a crash) | 1 Hz | rule_version, sensor_health{} |
| `context/task_state` | edge-api → UI, pipeline (never the safety engine) | 1 | yes | event | task_id, state, source (operator_tap / dispatch / inferred) |
| `health/{component}` | all → edge-api, UI | 0 | no | 1 Hz | status, versions, backlog |
| `sim/control` | demo panel → sim | 1 | no | event | scenario, inject (seatbelt_open, person_inner, fast_swing, hyd_fault, idle), speed |

Advisory alerts (T1–T4) travel over the FastAPI WebSocket, not MQTT, so the alert manager is their single owner.

## 5. API endpoints (FastAPI, `/api/v1`)

**Edge (port 8000)**

| Method + path | Purpose | Req |
|---|---|---|
| `GET /health` | Heartbeat age, broker, rule/model versions, sync backlog | all |
| `GET /shift/current` · `POST /shift/{id}/checklist` · `POST /shift/{id}/start` (409 if incomplete or a critical item failed) · `POST /shift/{id}/end` | Shift lifecycle | R1 |
| `GET /tasks?shift_id=` · `PATCH /tasks/{id}` | Tasks, progress | R1 |
| `POST /context/task-state` | "Waiting for truck" tap | R4 |
| `GET /tasks/{id}/eta` | `{p10,p50,p90,nominal:0.8,model_version,label}` | R5 |
| `GET /alerts` · `POST /alerts/{id}/ack` · `POST /alerts/{id}/feedback` (423 while the machine is moving) | Alerts, ack, relevance labels | R2/R4 |
| `GET /incidents` · `GET /incidents/{id}` · `POST /incidents` | Auto and manual incidents | R2 |
| `GET /conditions` | Weather, visibility, lighting (MOCKED) + staleness | R2 |
| `GET /operator/me/profile` · `GET /training/cache` | Own data; offline module cache | R3 |
| `GET /sync/status` · `POST /sync/flush` · `POST /metrics/latency` | Store-and-forward; latency telemetry | — |
| `WS /ws/live` | Frames: `window`, `alert`, `eta`, `task`, `health` | all |
| `POST /demo/inject` · `POST /demo/wan {up}` | Only when `DEMO_MODE=1`. Forwards injections to `sim/control`. The WAN switch partitions the sync agent from cloud-api, which runs on the same host | — |

**Cloud (port 8100)**

| Method + path | Purpose | Req |
|---|---|---|
| `POST /ingest/batch` | Idempotent upsert by UUID | — |
| `GET /operators/{id}/profile` | Profile view (05 §5.4) | R3 |
| `POST /competency/evaluate` | Run mapping + gap rule for a shift | R3 |
| `PATCH /competency/{operator_id}/{competency_id}/state` | `demonstrated` requires instructor role or a passing `assessment_id` (05 §5.3) | R3 |
| `GET /training/recommendations` · `GET /training/modules/{id}` · `POST /training/quiz/{module_id}/attempts` | Modules, quiz | R3 |
| `GET /instructors/slots` · `POST /bookings` | Mock booking | R3 |
| `POST /copilot/ask` | `{answer, citations[{chunk_id,doc_id,version,section}], mode: generative/extractive/refused}` | R3 |
| `GET /reassessment?operator_id=&competency_id=` | Pre/post rate, RR, 95 % CI, `label:SIMULATED` | R3 |
| `GET /supervisor/crew-summary` · `GET /supervisor/escalations` · `GET /supervisor/machine-issues` | Aggregates only | R2/R4 |
| `GET /monitoring/drift` · `GET /monitoring/alert-rates` · `GET /models` | 03 §6 | — |

## 6. Database tables

Names follow 05 §5.4 where they overlap.

| Table | Edge (SQLite) | Cloud (Postgres) | Key columns beyond 05 |
|---|---|---|---|
| `operator`, `shift`, `task` | ✔ | ✔ | task: `type, planned_qty, status, progress_pct, started_at, done_at` |
| `checklist_item`, `checklist_result` | ✔ | ✔ | `critical`, `result`, `ts` |
| `telemetry_raw` | ✔ 72 h ring | aggregated hypertable | `ts, seq, source, payload` |
| `feature_window` | ✔ | ✔ hypertable | `context_key, features, score, p, r, variant, model_version` |
| `event` | ✔ | ✔ | per 05 (tier, source, attribution, versions) |
| `alert` | ✔ | ✔ | `event_id, tier, shown_at, ack_at, escalated_to, suppressed_reason, t_render` |
| `incident` | ✔ | ✔ | `source (auto/manual), event_ids, severity, snapshot_ref, status, dispute_status` |
| `exposure`, `break_log` | ✔ | ✔ | per 05 |
| `context_baseline`, `operator_competency` | cached, read-only | ✔ source | per 05 |
| `competency_catalog`, `training_record`, `assessment`, `expert_envelope` | cache | ✔ | per 05 |
| `training_module`, `rag_chunk` | approved cache | ✔ | `doc_id, version, section, sha256, approval_status` (08 §8.5) |
| `booking`, `instructor_slot` | — | ✔ | MOCKED |
| `feedback_label` | ✔ | ✔ | `alert_id, useful, reason, reviewer_role` |
| `reassessment`, `monitoring_report`, `audit_log` | — | ✔ | RR, CI; PSI; state changes |
| `model_registry` | pinned | ✔ | `kind, context_key, version, sha256, active` |
| `outbox` | ✔ | — | `uuid, table, row_id, priority, attempts, synced_at` |

## 7. React pages

| Page | Route | Req | Key elements |
|---|---|---|---|
| Operator Home | `/home` | R1, R3, R5 | Shift header; task list with progress bars and EtaBand (P50, P10–P90 range); pre-shift checklist gating "Start shift"; required-training card; machine card (SMU, fuel; Tier A SIMULATED); conditions card with staleness |
| In-cab Live | `/cab` | R2, R4, R5 | Dark theme, ≥ 64 px targets (ui-theme.md). TCritOverlay (octagon, tone). AlertBanner T1/T2 with "why" chips and ACK. Seatbelt status. ProximityRing, or "proximity not monitored". "Waiting for truck" toggle. ProtectionStatus (heartbeat). Current task + ETA. Continuous-operation timer. SIMULATED watermark |
| Incident Log | `/incidents` | R2 | Filter by tier/type/attribution. Detail drawer: ±10 s telemetry sparkline, explanation, context, versions. Manual-entry form. Dispute annotation |
| Training Hub | `/training` | R3 | Gap card (evidence first). Module viewer with citations. Quiz. Copilot with mode badge. Mock instructor booking. Simulator and expert-demo placeholder cards. Competency grid. Before/after chart (SIMULATED caption) |
| Supervisor | `/supervisor` | R2, R4, R5 | Crew aggregates (no leaderboard). T4 escalations. Machine-attributed issues. Re-assessment panel. Drift and alert-rate panel. Crew-level task-time plan |

## 8. What is real, rule, simulated or mocked

Say this table out loud in the pitch.

| Element | Class | Detail |
|---|---|---|
| Isolation Forest (4 models), ECDF percentiles, alert-budget thresholds | **REAL MODEL** | Trained and calibrated on SIMULATED windows; live inference |
| LightGBM P10/P50/P90 + CQR | **REAL MODEL** | Trained on SIMULATED task history, or supplied logs if they are usable |
| Robust-z explainer; TreeSHAP post-shift (P1) | **REAL** | Deterministic statistic / real SHAP |
| Embedding + BM25 retrieval, LLM generation, citation verifier | **REAL** | LLM is a live API call; extractive fallback is real |
| Gamma–Poisson gap evidence, re-assessment GLM | **REAL** statistics | Run on SIMULATED events |
| Seatbelt, inner proximity zone, over-speed, sensor-health | **RULE** | `rules.yaml`, versioned |
| Excessive idle + context gate; procedural rules | **RULE** | |
| Fusion, in-cab gate, tiering, rate limits, escalation | **RULE** | Hand-set weights (04 §5.3) |
| Event → competency map, recurrence floor, attribution | **RULE** | Versioned YAML (08 §8.3) |
| Tier B signals, Tier C distances, GPS, truck presence | **SIMULATED INPUT** | Seeded generator |
| Tier A (SMU, fuel, idle hours, DTCs) | **SIMULATED INPUT** | Unless the hackathon dataset supplies them |
| Ravi and other operators, Shift 0 seed, Shift 2 improvement, expert envelopes | **SIMULATED INPUT** | Shift 2 is a generator parameter change |
| CAN/J1939 gateway, Product Link / AEMP API, Cat Detect hardware | **MOCKED INTEGRATION** | Adapter interfaces + fixtures |
| Weather API, LMS, instructor/simulator booking, expert videos, SMS/email notifications, SSO/roles | **MOCKED INTEGRATION** | Placeholders; role switcher |
| Training corpus | Team-authored SAMPLE SOPs | Watermarked; not official Caterpillar content (08) |

## 9. Acceptance criteria

All ML numbers are [SIMULATED]. M-numbers refer to 13-evaluation.

**R1 — Daily task dashboard**
- AC1.1 Home renders shift, ≥ 5 tasks, progress and ETA bands in ≤ 2 s (warm) and ≤ 3 s (cold) on the demo laptop.
- AC1.2 A task-state change appears on Home and In-cab in ≤ 1 s.
- AC1.3 "Start shift" stays disabled until every checklist item is answered. A failed critical item returns 409 and creates an incident (3/3 scripted cases).
- AC1.4 With the WAN disabled, Home loads from the edge with an "offline" badge (M17).

**R2 — Operator safety**
- AC2.1 100 % pass on ≥ 50 truth-table, boundary and property cases, including flapping switch, NaN, stuck-at and missing signal → sensor-fault (M1). 0 T-CRIT false alerts in clean scripted runs (M3).
- AC2.2 T-CRIT p99 < 200 ms (target) and ≤ 500 ms (ceiling) over ≥ 200 injected events, measured with `t_pub_ns` → `t_render` (M4).
- AC2.3 With edge-api killed, T-CRIT still renders in 10/10 trials, and those T-CRITs appear in the incident log after restart (broker-queued persistent session). Heartbeat loss shows PROTECTION DEGRADED within 3 s in 10/10.
- AC2.4 Every T-CRIT and T2 creates an incident within 1 s with a ±10 s snapshot, context and versions. A manual incident takes ≤ 30 s.
- AC2.5 Person in inner zone → T-CRIT. Removing Tier C → B-only variant plus "proximity not monitored" banner, with no crash (M18).
- AC2.6 Conditions panel shows temperature, visibility and lighting with a staleness timestamp.

**R3 — Training hub**
- AC3.1 Within 10 s of Shift 1 ending, a C04 gap appears with evidence (7 events, 2 shifts, P ≥ 0.8), using the seeded Shift 0.
- AC3.2 100 % of module citations resolve to an approved `chunk_id@version` (automated check).
- AC3.3 Gold set: 100 % cited, ≥ 90 % supported (30 Qs), ≥ 95 % correct refusals (10 Qs) (M13). With the LLM key removed, the copilot shows the extractive badge with no errors.
- AC3.4 Quiz attempt stored. Booking row created with competency and evidence. The ML service account gets 403 when setting `demonstrated`.
- AC3.5 After the Shift 2 replay: `behavior_trend=improving`, RR with 95 % CI and a SIMULATED caption (M14).

**R4 — Unusual-behaviour detection**
- AC4.1 Injected U1–U3 at ≥ 1.5×: event-level recall ≥ 0.80 and precision ≥ 0.60 at budget, reported beside the robust-z baseline (M2).
- AC4.2 On clean held-out hours, T1 ≤ 1.0/h and T2 ≤ 0.2/h, upper 95 % CI (M3).
- AC4.3 Ungated idle > T_idle raises an event in 100 % of U7 cases. Under `waiting_for_truck`: 0 alerts and a suppressed-with-reason log entry.
- AC4.4 U5 hydraulic spikes across ≥ 2 operators are attributed to `machine` and excluded from competency counts in ≥ 90 % of events.
- AC4.5 100 % of ML alerts show the top-2 features with value and baseline. Per-window processing p99 ≤ 50 ms (M16).

**R5 — Task-time estimation**
- AC5.1 Every task shows P50 and P10–P90, and the quantiles never cross.
- AC5.2 On the time-later test split, coverage is 0.75–0.85 overall and is reported per task type (M11).
- AC5.3 P50 MAE is ≥ 15 % better than the per-task-type historical median. If not, ship the baseline and say so.
- AC5.4 The remaining-time estimate refreshes within 1 s of a progress update, using pre-task features plus progress only.

**Cross-cutting.** Every generator-derived view carries a SIMULATED watermark. All M17 fault scripts pass.

## Challenge to brief

1. **Machine-vs-operator separation needs ≥ 2 machines and ≥ 2 operators in the simulation**, even though the demo follows only Ravi.
2. **Scope down IF contexts to 2 task types.** "Per machine type × task type" otherwise multiplies models without adding demo value.
3. **ONNX Runtime appears in the default stack but edge optimisation is P2.** The MVP runs native scikit-learn and LightGBM behind a `predict(features) → score` interface. `export_onnx.py` is a stretch item, so ONNX is not on the critical path.
