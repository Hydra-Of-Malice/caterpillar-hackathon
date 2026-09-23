# CAT Sentinel — Implementation Plan & Module Contracts

Read first: `docs/00-design-brief.md` (decisions), `docs/sections/10-mvp.md` (MVP spec), and the shared code in `sentinel/shared/`, `sentinel/bus/` and `sentinel/store/`. **Do not edit shared files.** If you need a change, note it in your final report and the integrator will apply it.

## Ground rules
- Python 3.11. Use the venv at `D:\research\.venv` (`.venv\Scripts\python.exe`). Dependencies are already installed (fastapi, uvicorn, pydantic 2, paho-mqtt 2, sqlalchemy 2, numpy, pandas, scikit-learn, lightgbm, scipy, statsmodels, pyyaml, httpx, pytest, hypothesis, rank-bm25, anthropic, pyarrow, amqtt). If you need another package, stop and report it rather than installing it.
- **Clean-data assumption:** all signals in `TelemetrySample` are available and clean. Validate at boundaries only.
- Everything simulated carries `simulated=True`, a SIMULATED provenance, or both. No fabricated claims.
- Each module ships **pytest tests** in `tests/<module>/` that pass with `.venv\Scripts\python.exe -m pytest tests/<module>`.
- The code style is typed, small, readable functions with docstrings on public APIs. No dead code.
- Config lives in `config/*.yaml` and is loaded via `sentinel.shared.config.load_yaml(name)`. Every rule and threshold has a version string.
- Time is unix seconds (float). The simulator's clock can run faster than real time; never call `time.time()` inside logic that processes samples. Use `sample.ts`.
- IDs come from `sentinel.shared.schemas.new_id(prefix)`.

## Demo world (fictional, SIMULATED)
- **Site** `north-quarry`. **Machines** `EX-07` and `EX-09`, both machine type `EX-20t`, model "Cat 320 (simulated)", with proximity fitted.
- **Operators:**
  - `OP-1042` Ravi Kumar: novice, 3 months, 212 h, archetype `novice_improving`.
  - `OP-1007` Anita Rao: expert, 9 years.
  - `OP-1019` Joe Mendes: intermediate.
  - `OP-1033` Lena Ortiz: intermediate, with a late-shift degradation archetype.
- **Staff:** supervisor `SUP-01` Priya Nair; instructor `INS-01` Marcus Lee.
- **Today's shift** for Ravi on EX-07, 06:00–14:30 local:
  - `T-1` Truck Loading, Bench 3: 420 m³ clay-gravel, zone `TL-1`.
  - `T-2` Trench Excavation T-4: 60 m × 1.5 m, first on site, required module `MOD-TRENCH-EDGES`.
  - `T-3` Stockpile Tidy: 40 min.
- **Weather (MOCK):** 31 °C, dust moderate, light rain from 13:00.

## Modules and owners

| Package | Owner agent | Provides |
|---|---|---|
| `sentinel/sim/` + `config/scenarios/` | A — Simulator | Telemetry generator, operator archetypes, injectors, scenarios, replay, bus runner, datasets for training |
| `sentinel/safety/` + `config/rules.yaml` | B — Safety | Independent deterministic rule engine and process |
| `sentinel/pipeline/` + `ml/train_iforest.py` + `config/fusion.yaml` | C — Behaviour ML | Windowed features, context, idle rule, procedural rules, Isolation Forest, fusion, explanations, attribution |
| `sentinel/practice/` + `ml/train_expert_model.py` | D — Practice Analyser | Expert Motion Model: phase segmentation, expert envelopes, metrics, scoring, coaching tips, live feedback, API router |
| `sentinel/edge_api/`, `sentinel/alerts/`, `sentinel/eta/`, `sentinel/sync/`, `sentinel/seed.py`, `ml/train_tasktime.py`, `config/alert_policy.yaml`, `config/checklist.yaml` | E — Edge | Edge FastAPI (8000), alert manager, task-time model, outbox sync, demo seed |
| `sentinel/cloud/`, `config/competencies.yaml`, `content/modules/`, `corpus/` | F — Cloud | Cloud FastAPI (8100): ingest, profile, competency gap evidence, training modules and quiz, bookings (MOCK), RAG copilot, reassessment, supervisor, monitoring |
| `web/` | G — Frontend | React + Vite + TS + Tailwind app ported from the Stitch export, wired to both APIs |

## Python interfaces (must match exactly)

