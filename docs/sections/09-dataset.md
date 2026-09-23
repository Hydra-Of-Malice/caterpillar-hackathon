# 09 — Dataset, Simulator, Preprocessing and Task-Time Estimation

Owner: ML/Data Engineer. This section follows `00-design-brief.md`. Feature IDs F1–F23 refer to §04. Every number produced by the generator is **SIMULATED**.

## 0. What public sources say about real data

| Source | Finding | Tag |
|---|---|---|
| ISO/TS 15143-3 "AEMP 2.0" [1][2] | Elements include CumulativeOperatingHours, CumulativeIdleHours, CumulativeNonProductiveIdleHours, CumulativeFuelUsed (L), FuelRemainingRatio, DEFRemaining, CumulativeLoadCount, CumulativePayloadTotals, AverageDailyEngineLoadFactors, PeakDailySpeed, Distance, EngineCondition, Locations, Faults (SPN/FMI), CautionCodes, SwitchStatus. **No operator identifier** is listed. These are cumulative or snapshot values, not high-rate streams. | [ESTABLISHED] |
| Cat ISO 15143-3 API [3] | Time-series endpoints for hours, idle, fuel and faults. The history limit (about 14 days?) comes from a search snippet only; the page returned 403. | unverified |
| J1939 engine speed | SPN 190, PGN 61444 (EEC1), 0.125 rpm/bit, about 100 ms [4] | [ESTABLISHED] |
| J1939 throttle / load | SPN 91 pedal position and SPN 92 percent load, PGN 61443 (EEC2), 50 ms [5] | [ESTABLISHED] |
| J1939 speed | SPN 84, PGN 65265 (CCVS) [7]. A tracked excavator may lack it; fall back to GPS or a track-motor signal. | [ESTABLISHED] / excavator use [HYPOTHESIS] |
| J1939 seatbelt | SPN 1856 "Seat Belt Switch". Geotab documents a polarity inversion relative to J1939DA [6]. PGN 57344 (CM1) and availability on Cat buses are unverified. | [ESTABLISHED] / unverified |
| Joystick, swing, hydraulic pressure | J1939 joystick PGNs exist (numbers unverified here). Implement signals are often OEM-proprietary. | unverified |
| Excavator activity datasets | IMUs on an excavator and a loader, LSTM with augmentation [8]. Four IMUs; load/trench/grade/idle; about 3 h [9]. Joystick-signal activity identification [10]. FlywheelAI: 25 Hz joystick CSV plus video [11]. Public access to [8]–[10] and the license of [11] are unverified. | existence [ESTABLISHED] |
| Kaggle | A brief search found no construction-equipment telematics time series. | unverified (absence) |
| Idle share | A 36-t excavator idles about 40 % of its hours (trade press) [12]. Used to calibrate the simulator. | [ESTABLISHED] |

## 1. Data inventory checklist (first hour after receipt)

| # | Check | Red flag → consequence |
|---|---|---|
| 1 | Schema: dtypes; wide vs long (`signal,value`) | Numbers stored as text ("12 bar") → parse |
| 2 | Units from names and ranges (rpm 0–2500; bar, kPa or psi; km/h or mph; L or gal; °C or °F) | Raw J1939 counts → apply SPN scaling. 0xFF… values → NaN |
| 3 | Timestamps: tz, epoch unit, DST, monotonic, duplicates | Naive local time → localize to the site tz, store UTC |
| 4 | Sampling rate: median/p99 Δt per machine and signal | Snapshots only → Tier A path (§2) |
| 5 | Gaps (Δt > 5× median): engine-off vs dropout | Never interpolate across a dropout |
| 6 | Machine IDs, model/class | One machine → no leave-one-machine-out split |
| 7 | Operator IDs: coverage; 1:1 with a machine? | Missing → no personalization. 1:1 → operator and machine are confounded |
| 8 | Task labels: type, start/end, quantity, material | No durations → R5 trained on SIMULATED data |
| 9 | Safety signals: seatbelt, speed, hydraulic lockout, proximity | Missing → SIMULATED demonstration only |
| 10 | Fault codes (SPN/FMI) | Needed for machine attribution |
| 11 | Missingness per column × machine; structured or random | > 50 % missing on a machine → drop the feature for that machine |
| 12 | Labels: incidents, near-misses, competency | Usually none (Tier D) → rules + unsupervised models |
| 13 | Coverage: hours per operator × machine × task | Cell < 1 h → back off to the parent context |
| 14 | Date span | < 3 weeks → weak time split; prefer LOOO |
| 15 | Cumulative counters monotonic? | Diff; a negative diff is a reset → 0 |
| 16 | Semantics: belt = 1 with the engine off? speed > 0 with the engine off? | Inverted or dead signal → seatbelt T-CRIT not trusted on real data |
| 17 | PII (names, badges) | Pseudonymize at ingest (salted hash) |

