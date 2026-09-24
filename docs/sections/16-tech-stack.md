# 16 — Tech Stack, Choices and Architectural Flow

*Companion to `03-architecture.md`, which predates the AI Task Centre. This document covers the
whole system as built, the reason behind each technology choice, and what every part is for.*

---

## 1. The system in one paragraph

CAT Sentinel is **two products sharing one codebase and one data model**:

1. **The in-cab copilot** — a safety and coaching layer that consumes machine telemetry at 10 Hz,
   scores behaviour, raises tiered alerts, and estimates task times. It runs on an **edge** service
   (port 8000) that is designed to keep working with no network.
2. **The AI Task Centre** — a worksite coordination layer for administrators, supervisors and
   operators: accounts, geofenced start/finish punches, assignable tasks with checkpoints, chat,
   review queues and a rule-based "what could happen" panel. It runs on the **cloud** service
   (port 8100).

They are deliberately separable. The Task Centre is **additive**: it added `tc_*` tables and an
`/api/v1/tc` surface without changing a line of the copilot's behaviour path.

---

## 2. Tech stack, and why — not what else

### Backend

| Choice | Used for | Why this, not the alternative |
|---|---|---|
| **Python 3.11** | All services | The ML libraries we actually need (scikit-learn, LightGBM, SciPy, statsmodels) are Python-first. Choosing Go or Node for the API would have meant a second language and an RPC hop just to reach the models. |
| **FastAPI** | Both HTTP services | Pydantic validation *is* the schema, so the API contract and the runtime check are one artifact and cannot drift. Flask would need a separate validation layer; Django brings an ORM, admin and migrations we do not want at the edge. |
| **Pydantic v2** | Every wire contract | Validation at the boundary, once. It also let us fix a real bug: `ser_json_inf_nan="constants"` keeps `NaN` alive across the wire, so a faulty proximity sensor stays detectably faulty instead of arriving as `null`. |
| **SQLAlchemy 2.0** | Data access | Typed ORM with a real Core escape hatch for the few aggregate queries that need it. Raw SQL across ~35 tables would not survive the refactoring pace of a hackathon. |
| **SQLite (WAL)** | Both databases | The edge *must* survive losing the network, so its store has to be local and file-based. WAL lets the ingest loop write while the API reads. Postgres at the edge would mean running a server on a machine in a quarry. |
| **MQTT (Mosquitto)** | Telemetry bus | Built for lossy links and constrained devices, with QoS and last-will semantics that matter when a machine drives behind a berm. Kafka is the right answer at fleet scale and the wrong answer for one cab. HTTP polling loses the "connection died" signal entirely. |
| **scikit-learn** | Isolation Forest, Gaussian mixtures | Unsupervised anomaly detection without labels, which is what we have. A deep model would need labelled incidents nobody has. |
| **LightGBM** | Task-time quantiles, phase classification | Native **quantile regression** — we need a *range* with honest uncertainty, not a point estimate. XGBoost needs a custom objective for this; a neural net needs far more data than a quarry produces. |
| **Conformal prediction (CQR)** | Calibrating those ranges | Turns a quantile model's output into an interval with a stated coverage guarantee. Without it, "90% confident" is a claim we could not defend to a judge. |
| **Azure OpenAI (GPT-4o)** | Copilot answers | Enterprise deployment with data handling Caterpillar-shaped customers already accept. Chosen over a raw OpenAI key for that reason, not for model quality. |
| **Hybrid RAG (BM25 + TF-IDF + RRF)** | Grounding those answers | Lexical retrieval beats embeddings on this corpus: operator manuals are full of exact part numbers and procedure codes, where an embedding's "semantic similarity" actively hurts. Reciprocal rank fusion needs no training and no vector database. |
| **pytest + Hypothesis** | ~750 tests | Property-based testing found edge cases in the geofence and fusion maths that example-based tests did not. |

### Frontend