```python
# A — sentinel/sim/generator.py
class ShiftSimulator:
    def __init__(self, scenario: "Scenario", seed: int = 42) -> None: ...
    def samples(self) -> Iterator[TelemetrySample]: ...        # 10 Hz, sample.ts in simulated time
    def inject(self, kind: str, **params) -> None: ...        # seatbelt_open, person_rear, fast_swing, hyd_fault, idle, truck_wait
def load_scenario(name: str) -> "Scenario": ...                # config/scenarios/<name>.yaml
# A — sentinel/sim/practice.py
def generate_practice_session(archetype: str, n_cycles: int = 8, seed: int = 0,
                              exercise: str = "truck_loading_basic") -> list[PracticeSample]: ...
# archetypes: expert | intermediate | novice | novice_improving; sample.gt carries {"phase","cycle","archetype"}

# B — sentinel/safety/rules.py
class RuleEngine:
    def __init__(self, rules: dict | None = None) -> None: ...  # defaults to load_yaml("rules")
    def evaluate(self, sample: TelemetrySample) -> list[SafetyAlertMsg]: ...   # raised/cleared transitions only
    def sensor_health(self, now_ts: float) -> dict[str, str]: ...

# C — sentinel/pipeline/runner.py
@dataclass
class RuntimeContext:
    waiting_for_truck: bool = False
    task_type: str | None = None
    operator_experience_h: float = 0.0
class Pipeline:
    def __init__(self, models_dir: Path | None = None) -> None: ...
    def process(self, sample: TelemetrySample, ctx: RuntimeContext) -> list[Event]: ...   # 20 s windows, 5 s stride
    def last_window(self) -> FeatureWindow | None: ...

# D — sentinel/practice/analyser.py
class PracticeAnalyser:
    @classmethod
    def load(cls, models_dir: Path | None = None) -> "PracticeAnalyser": ...
    def analyse(self, samples: list[PracticeSample], exercise: str, trainee_id: str, session_id: str) -> PracticeReport: ...
    def live_step(self, session_id: str, sample: PracticeSample) -> dict: ...   # {"phase","deviation":{channel: z},"hint": str|None}
# D — sentinel/practice/api.py:  router = APIRouter(prefix="/practice")   (mounted by the cloud app)

# E — sentinel/alerts/manager.py
class AlertManager:
    def __init__(self, db: Database, policy: dict | None = None) -> None: ...
    def on_event(self, event: Event, moving: bool) -> list[Alert]: ...
    def on_safety_alert(self, msg: SafetyAlertMsg) -> Alert | None: ...
    def ack(self, alert_id: str, ts: float) -> Alert: ...
    def tick(self, now_ts: float, continuous_operation_min: float) -> list[Alert]: ...   # T3 break, T4 escalation
    def subscribe(self, cb: Callable[[Alert], None]) -> None: ...
# E — sentinel/eta/estimator.py
class TaskTimeEstimator:
    @classmethod
    def load(cls) -> "TaskTimeEstimator": ...
    def estimate(self, task: dict, operator: dict, conditions: dict, progress_frac: float = 0.0) -> TaskEstimate: ...
```

## HTTP API (both apps: prefix `/api/v1`, CORS for `http://localhost:5173`)

### Edge (port 8000, `sentinel.edge_api.main:app`)

| Method + path | Returns / body |
|---|---|
| GET `/health` | `{status, safety_heartbeat_age_s, protection:"active"/"degraded", broker, cloud:"online"/"offline", outbox_backlog, versions{rules, models}}` |
| GET `/shift/current` | shift, operator, machine, tasks[], conditions, checklist_status, continuous_operation_min, last_break_ts |
| POST `/shift/{id}/privacy-ack` | `{ok}` |
| GET `/checklist/items` | items from `config/checklist.yaml` (`id, group, label, hint, critical, live_signal?`) |
| POST `/shift/{id}/checklist` | `{results:[{item_id,result,note}]}` → `{passed, failed_critical[], incident_ids[]}` |
| POST `/shift/{id}/start` · POST `/shift/{id}/end` | 409 if checklist incomplete or a critical item failed. End triggers competency evaluation in the cloud |
| GET `/tasks` · PATCH `/tasks/{id}` | tasks with `estimate: TaskEstimate` embedded |
| GET `/tasks/{id}/eta` | `TaskEstimate` |
| POST `/eta/preview` | `{task_type, qty, material, operator_id, machine_id, planned_start}` → `TaskEstimate` (screen 17) |
| POST `/context/task-state` | `{waiting_for_truck: bool}` |
| GET `/alerts?active=1` · POST `/alerts/{id}/ack` · POST `/alerts/{id}/feedback` `{useful, reason}` (423 while the machine is moving) | |
| GET `/incidents` (filters: signal_word, type, source, status, operator_id) · GET `/incidents/{id}` · POST `/incidents` · PATCH `/incidents/{id}` `{status, operator_note, dispute_status}` | |
| POST `/breaks/start` · POST `/breaks/end` `{kss?}` | |
| GET `/conditions` | weather (MOCK) + staleness |
| GET `/review/shift/{id}` | post-shift review: totals, idle breakdown, alerts by signal word, well-done list, focus item (from cloud gap evidence), timeline[] |
| GET `/live/snapshot` | latest status for the Operate screen: seatbelt, proximity{sectors, truck_m, person_m, fitted}, travel_kmh, idle{today_min, waiting_min}, current task progress, eta |
| GET `/sync/status` · POST `/sync/flush` | |
| WS `/ws/live` | JSON frames `{type: "snapshot"/"alert"/"alert_cleared"/"eta"/"task"/"health"/"window", data}` at ≥ 2 Hz for snapshots |
| POST `/demo/inject` `{kind}` · POST `/demo/wan` `{up}` · POST `/demo/scenario` `{name, speed}` | DEMO_MODE only |

