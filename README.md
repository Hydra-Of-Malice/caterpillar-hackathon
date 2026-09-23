# caterpillar-hackathon — CAT Sentinel (Safety-First Operator Copilot)

Caterpillar "Smart Operator Assistant" hackathon prototype. It covers the daily task dashboard, deterministic safety advisories, unusual-behaviour and idle detection, task-time estimates with uncertainty, and a training hub. The training showcase is the **Practice Analyser**, which scores trainees against an Expert Motion Model trained on expert-operator data.

> All telemetry is **SIMULATED**. The prototype assumes a clean data feed; integration with Cat systems is future work. The value figures are **ESTIMATES** built from sourced assumptions, and a pilot is needed to prove ROI.

## Run it (Windows)

```powershell
uv venv --python 3.11 .venv; uv pip install --python .venv\Scripts\python.exe -e ".[dev]"   # once
cd web; npm install; cd ..                                                              # once
powershell -ExecutionPolicy Bypass -File scripts\demo_up.ps1 -Scenario demo_short        # everything
```

To run the pieces by hand:

```powershell
docker compose up -d broker                         # Mosquitto :1883 / :9001 (fallback: python -m sentinel.bus.broker)
.venv\Scripts\python -m sentinel.seed --reset       # demo world (Ravi, EX-07, tasks, Shift 0 history)
.venv\Scripts\python -m sentinel.safety.main        # independent safety process
.venv\Scripts\uvicorn sentinel.cloud.api.main:app --port 8100
.venv\Scripts\uvicorn sentinel.edge_api.main:app --port 8000
.venv\Scripts\python -m sentinel.sim.run --scenario ravi_shift1 --speed 4
cd web; npm run dev                                 # http://localhost:5173
```

API docs are at http://127.0.0.1:8000/docs (edge) and http://127.0.0.1:8100/docs (cloud). The live demo triggers are `POST /api/v1/demo/inject {"kind": "seatbelt_open" | "person_rear" | "person_warning" | "fast_swing" | "idle" | "idle_waiting" | "hyd_fault" | "truck_wait" | "protection_degraded" | "wan_offline" | "wan_online"}` and `POST /api/v1/demo/fast-forward-operation {"minutes": 151}`.

**Models (next step):** run `.venv\Scripts\python -m ml.train_all`. It generates the simulated datasets, then trains the Isolation Forest, the task-time model and the Expert Motion Model. Until then the system runs rules-only, task-time estimates use a baseline, and the practice analyser returns "not trained yet".

**Tests:** `.venv\Scripts\python -m pytest`.

## Architecture

| Process | Package | Role |
|---|---|---|
| Simulator | `sentinel/sim` | 10 Hz excavator telemetry, operator archetypes, injected events, scenarios |
| Safety (independent) | `sentinel/safety` | Deterministic seatbelt / proximity / speed / sensor-fault advisories and a 1 Hz heartbeat. It has no ML imports |
| Edge API :8000 | `sentinel/edge_api`, `alerts`, `pipeline`, `eta`, `sync` | Shift, checklist, tasks, alert tiers, incidents, behaviour pipeline, task-time estimates, offline outbox, live WebSocket |
| Cloud API :8100 | `sentinel/cloud`, `practice`, `value` | Competency gaps, training modules and quizzes, cited RAG copilot, reassessment, supervisor, monitoring, Practice Analyser, business value |
| Web :5173 | `web/` | React UI ported from the Google Stitch designs |

## Docs (`docs/`)

| File | What it is |
|---|---|
| [00-design-brief.md](docs/00-design-brief.md) | Canonical decisions |
| [implementation-plan.md](docs/implementation-plan.md) | Module contracts and API |
| [ui-theme.md](docs/ui-theme.md) · [stitch-master-prompt.md](docs/stitch-master-prompt.md) | Caterpillar-derived theme and the Stitch screen spec |
| [sections/](docs/sections/) | Research 01–16: traceability, feasibility, architecture, ML, operator profile, fatigue, interventions, training loop, dataset, MVP, roadmap, demo, evaluation, risks, novelty, **business value** |

The UI designs from Google Stitch are in `design/stitch/`.