| Choice | Used for | Why this, not the alternative |
|---|---|---|
| **React 18 + TypeScript** | All three role UIs | Types across the API boundary are the only reason a 40-file UI stayed refactorable. Three shape-mismatch bugs still got through where types were loose — see §6. |
| **Vite** | Build and dev server | Sub-second HMR. `create-react-app` is unmaintained; Next.js adds SSR and a server runtime we have no use for, since the API is already a separate service. |
| **Tailwind CSS 3** | All styling | Caterpillar's design language is a token system (Cat Yellow `#FFCD11`, Roboto Condensed, an 8px grid). Tailwind's config *is* that token system, so the theme is data rather than scattered CSS. The dark-theme switch later cost two lines because of this. |
| **Recharts** | All charts | Declarative, composable, and themeable from CSS variables — the charts followed the dark theme automatically. D3 is more powerful and would have been far more code. |
| **React Router 6** | Routing | Role-guarded routes with nested layouts. |
| **Polling, not WebSockets** | Live updates | 5 s for operators, 10 s for supervisors. A WebSocket would be lower-latency and would also need reconnection, backoff and replay logic to survive a phone changing cell towers. For a worksite, a poll that simply retries is more robust than a socket that must be nursed. |

### Serving and infrastructure

| Choice | Why |
|---|---|
| **Cloud API serves the built SPA** | One origin removes CORS, removes mixed-content blocking, and — the decisive reason — gives HTTPS. Browsers only expose `navigator.geolocation` on a secure context. Over a plain LAN address the phones return no position and every punch records as "unverified", so the geofence feature would look broken rather than blocked. |
| **Cloudflare Tunnel** | A public HTTPS URL for three devices with no deployment, no DNS and no certificate. The phones do not need to share the laptop's wifi. |
| **PBKDF2-HMAC-SHA256, 120k iterations** | Standard-library password hashing with no native dependency. bcrypt/argon2 are better but need a compiled wheel on every machine the team uses. |

---

## 3. Architectural flow

```
  MACHINE (simulated)                    EDGE :8000                       CLOUD :8100
 ┌──────────────────┐   MQTT    ┌──────────────────────┐   outbox   ┌────────────────────┐
 │ kinematics 10 Hz │──────────▶│ pipeline → fusion    │───────────▶│ ingest · profile   │
 │ operator cycles  │           │ safety (independent) │  store-&-  │ competency · RAG   │
 │ fault injectors  │           │ alerts · ETA         │  forward   │ practice analyser  │
 └──────────────────┘           │ SQLite  data/edge.db │            │ SQLite cloud.db    │
                                └──────────┬───────────┘            └─────────┬──────────┘
                                           │ REST + WS                        │ REST
                                    ┌──────▼──────┐                  ┌────────▼─────────┐
                                    │  In-cab UI  │                  │ AI TASK CENTRE   │
                                    └─────────────┘                  │ admin/sup/op     │
                                                                     └──────────────────┘
```

### What each section is for

**`sentinel/sim` — the machine.**
- Produces SIMULATED telemetry: a physics-lite 10 Hz excavator model, operator archetypes with
  human-like work cycles, and labelled fault injectors.
- **Objective:** give every downstream component realistic input with *known ground truth*, so a
  detection can be scored as correct or not.

**`sentinel/bus` — the nervous system.**
- MQTT client wrapper with an in-process fallback.
- **Objective:** decouple producers from consumers so the safety layer can run as its own process.

**`sentinel/pipeline` — behaviour understanding.**
- Windowed feature extraction, context gating, idle and procedural rules, Isolation Forest anomaly
  scoring, risk fusion, and per-signal attribution for explanations.
- **Objective:** turn raw signals into a scored, *explainable* judgement. Attribution is not
  decoration — an alert a supervisor cannot interrogate is one they learn to ignore.