```python
# profile_dataset.py  —  python profile_dataset.py <file.csv|.parquet> [timestamp_col]
import sys, pandas as pd
path = sys.argv[1]
df = pd.read_parquet(path) if path.endswith(".parquet") else pd.read_csv(path, low_memory=False)
KEYS = {"time": ("time", "date", "ts"), "op": ("operator", "driver", "badge"),
        "mach": ("machine", "asset", "serial", "equip", "vin", "pin"),
        "task": ("task", "job", "activity", "label", "state", "phase")}
find = lambda ks: [c for c in df.columns if any(k in c.lower() for k in ks)]
ts = sys.argv[2] if len(sys.argv) > 2 else find(KEYS["time"])[0]
print("raw ts sample:", df[ts].astype(str).head(3).tolist())            # epoch ints? add unit="s"/"ms"
parsed = pd.to_datetime(df[ts], errors="coerce")
if parsed.dtype == object:
    parsed = pd.to_datetime(df[ts], errors="coerce", utc=True); print("WARN mixed tz offsets -> UTC")
df[ts] = parsed
print(f"rows={len(df):,} cols={df.shape[1]} tz={df[ts].dt.tz} bad_ts={df[ts].isna().sum()}")
print(f"span {df[ts].min()} -> {df[ts].max()} ({(df[ts].max() - df[ts].min()).days} d)")
prof = pd.DataFrame({"dtype": df.dtypes.astype(str), "miss%": (df.isna().mean() * 100).round(1),
                     "nuniq": df.nunique(), "min": df.min(numeric_only=True),
                     "p50": df.median(numeric_only=True), "max": df.max(numeric_only=True)})
prof["constant"] = prof["nuniq"] <= 1
print(prof.to_string())
ids = {k: find(v) for k, v in KEYS.items() if k != "time"}
print("candidate id/label cols:", ids)
for c in df.select_dtypes("object").columns:
    if df[c].nunique() <= 30: print(c, df[c].value_counts(dropna=False).head(10).to_dict())
mach = ids["mach"][:1]
for key, g in (df.groupby(mach) if mach else [("ALL", df)]):
    raw = g[ts].diff().dt.total_seconds()                        # file order: negative = non-monotonic
    s = g[ts].sort_values().diff().dt.total_seconds().dropna()
    if s.empty: continue
    med = s.median()
    print(f"[{key}] n={len(g):,} median_dt={med:.3g}s (~{1/med if med else float('inf'):.3g} Hz) "
          f"p99_dt={s.quantile(.99):.3g}s gaps>5x={(s > 5*med).sum()} dup={(s == 0).sum()} "
          f"non_monotonic={(raw < 0).sum()}")
dims = ids["op"][:1] + mach + ids["task"][:1]
if dims:
    cov = df.groupby(dims).agg(rows=(ts, "size"), first=(ts, "min"), last=(ts, "max"))
    print(cov.sort_values("rows").to_string(max_rows=60))
    print("label coverage:", {c: round(float(df[c].notna().mean()), 3) for c in ids["task"]})
```

## 2. Decision tree (thresholds [PROPOSED])

