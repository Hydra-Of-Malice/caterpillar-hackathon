# AI Task Centre — build contract

Read before writing code. **Do not edit files another agent owns.** If you need a change there, say so in your report and the integrator applies it.

## What exists already
Mature prototype "CAT Sentinel": FastAPI **edge** (:8000, in-cab copilot) and **cloud** (:8100, multi-user), SQLAlchemy 2 + SQLite, MQTT, a telemetry simulator, a React 18 + Vite + TS + Tailwind SPA (~26 routes) with a dark in-cab theme and a light office theme. Existing roles were `operator` and `supervisor` via a mock `X-Role` header. Keep all of it working.

The Task Centre is **additive**: new `tc_*` tables, a new `/api/v1/tc/*` API surface on the **cloud** service, and new frontend routes. It does not modify the copilot's tables or screens.

## Ground rules
- Python 3.11, venv at `D:\research\.venv` (`.venv\Scripts\python.exe`). Deps are installed; do not add packages.
- **Times:** store and compare UTC seconds (floats). Never trust the browser clock for stored values. The UI labels every operational time "GMT".
- **Honesty:** simulated detectors are labelled `SIMULATED`. Geolocation is an indication of presence, never proof. Never claim this controls machinery or replaces site safety procedures.
- Permissions are enforced **in the API**. Hiding a UI control is not enough.
- Tests in `tests/taskcentre/` (backend) must pass with `.venv\Scripts\python.exe -m pytest tests/taskcentre`.
- Match surrounding style: typed, small functions, docstrings on public APIs, no dead code.

## Data model — already written, do not change
`sentinel/store/taskcentre_models.py` (17 tables, all `tc_` prefixed). Read it first; it is the source of truth for fields:
`UserRow, SessionRow, SiteRow, GeofenceRow, CameraRow, LocationReportRow, PunchRow, TcTaskRow, CheckpointRow, TaskProgressRow, ChatMessageRow, TicketRow, ReviewDecisionRow, TcIncidentRow, NotificationRow, TrainingVideoRow, SimEventRow`.
Registered on `Base` via `sentinel/store/db.py`, so `Database.cloud()` creates them.

## Auth (agent A owns; everyone else consumes)
- `POST /api/v1/tc/auth/login {username, password, lat?, lon?, accuracy_m?}` → `{token, user, login: {ts, geofence_status, ...}}`. Records the login punch/location.
- Bearer token in `Authorization: Bearer <token>`; sessions in `tc_session`, 12 h expiry.
- FastAPI deps in `sentinel/taskcentre/auth.py`: `current_user()`, `require_role("admin")`, `require_roles("admin","supervisor")`, plus `assert_can_view_operator(user, operator_id)` (admin: any; supervisor: only own operators; operator: only self). Return **403** on role failure, **404** when a resource exists but is out of scope.
- Demo accounts seeded by agent A, documented in the final README: `admin/admin123`, `super1/super123`, `op1/op123`, `op2/op123`, `op3/op123` (site `north-quarry`).

## Shared helpers (agent A owns)
`sentinel/taskcentre/geo.py`
```python
def haversine_m(lat1, lon1, lat2, lon2) -> float: ...
def classify(lat, lon, accuracy_m, fence) -> tuple[str, float | None]:
    """-> ("inside"|"outside"|"unverified", distance_m|None).
    Missing coords or accuracy_m > fence.max_accuracy_m -> "unverified" (never "outside")."""
```
`sentinel/taskcentre/service.py` — small helpers every agent reuses:
```python
def new_id(prefix: str) -> str            # reuse sentinel.shared.schemas.new_id
def notify(s, user_id, *, kind, title, body="", severity="info", alarm=False,
           link=None, incident_id=None, ticket_id=None) -> NotificationRow
def open_ticket(s, *, site_id, kind, title, severity, owner_role, owner_user_id=None,
                subject_user_id=None, detail="", evidence=None, source="SIMULATED",
                task_id=None, machine_id=None, incident_id=None) -> TicketRow
def latest_location(s, user_id) -> LocationReportRow | None
```

## API surface — `/api/v1/tc`
Routers mount on the **cloud** app. Each agent writes its own router file; the integrator mounts them.

**A — auth & users** (`routes_auth.py`)
`POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /location` (report position) ·
`POST /punch {kind, lat?, lon?, accuracy_m?}` (server timestamp; outside/unverified raises a ticket — operator's goes to their supervisor, supervisor's goes to admin) ·
`GET /users?role=&supervisor_id=` · `POST /users` (admin, or supervisor adding their own operator) · `PATCH /users/{id}`

**B — admin** (`routes_admin.py`, admin only)
`GET /admin/overview` (machines + status, cameras, ticket counts, incident counts, staleness) ·
`GET /admin/people` (latest location + geofence status + age per person; explicit `stale` flag) ·
`GET /admin/tickets?status=&kind=&user=&machine=` · `POST /admin/tickets/{id}/decision {decision, comment}` ·
`GET /admin/cameras` · `GET /admin/incidents`