### Cloud (port 8100, `sentinel.cloud.api.main:app`)

| Method + path | Returns / body |
|---|---|
| POST `/ingest/batch` | `{items:[{uuid, kind, payload}]}` → idempotent upsert |
| GET `/operators/{id}/profile` | operator, competencies[{id,label,state,evidence,verified_by}], exposure, training history |
| POST `/competency/evaluate` `{operator_id, shift_id}` | runs event→competency mapping and the gap rule (Gamma–Poisson, P ≥ 0.8, recurrence floor) → gaps[] |
| PATCH `/competency/{operator_id}/{competency_id}` `{state, actor_role, assessment_id?}` | 403 for `demonstrated` unless role is instructor or there is a passing assessment |
| GET `/training/recommendations?operator_id=` | modules with a `why` (evidence) |
| GET `/training/modules` · GET `/training/modules/{id}` | module with key points and citations (`doc_id, section, version`) |
| POST `/training/modules/{id}/complete` · GET `/training/quiz/{module_id}` · POST `/training/quiz/{module_id}/attempts` | |
| GET `/instructors` · GET `/instructors/slots` · POST `/bookings` (MOCK) | |
| POST `/copilot/ask` `{question, operator_id?}` | `{answer, citations[{chunk_id, doc_id, section, version, text}], mode:"generative"/"extractive"/"refused"}` |
| GET `/reassessment?operator_id=&competency_id=` | `{pre{events, opportunities, rate}, post{…}, rr, ci95[lo, hi], verdict, label:"SIMULATED"}` |
| GET `/supervisor/crew-summary` · GET `/supervisor/escalations` · POST `/supervisor/escalations/{id}/resolve` · GET `/supervisor/machine-issues` | aggregates only, no ranking |
| GET `/idle/summary?date=` · GET `/behaviour/events?…` | screen 16 |
| GET `/instructor/operators` · GET `/instructor/content-review` · POST `/instructor/content-review/{id}/approve` | screen 18 |
| GET `/monitoring/alert-rates` · GET `/monitoring/drift` · GET `/models` | screen 19 |
| **Practice** (router from D) under `/practice`: POST `/sessions` `{trainee_id, exercise}` → session · POST `/sessions/{id}/samples` `{samples: PracticeSample[]}` → `{accepted, live?}` · POST `/sessions/{id}/finish` → `PracticeReport` · GET `/sessions/{id}/report` · GET `/sessions?trainee_id=` (history and score trend) · GET `/exercises` · POST `/demo/generate` `{archetype, n_cycles}` (DEMO: creates a simulated trainee session) · WS `/sessions/{id}/live` | |

## Processes and run commands
```
docker compose up -d broker                                       # Mosquitto 1883 + 9001 (WS). Fallback: python -m sentinel.bus.broker
.venv\Scripts\python -m sentinel.seed                             # E: seed edge + cloud DBs (demo world)
.venv\Scripts\python -m ml.train_all                              # trains iforest (C), tasktime (E), expert model (D) → models/
.venv\Scripts\python -m sentinel.safety.main                      # B: independent safety process
.venv\Scripts\uvicorn sentinel.cloud.api.main:app --port 8100     # F
.venv\Scripts\uvicorn sentinel.edge_api.main:app --port 8000      # E (runs pipeline + alert manager + sync as background tasks)
.venv\Scripts\python -m sentinel.sim.run --scenario ravi_shift1 --speed 1   # A
cd web && npm run dev                                             # G (5173)
```
`ml/train_all.py` is written by the integrator. It calls `ml.train_iforest.main()`, `ml.train_tasktime.main()` and `ml.train_expert_model.main()`.

## Model artifacts
`models/<kind>/<version>/` holds `model.*` and `model_card.json` (training data = SIMULATED, features, metrics, limits, sha256).