```
Q1 Resolution?
├─ snapshots / cumulative (AEMP-like) → idle ratio per machine-day, fuel per idle-h, fault frequency (T0 trends);
│                                       behaviour features + IF on SIMULATED data only
├─ 0.2–2 Hz events (engine state, speed, GPS) → idle episodes + context gate, coarse over-speed, 60 s windows
└─ ≥ 5 Hz CAN → full F1–F23 on 20 s/5 s windows, cycle segmentation, swing near truck
Q2 Operator ID?  no → machine-level baselines; competency loop SIMULATED unless a shift roster can be joined
                 yes and ≥ 3 operators → LOOO evaluation + operator profile (§05)
Q3 Tasks?        durations → supervised R5 | none but ≥ 5 Hz → infer phases (swing angle + bucket pressure)
                 | neither → R5 on SIMULATED history with a UI badge
Q4 Safety signals? seatbelt missing or fails check 16 → SIMULATED T-CRIT demo | no proximity → "proximity not monitored"
Q5 Fault codes?  yes → machine-attribution evidence | no → input→response ratio only (§4.5)
Q6 R5 volume:    < 30 tasks/type → median-by-type + empirical P10/P90 | 30–200 → LightGBM + global CQR
                 | ≥ 50 calibration tasks per type → per-type (Mondrian) CQR
```

## 3. Feature buckets

| Bucket | Features |
|---|---|
| **A: typical supplied data** | Idle ratio (Δ idle-h ÷ Δ operating-h); non-productive idle share; fuel per operating-h and per idle-h; load count and payload per hour; PeakDailySpeed; load factor; fault counts by SPN/FMI; GPS zone dwell; task-log durations |
| **B: needs more data** | F1–F23 (joystick, swing, pressure, rpm, throttle, travel); seatbelt; input→response ratio; cycle phases; weather (API on GPS + time); operator via roster; truck dispatch |
| **C: SIMULATED** | All Tier B/C signals in the demo; ground-truth phases; injected events; archetype parameters; degradation onset; near-miss-like scenarios |

## 4. SIMULATED telemetry generator

### 4.1 State machines [PROPOSED]
- **Excavator truck loading**: `waiting_for_truck` → truck arrives → `passes_per_truck` × (`dig` → `swing_loaded` → `dump` → `swing_empty`) → `waiting_for_truck`. Other states: `idle` (no wait context), `travel`, `engine_off`.
- **Wheel loader (V-pattern)**: `load` → `reverse_loaded` → `approach_truck` → `dump` → `reverse_empty` → `return`.
- Cycle time ~ lognormal(cycle_s, cycle_cv), split into phases by a Dirichlet draw (mean shares 0.30 / 0.25 / 0.15 / 0.30) [HYPOTHESIS].
- Trucks arrive as a Poisson process, tuned so wait + idle ≈ 30–45 % of engine hours [12].

### 4.2 Signals (10 Hz)

| Signal (unit) | Generation |
|---|---|
| `joy_L_x` swing, `joy_L_y` stick, `joy_R_x` bucket, `joy_R_y` boom (−1..1) | Operator command profile per phase; `overlap` blends boom-up into swing |
| `swing_rate` (°/s), `boom/stick/bucket_deg` | Machine response = lag(gain × command); max swing about 65 °/s [HYPOTHESIS] |
| `travel_speed` (km/h) | Travel and loader phases |
| `engine_rpm`, `throttle_pct`, `engine_load_pct` | Auto-idle about 1000 rpm, working 1600–1800 rpm [HYPOTHESIS] |
| `hyd_pump_bar` | Base + k·|cmd| + dig spike (depends on material) |
| `seatbelt` (1 = buckled), `hyd_lock` (1 = locked) | Normalized polarity |
| `prox_truck_m`, `prox_person_m` (Tier C) | Bucket-to-truck geometry; person tracks (NaN = none detected) |
| `gps_zone`, `task_id`, `task_state` | What the edge app knows (schedule + operator tap), **not** ground truth |
| `fault_spn`, `fault_fmi` | Injected machine faults |

### 4.3 Operator archetypes [SIMULATED; values are HYPOTHESIS]