**B2 — fleet** (`routes_fleet.py` + `fleet.py`, admin only)
`GET /admin/fleet?days=` (per machine: current state + since, availability / utilisation / idle / downtime split planned-unplanned, breakdowns, MTBF, MTTR, service meter, last maintained, next service due and its status; fleet totals) ·
`GET /admin/machines/{id}?days=` (the same, plus the state timeline, lifetime stats, work orders with history, incidents, flags, tasks, cameras, assigned operators) ·
`POST /admin/machines/{id}/maintenance {kind, title, detail?, scheduled_for? | start_now? | completed_at? + hour_meter_h?}` ·
`PATCH /admin/maintenance/{id}` (descriptive fields; old values kept in `history`) ·
`POST /admin/maintenance/{id}/start|complete|cancel` (409 when the status does not allow it).
Figures are derived on every request from `tc_machine_state` (intervals of scheduled time: operating | idle | down | maintenance; gaps are unscheduled and count toward nothing) and `tc_maintenance` (work orders). Starting a work order puts the machine `down` (repair) or into `maintenance` (service, inspection); completing it closes that interval. The next service is due `fleet.service_interval_h` meter-hours after the last completed service. The demo state log is SIMULATED (`fleet.seed_fleet_history`, run by the Task Centre seed and at cloud start-up in DEMO_MODE).

**C — supervisor** (`routes_supervisor.py`, supervisor + admin)
`GET /sup/operators` (own team, with today's task counts and last location) ·
`GET /sup/operators/{id}` · `POST /sup/tasks` (title, instructions, location, machine_id?, priority, start_ts, expected_finish_ts, checkpoints[]) ·
`PATCH /sup/tasks/{id}` · `GET /sup/tasks?operator_id=&status=` · `GET /sup/dashboard` (completed/ongoing/pending/overdue counts + the task list behind them) ·
`GET /sup/review` (open tickets for this supervisor) · `POST /sup/review/{ticket_id} {decision, comment, message_to_operator?}` ·
`GET /sup/cameras` (only machines this supervisor owns)

**D — operator** (`routes_operator.py`, operator self-scope)
`GET /op/today` (tasks, ongoing task, login/start-work times + geofence status, unread messages, active alarm) ·
`POST /op/tasks/{id}/start` · `POST /op/tasks/{id}/checkpoint {checkpoint_id, done}` ·
`POST /op/tasks/{id}/progress {kind, text}` · `POST /op/tasks/{id}/finish` →
**409** when a required checkpoint is unmet, unless a supervisor has resolved the exception; finishing after `expected_finish_ts` opens a `task_overrun` ticket for the supervisor ·
`GET /op/training` · `GET /op/notifications` · `POST /op/notifications/{id}/ack`

**Shared** `GET /tc/chat/{other_user_id}` · `POST /tc/chat/{other_user_id} {text, task_id?}` (pair-scoped, both roles).

**E — AI brain & demo** (`routes_sim.py`, `brain.py`)
Typed event in → tickets/incidents/notifications out, behind replaceable adapters:
`POST /sim/machine-sensor {machine_id, kind, severity, lat?, lon?}` → critical incident: pick the nearest eligible operator using the freshest location within `max_age_s` and `max_distance_m` (config), alarm that operator, notify their supervisor and admin. If no one qualifies → `dispatch_status="no_eligible_operator"`, alert supervisor + admin, and **never invent an operator**. Dedupe by `(machine_id, kind)` within a cooldown window.
`POST /sim/camera-observation {camera_id, operator_id, idle_seconds, context}` → `context` in `waiting_for_truck|machine_paused|expected_delay` suppresses the flag (logged, no ticket); otherwise an `ai_idle` ticket for the supervisor with timeline + clip placeholder.
`POST /sim/fatigue {operator_id, indicator}` → operator safety prompt + supervisor notification, source `SIMULATED`, never presented as validated fatigue detection.
`GET /sim/scenarios` · `POST /sim/scenario/{name}` for the demo panel: `critical_incident`, `critical_incident_no_operator`, `waiting_for_truck`, `true_idle`, `false_idle`, `fatigue`, `outside_geofence_punch`, `task_overrun`.
Config in `config/taskcentre.yaml` (agent E writes it): `nearest_operator: {max_age_s: 600, max_distance_m: 2000}`, `idle: {threshold_s: 900, cooldown_s: 600}`, `incident_dedupe_s: 300`, `session_hours: 12`.

## Frontend — `web/src/taskcentre/`
New area, own routes; existing routes untouched. Reuse `web/src/components/ui.tsx` primitives and the Tailwind tokens. Agent F writes `web/src/taskcentre/api.ts` (typed client, token in `localStorage`, `Authorization` header, 401 → redirect to login) and `types.ts`; agents G/H/I import them.

Routes (all under `/tc`): `/tc` landing (product name, description, three role login entry points) · `/tc/login/:role` · `/tc/admin` · `/tc/admin/machines/:id` · `/tc/sup` · `/tc/sup/operator/:id` · `/tc/op` (mobile-first) · `/tc/op/task/:id` · `/tc/op/training` · `/tc/demo` (scenario control panel).

Requirements: GMT labels on every operational time; clear empty / loading / error / stale / permission-denied states; a critical alarm that is visible on **any** page of the operator app (a global banner component polling notifications, not sound or colour alone); do not drown the operator in analytics.

## Realtime
No WebSocket for the Task Centre. Poll: operator notifications and today view every 5 s, chat every 5 s, supervisor and admin dashboards every 10 s. Keep intervals in one constants module so they are easy to change.

## Seed (agent A)
Site `north-quarry` with a geofence, 1 admin, 1 supervisor, 3 operators, machines and cameras reusing existing `MachineRow` ids (EX-07, EX-09) plus a couple more, training videos (labelled DEMO), and **no tasks** — the operator's "no tasks assigned yet" state must be real on first run. Idempotent; runs from `python -m sentinel.taskcentre.seed`.