**`sentinel/safety` — the layer that must not fail.**
- Deterministic critical-safety rules, running as its own process.
- **Objective:** guarantee that critical protection never depends on ML. It imports only stdlib,
  pydantic, PyYAML and the bus — and a test (`test_safety_independence.py`) *enforces* that it never
  imports ML, pipeline, alert or cloud code. This is the single most important structural decision
  in the system.

**`sentinel/alerts` — attention management.**
- Tiering, suppression, rate limits, acknowledgement and escalation timers, auto-incidents.
- **Objective:** protect the operator's attention. An alert flood and no alerts at all fail the same
  way, because both end in the alert being ignored.

**`sentinel/eta` — task-time estimation (R5).**
- LightGBM quantile regression with conformal calibration; median-by-type fallback when data is thin.
- **Objective:** an honest *range* with stated coverage, not a false-precision number.

**`sentinel/sync` — surviving the network.**
- SQLite outbox plus a forwarding agent.
- **Objective:** the edge keeps working offline and reconciles later. This is why the databases are
  split rather than shared.

**`sentinel/cloud` — the multi-user side.**
- Ingest, operator profile, competency gap evidence, training hub, the RAG copilot with per-sentence
  citation verification, and re-assessment.
- **Objective:** turn accumulated evidence into competency judgements a human can audit. The copilot
  refuses to state anything it cannot cite.

**`sentinel/practice` — the training showcase.**
- Compares trainee control inputs against an Expert Motion Model built from SIMULATED expert data,
  using DTW alignment.
- **Objective:** show *where in the motion* a trainee diverges, rather than issuing a score.

**`sentinel/taskcentre` — the worksite product (7,487 lines, the largest module).**
- Accounts and role guards, geofenced punches, assignable tasks with checkpoints, the pre-start
  checklist gate, declared waiting, chat, review queues, training profiles, efficiency, fatigue
  risk, the simulated AI brain, and rule-based foresight.
- **Objective:** coordinate a crew and route every AI observation to a *person who decides*. Nothing
  here controls machinery, and every screen says so.

**`sentinel/store` + `sentinel/shared` — the spine.**
- SQLAlchemy models (two databases) and the canonical pydantic contracts, config and paths.
- **Objective:** exactly one definition of every shape and setting.

---

## 4. Three principles the architecture enforces

1. **Safety never depends on ML.** Enforced by an import test, not by convention.
2. **Every AI output names a person who decides.** The brain opens tickets and sends notifications;
   it never actuates. Acting on a foresight item notifies people and writes a record.
3. **Provenance is always visible.** Every figure carries `RULE`, `ML`, `SIMULATED` or `MOCK`.
   Confidence a reader cannot audit is worse than no confidence at all.

---

## 5. Honest limitations

- **No migrations.** Tables are created with `Base.metadata.create_all()`. A schema change against an
  existing database needs the file recreated, or Alembic adding.
- **No real computer vision.** Camera events come from a simulated detector.
- **Foresight is rules, not prediction.** Seven deterministic rules over facts already recorded. It
  restates what happened and what could plausibly follow. The likelihood is a band, not a probability.
- **"Today" is a UTC day server-side.** The UI now shows local time, but day boundaries are still
  UTC. In IST these disagree only between 00:00 and 05:30.
- **MQTT and the edge API are not tunnelled.** The Task Centre does not need either, but the in-cab
  live view will not stream through the public link.

---

## 6. What the architecture did not prevent

Worth stating plainly, because it is the most useful lesson here. Three bugs of the *same shape*
reached a running demo: the API nested an object (`subject_user`, `operator`, `supervisor`) while the
UI read a flat field (`subject_name`, `user.supervisor_id`). TypeScript did not catch them because
the types declared both shapes optional, so reading the wrong one was legal and silently produced
`undefined`.

The fix was to give each one a single accessor (`ticketSubject`, `personName`, `personId`) rather than
patch the call sites. **The lesson: optional fields on both sides of a boundary defeat the type
system.** Generating the frontend types from the OpenAPI schema FastAPI already produces would have
prevented all three.