| Parameter | Expert | Novice | Novice-improving | Degraded-late-shift (onset 6 h) |
|---|---|---|---|---|
| `cycle_s` / `cycle_cv` | 17 / 0.10 | 25 / 0.25 | 25→19 / 0.25→0.15 | 18 / 0.12; +4 %/h |
| `swing_peak_frac` (of max) | 0.85 | 0.95 | 0.95→0.88 | 0.85 |
| `brake_lead_deg` | 35 | 12 | 12→28 | 35; −8 %/h (floor 50 %) |
| `overshoot_p` per swing | 0.03 | 0.30 | 0.30→0.08 | 0.03; +30 %/h (cap 0.6) |
| `overlap` (boom during swing) | 0.70 | 0.20 | 0.20→0.50 | 0.70 |
| `reversal_pm` (harsh reversals/min) | 0.2 | 2.0 | 2.0→0.6 | 0.2; +25 %/h |
| `belt_off_p` (episode/shift) | 0.01 | 0.30 | 0.30→0.05 | 0.02 |
| `idle_high_rpm_p` | 0.05 | 0.40 | 0.40→0.15 | 0.10 |
| `fill_mu` / `react_s` | 0.95 / 3 s | 0.80 / 8 s | →0.90 / →4 s | 0.95 / 3 s |

**Dynamics of novice-improving:** p(s) = p_expert + (p_novice − p_expert)·e^(−s/τ), with τ = 4 shifts. Setting `trained` adds 2 shift-equivalents.

**Instances:** each operator instance gets ±15 % seeded jitter on every parameter. Ravi is novice-improving. His Shift 0 is seeded with 2 events (per §05's challenge).

**Honesty caveat:** Ravi's post-training gain is a simulator *input*. The demo validates the measurement loop, not training efficacy.

**Environment** [HYPOTHESIS]:
- Material, sand / clay / blasted rock: dig time ×0.9 / 1.0 / 1.3; fill ×1.0 / 0.9 / 0.75; pressure +0 / 10 / 20 %.
- Terrain, flat / 5° slope / muddy: travel ×1 / 0.8 / 0.6; cycle +0 / 5 / 10 %.
- Weather, clear / rain / dust: visibility 200 / 80 / 30 m (proximity range capped); cycle +0 / 5 / 8 %.
- Truck gap: exponential with mean 90–300 s.

### 4.4 Injected, labelled events

| Event | Actor | Injection | Expected catcher |
|---|---|---|---|
| SEATBELT_OFF_MOVING | operator | belt = 0 for 20–120 s while travel > 0.5 km/h or hydraulics unlocked and joysticks active | T-CRIT |
| SWING_OVERSPEED_NEAR_TRUCK | operator | brake_lead → 5° for 3–8 cycles, giving ≥ 30 °/s at prox_truck < 3 m | rule T1, F8 |
| LOADER_APPROACH_OVERSPEED | operator | > 8 km/h within 10 m of the truck | rule |
| PROX_PERSON_INTRUSION | environment | person < 5 m while active | T-CRIT |
| EXCESSIVE_IDLE | operator | engine on, no input, high rpm, > 5 min, task_state ≠ waiting_for_truck | idle rule |
| IDLE_WAIT_TRUCK (**negative control**) | environment | same idle during waiting_for_truck | must be **suppressed** |
| HARSH_REVERSAL | operator | axis sign flip, Δ > 1.4 in < 0.3 s | F2, IF |
| HYD_PRESSURE_DROP | machine | response gain ×0.8, pressure −15 %, for every operator of the machine | IF, response ratio |
| RPM_HUNTING | machine | ±80 rpm at 0.5 Hz, steady throttle | IF |
| SENSOR_STUCK / DROPOUT | data | constant value or NaN for 10–60 s | data-quality gate (never blamed on the operator) |

### 4.5 Machine vs operator separation [PROPOSED]
- Operator issues change the **command**.
- Machine faults change the **command→response mapping** (e.g., swing_rate ÷ (joy_L_x × max)), and they recur across all operators of one machine.

### 4.6 Outputs (labels never inside telemetry)
```
data/sim/<cfg_hash>/telemetry/date=YYYY-MM-DD/machine_id=M01/*.parquet   # signals + task_state
data/sim/<cfg_hash>/context/tasks.parquet        # schedule as the dashboard knows it
data/sim/<cfg_hash>/labels/{segments,events}.parquet, labels/operators.json   # ground truth
data/sim/<cfg_hash>/manifest.json                # config, seed, git SHA, counts, "SIMULATED": true
```
`--stream` replays the files to MQTT `site/<site>/machine/<id>/telemetry` at 1× or 10× speed. It sends the same bytes as the batch output, so the demo is deterministic.

### 4.7 Module skeleton (Python 3.11)
```python
"""sentinel_sim.py - SIMULATED excavator/loader telemetry at 10 Hz. Not Caterpillar data."""
from dataclasses import dataclass, asdict
import zlib, numpy as np, pandas as pd

HZ, SWING_MAX_DPS, SHIFT_S = 10, 65.0, 8 * 3600          # SWING_MAX: HYPOTHESIS, check the spec sheet
EXC_PHASES = ("dig", "swing_loaded", "dump", "swing_empty")
LDR_PHASES = ("load", "reverse_loaded", "approach_truck", "dump", "reverse_empty", "return")
SHARE = np.array([30, 25, 15, 30])                       # Dirichlet concentration for EXC_PHASES
MATERIAL = {"sand": (0.9, 1.0), "clay": (1.0, 0.9), "blasted_rock": (1.3, 0.75)}  # (dig-time x, fill x)
LEARNED = ("cycle_s", "cycle_cv", "swing_peak_frac", "brake_lead_deg", "overshoot_p", "overlap",
           "reversal_pm", "belt_off_p", "idle_high_rpm_p", "fill_mu", "react_s")

@dataclass(frozen=True)
class Archetype:
    name: str; cycle_s: float; cycle_cv: float; swing_peak_frac: float; brake_lead_deg: float
    overshoot_p: float; overlap: float; reversal_pm: float; belt_off_p: float
    idle_high_rpm_p: float; fill_mu: float; react_s: float
    learn_tau: float | None = None; target: str | None = None    # novice-improving -> target archetype
    late_onset_h: float | None = None                            # degraded-late-shift (NOT a fatigue model)

@dataclass(frozen=True)
class Env:
    material: str = "clay"; terrain: str = "flat"; weather: str = "clear"
    visibility_m: float = 200.0; truck_gap_s: float = 240.0; passes_per_truck: int = 5

def rng_for(seed: int, op_id: str, shift: int) -> np.random.Generator:
    # crc32, not hash(): Python's hash is salted per process. Adding operators never changes existing streams.
    return np.random.default_rng(np.random.SeedSequence(seed, spawn_key=(zlib.crc32(op_id.encode()), shift)))

def effective(a: Archetype, ref: dict, shift: int, hour: float, trained: bool) -> Archetype:
    p = asdict(a)
    if a.learn_tau:
        w = np.exp(-(shift + 2 * trained) / a.learn_tau)       # training step = SIMULATED assumption
        t = asdict(ref[a.target]); p.update({k: t[k] + w * (p[k] - t[k]) for k in LEARNED})
    if a.late_onset_h and hour > a.late_onset_h:
        d = hour - a.late_onset_h
        p["cycle_s"] *= 1 + 0.04 * d; p["reversal_pm"] *= 1 + 0.25 * d
        p["overshoot_p"] = min(0.6, p["overshoot_p"] * (1 + 0.3 * d))
        p["brake_lead_deg"] *= max(0.5, 1 - 0.08 * d)
    return Archetype(**p)

def swing_profile(angle: float, p: Archetype, rng) -> np.ndarray:
    """Trapezoidal swing rate (deg/s). Late braking -> overshoot -> reverse correction (harsh reversal)."""
    peak = SWING_MAX_DPS * p.swing_peak_frac
    ramp = np.linspace(0, peak, max(2, int(HZ * peak / 90)))            # ~90 deg/s^2 [HYPOTHESIS]
    brake = np.linspace(peak, 0, max(2, int(HZ * p.brake_lead_deg / (peak / 2))))
    cruise = max(0.0, angle - p.brake_lead_deg - ramp.sum() / HZ)
    w = np.r_[ramp, np.full(int(HZ * cruise / peak), peak), brake]
    if rng.random() < p.overshoot_p:
        w = np.r_[w, -np.hanning(int(HZ * rng.uniform(0.6, 1.2))) * rng.uniform(10, 25)]
    return w

def respond(cmd: np.ndarray, gain: float = 1.0, tau_s: float = 0.15) -> np.ndarray:
    """Machine response = first-order lag of (gain * command). Machine faults change gain/tau, never cmd."""
    a, y = 1 / (1 + tau_s * HZ), np.zeros_like(cmd)
    for i in range(1, len(cmd)): y[i] = y[i - 1] + a * (gain * cmd[i] - y[i - 1])
    return y

def render_phase(phase, dur_s, p, env, machine, rng) -> pd.DataFrame: ...  # cmds -> respond() -> 10 Hz block

def simulate_shift(op_id, a, ref, machine, env, shift, seed, faults=(), trained=False):
    rng, t, blocks, segs = rng_for(seed, op_id, shift), 0.0, [], []
    truck_t = rng.exponential(env.truck_gap_s)
    while t < SHIFT_S:
        p = effective(a, ref, shift, t / 3600, trained)
        if t < truck_t:                                                # waiting_for_truck context
            blocks.append(render_phase("waiting_for_truck", truck_t - t, p, env, machine, rng))
            segs.append((t, truck_t, "waiting_for_truck")); t = truck_t; continue
        for _ in range(env.passes_per_truck):
            T = rng.lognormal(np.log(p.cycle_s), p.cycle_cv)
            for ph, f in zip(EXC_PHASES, rng.dirichlet(SHARE)):
                d = T * f * (MATERIAL[env.material][0] if ph == "dig" else 1.0)
                blocks.append(render_phase(ph, d, p, env, machine, rng)); segs.append((t, t + d, ph)); t += d
        truck_t = t + p.react_s + rng.exponential(env.truck_gap_s)
    tel = pd.concat(blocks, ignore_index=True)
    events = inject_events(tel, p, env, rng, faults)           # mutates tel slices; returns ground-truth rows
    return tel, pd.DataFrame(segs, columns=["t0", "t1", "phase"]), events

def inject_events(tel, p, env, rng, faults) -> pd.DataFrame: ...          # table 4.4
def write_dataset(runs, out_dir: str, cfg: dict) -> None: ...             # layout 4.6 + manifest
```

## 5. Preprocessing pipeline [PROPOSED]

| Step | Rule |
|---|---|
| Ingest | `data/raw/` is immutable (SHA-256 recorded). Parse to UTC; drop duplicate rows; pseudonymize IDs. |
| Units | Canonical units: rpm, bar, °/s, km/h, m, L/h, °C. J1939 scaling in the decoder; sentinel values → NaN; seatbelt normalized to 1 = buckled. Cumulative counters: diff, reset → 0, physically impossible → NaN. |
| Resample | 10 Hz grid per machine. Continuous signals: linear interpolation ≤ 0.5 s. Binary/categorical: forward-fill ≤ 1 s. Faults: as-of join. |
| Gaps | A gap > 2 s ends the segment. A window with > 10 % imputed samples is `dq_low`, excluded from IF training and scoring. Rules still run on raw data. |
| Windows | 20 s / 5 s stride (§04). Coarse data: 60 s / 15 s. Plus cycle-aligned segments for F21/F22 and R5. |
| Context tags | machine_type, task_type, majority task_state, gps_zone, material, weather, time_into_shift, phase-composition vector |
| Per-context normalization | Robust z = (x − median_c)/IQR_c, fit on **train only**. Back off to the parent context below 200 windows (§05). |
| Feature store | Parquet `features/v<schema>/machine_type=/date=` queried with DuckDB. Latest baselines mirrored to SQLite on the edge. |
| Reproducibility | One YAML config. `cfg_hash` = SHA-256(config + git SHA), written to `manifest.json`. SeedSequence keyed per (operator, shift). `requirements.lock`. Hash-named output folders; DVC optional. |

## 6. Split strategy

| Split | Held out | Answers |
|---|---|---|
| Leave-one-operator-out (LOOO) | All shifts of operator k | False positives per hour on an unseen person; cold start. Baselines, scalers and IF are fit on the other operators. |
| Leave-one-machine-out (LOMO) | All data of machine m | Attribution: HYD_PRESSURE_DROP on m must be attributed to the machine |
| Time-based (forward) | Last N days | R5 accuracy, drift: train → calibrate → test in time order |
| Held-out archetype | degraded-late-shift | Does IF flag behaviour it never saw? |

**Leakage rules:**
1. Split by shift, operator or machine **before** windowing. Never shuffle windows.
2. With a 5 s stride, adjacent windows share 75 % of their samples. At a time boundary, **purge** windows that cross it and **embargo** one window length on each side.
3. Scalers, context medians, baselines, IF and conformal scores are fit on train/calibration data only.
4. Exclude operator_id, shift_id, machine serial, absolute date and file order from features. Identity probe: if a classifier predicts the operator from the features, report only LOOO numbers.
5. Simulated test operators get their own seeds and jitter, so there are no parameter twins across splits.
6. R5 history features use only tasks that ended before the target task started. In-progress updates use only cycles observed so far.

## 7. Task-time estimation (R5)

**Target.** Wall-clock minutes from the first productive cycle to completion, including truck waits. We model y = log(duration / quantity). Quantiles are equivariant under monotone maps, so P_q(duration) = quantity·exp(P_q(y)) with no bias correction [PROPOSED].

**Features (known before the task starts):** task_type, quantity, material (schedule); machine class and SMU hours (Tier A); operator experience-hours band (roster); terrain and gps_zone; weather and visibility (API); time of day and shift hour; planned trucks / expected truck gap (dispatch; the strongest driver of waiting); hist_cycle_p50/p90 for (operator, task_type) over 30 d and hist_rate_p50 for (machine, task_type), both under leakage rule 6.

**Model:**
- LightGBM `objective="quantile"`, α ∈ {0.1, 0.5, 0.9} [14]. Monotone +1 on truck gap. Sort outputs to prevent crossing.
- CQR [13] on a later-in-time calibration fold:
  - E_i = max(q̂₀.₁ − y_i, y_i − q̂₀.₉).
  - Q̂ = the ⌈(n+1)·0.8⌉-th smallest E_i.
  - Interval = [q̂₀.₁ − Q̂, q̂₀.₉ + Q̂] in log space; P50 unchanged.
- Mondrian (per type) CQR only with ≥ 50 calibration tasks per type. Rolling recalibration as in §04.

**Cold start:**
1. Fewer than 30 tasks of this type → median rate by type × quantity, with the type's empirical P10–P90.
2. No history → cycles = quantity ÷ (bucket × 0.85 fill); time = cycles × 20 s + waits; band ±50 %, labelled "low confidence".

**In-progress update** [PROPOSED]: a Normal–Normal update on log cycle time.
- Prior: μ₀ = log(P50/N_expected); σ₀ = (log P90 − log P10)/2.563, using the conformalized bounds.
- After k cycles with log times ℓ_i and pooled σ:
  - μ_k = (μ₀/σ₀² + Σℓ_i/σ²)/(1/σ₀² + k/σ²)
  - σ_k² = 1/(1/σ₀² + k/σ²)
- Remaining time by Monte Carlo (1,000 draws): N_rem lognormal cycles at μ ~ N(μ_k, σ_k²), plus truck waits resampled from this shift. N_rem comes from payload or load count if present, else from the cycle count.
- At k = 0 this reproduces the model. The band narrows as cycles accumulate.

**Display:**
- "Truck loading, Zone B — 62 %. Finish ≈ 14:25 (likely 14:10–14:50)".
- A P10–P90 band with a P50 tick and a "now" marker; times rounded to 5 min; neutral colours.
- Confidence chip from (P90 − P10)/P50: < 0.3 high, 0.3–0.6 medium, > 0.6 low.
- Top 3 SHAP factors on the P50 model.
- A "trained on SIMULATED history" badge whenever applicable. In-cab while moving: text only.

**Metrics (SIMULATED until real logs exist):**

| Metric | Target [PROPOSED] |
|---|---|
| P10–P90 coverage, overall and per type | 0.80 ± 0.03 overall; ≥ 0.75 per type (CQR is only marginal) |
| Relative width (P90 − P10)/P50 | Compare models only at matched coverage |
| Pinball loss (α = 0.1, 0.5, 0.9); MAE of P50 | Below the median-by-type baseline |
| In-progress coverage and width per completion decile | Coverage ≥ 0.75; width shrinks as the task progresses |

## 8. Class imbalance and rare incidents [PROPOSED]

| Component | Strategy |
|---|---|
| T-CRIT rules | Deterministic, so no imbalance problem. Release gate: every injected SEATBELT_OFF_MOVING / PROX_PERSON_INTRUSION fires (recall 1.0), plus false positives per hour on clean SIMULATED shifts. |
| Isolation Forest | Unsupervised. Train on all training windows, with a "clean reference" ablation. Threshold from the alert budget (§04 §6). |
| Evaluation prevalence | The simulator injects about 10× the real rate. Report event-level recall (a hit is any overlapping window ± 5 s), time-to-detect and PR-AUC. Also report precision at the assumed real prevalence π: TPR·π / (TPR·π + FPR·(1−π)). |
| Per-operator rates | Exposure-normalized; Gamma–Poisson shrinkage (§05); recurrence ≥ 3 events across ≥ 2 shifts; Poisson-exact intervals. |
| Incidents / near-misses (Tier D) | No supervised model. Incident log plus human review; the simulator provides scenarios. |
| Any supervised model (P2) | Class weights or focal loss. More rare scenarios from the simulator, with time-/window-warp augmentation [8]. **No SMOTE or oversampling across overlapping windows**: it leaks near-duplicates between splits. |

## Challenge to brief
1. **Seatbelt (Tier B) is not plug-and-play.** SPN 1856 availability on Cat buses is unverified, and its polarity is inverted in some stacks [6]. Seatbelt T-CRIT on real data requires check 16 to pass; otherwise it is demonstrated on SIMULATED data only.
2. **The idle context gate needs `waiting_for_truck`, which Tier A never provides.** Add a one-tap operator "waiting" button and dispatch data to P0. Without them, idle is logged as "context unknown" and is not suppressed.
3. **R5 should model log(duration/quantity).** Use per-type CQR only with ≥ 50 calibration tasks per type; otherwise global CQR.
4. **The Shift 2 improvement is a simulator input.** The pitch must claim a working measurement loop, not proven training efficacy.
5. **AEMP data carries no operator ID [2].** Personalization on real data depends on a roster join.

## References
1. ISO/TS 15143-3:2020 — https://www.iso.org/standard/76394.html
2. Proemion ISO 15143-3 (AEMP) API docs — https://docs.proemion.com/aemp/
3. Cat Digital, ISO 15143-3 (AEMP 2.0) API — https://digital.cat.com/apis/products/prod/iso-15143-3-aemp-20-api (403 on fetch; unverified)
4. JCOM1939, EEC1 PGN 61444 / SPN 190 — https://jcom1939.com/sae-j1939-engine-speed-simulation-pgn-61444-spn-190-with-jcom1939-monitor/
5. Powertrain Control Solutions, J1939 Communication Document v2.1 — https://powertraincontrolsolutions.com/download/Released/Public/Developer_Files/PCS%20J1939%20Messages%20v2_1.pdf
6. Geotab, J1939 EV GO device compatibility (SPN 1856, polarity) — https://support.geotab.com/go-devices/installation/doc/j1939-ev-go-device
7. CSS Electronics, J1939 PGN list (secondary; verify in J1939DA) — https://www.csselectronics.com/pages/j1939-pgn-list
8. Rashid & Louis 2019, Adv. Eng. Informatics — https://www.sciencedirect.com/science/article/abs/pii/S1474034619300886
9. Molaei et al. 2024, Construction Robotics 8:14 — https://researchportal.tuni.fi/en/publications/automatic-recognition-of-excavator-working-cycles-using-supervise
10. Automatic Identification of Excavator Activities Using Joystick Signals, IJPEM 2019 (authors unverified) — https://link.springer.com/article/10.1007/s12541-019-00219-5
11. FlywheelAI excavator-dataset (license and size unverified) — https://huggingface.co/datasets/FlywheelAI/excavator-dataset
12. Construction Equipment, "How to Manage Engine Idling for Efficiency" — https://www.constructionequipment.com/sustainability/article/10757122/how-to-manage-engine-idling-for-efficiency
13. Romano, Patterson, Candès 2019, CQR — https://arxiv.org/abs/1905.03222
14. LightGBM parameters (quantile) — https://lightgbm.readthedocs.io/en/latest/Parameters.html
