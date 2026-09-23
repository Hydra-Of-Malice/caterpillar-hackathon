"""Productivity gap vs the expert reference, and per-tip time/volume impact. SIMULATED / ESTIMATE.

Volumes are bucket payload / material density, so m3/h = 3600 / cycle_s * payload_t / density
(= fill fraction x rated bucket capacity per cycle). Fuel comes from a generic pump-pressure
model (settings.FUEL_MODEL) because practice samples carry no fuel signal.
"""
from __future__ import annotations

from typing import Any

import numpy as np

from sentinel.practice.metrics import SPECS, MetricDistribution
from sentinel.practice.phases import Cycle
from sentinel.practice.settings import EXERCISES, FUEL_MODEL, PRODUCTIVE_H_PER_SHIFT, REFERENCE_TASK
from sentinel.practice.signals import SessionArrays

LABEL = "SIMULATED / ESTIMATE"
TIME_DRIVERS = ("dig_s", "swing_loaded_s", "dump_s", "swing_empty_s", "idle_gap_s")
# metric -> the phase-duration metric whose excess over the expert median the tip would recover
TIME_ATTRIBUTION = {
    "idle_gap_s": "idle_gap_s", "dig_s": "dig_s", "dig_stick_reversals": "dig_s",
    "swing_loaded_s": "swing_loaded_s", "swing_overshoot_deg": "swing_loaded_s",
    "swing_lever_reversals": "swing_loaded_s", "dump_s": "dump_s", "swing_empty_s": "swing_empty_s",
    "cycle_time_s": "cycle_time_s",
}


def fuel_l(arrays: SessionArrays, cycle: Cycle) -> float:
    """Estimated fuel (litres) over one cycle from main-pump pressure."""
    p = arrays.channels["hyd_pressure_bar"][cycle.i0:cycle.i1]
    load = np.clip((p - FUEL_MODEL["standby_bar"]) / (FUEL_MODEL["relief_bar"] - FUEL_MODEL["standby_bar"]), 0, 1)
    return float(np.sum(FUEL_MODEL["base_lph"] + FUEL_MODEL["load_lph"] * load) * arrays.dt / 3600.0)


def expert_reference(cycle_s: list[float], payload_t: list[float], fuel: list[float], exercise: str) -> dict[str, float]:
    """Median productivity of safe expert cycles for one exercise."""
    density = _exercise(exercise)["density_t_per_m3"]
    m3 = np.array(payload_t) / density
    return {"cycle_s": float(np.median(cycle_s)), "payload_t": float(np.median(payload_t)),
            "fuel_l_per_m3": float(np.median(np.array(fuel) / np.maximum(m3, 1e-6)))}


def _exercise(exercise: str) -> dict[str, Any]:
    return EXERCISES.get(exercise, EXERCISES["truck_loading_basic"])


def _m3_per_h(cycle_s: float, m3_per_cycle: float) -> float:
    return 3600.0 / max(cycle_s, 1e-6) * m3_per_cycle


def productivity(summary: dict[str, float], fuel_per_cycle: list[float], dists: dict[str, MetricDistribution],
                 ref: dict[str, float], exercise: str) -> dict[str, Any]:
    """Trainee vs expert throughput, fuel per m3, time to move the reference task, and gap drivers."""
    ex = _exercise(exercise)
    density, cap = ex["density_t_per_m3"], ex["rated_bucket_m3"]
    t_cycle, e_cycle = summary["cycle_time_s"], ref["cycle_s"]
    t_m3, e_m3 = summary["bucket_fill_t"] / density, ref["payload_t"] / density
    t_rate, e_rate = _m3_per_h(t_cycle, t_m3), _m3_per_h(e_cycle, e_m3)
    volume = REFERENCE_TASK["volume_m3"]
    drivers = [{"metric": m, "label": SPECS[m].label, "trainee": round(summary[m], 2), "expert": round(dists[m].p50, 2),
                "delta_s_per_cycle": round(summary[m] - dists[m].p50, 2),
                "share_of_time_gap_pct": round(100 * (summary[m] - dists[m].p50) / max(t_cycle - e_cycle, 1e-6), 1)}
               for m in TIME_DRIVERS if m in summary and m in dists and summary[m] > dists[m].p50]
    drivers.sort(key=lambda d: -d["delta_s_per_cycle"])
    if t_m3 < e_m3:
        drivers.append({"metric": "bucket_fill_t", "label": SPECS["bucket_fill_t"].label,
                        "trainee": round(summary["bucket_fill_t"], 2), "expert": round(ref["payload_t"], 2),
                        "delta_m3_per_h": round(_m3_per_h(t_cycle, e_m3 - t_m3), 1)})
    return {
        "label": LABEL,
        "trainee_cycle_s": round(t_cycle, 2), "expert_cycle_s": round(e_cycle, 2),
        "trainee_bucket_fill": round(t_m3 / cap, 3), "expert_bucket_fill": round(e_m3 / cap, 3),
        "trainee_m3_per_cycle": round(t_m3, 3), "expert_m3_per_cycle": round(e_m3, 3),
        "trainee_m3_per_h": round(t_rate, 1), "expert_m3_per_h": round(e_rate, 1),
        "gap_pct": round(100 * (e_rate - t_rate) / e_rate, 1),
        "gap_split_m3_per_h": {"from_cycle_time": round(_m3_per_h(t_cycle, e_m3) - e_rate, 1),
                               "from_bucket_fill": round(_m3_per_h(t_cycle, t_m3 - e_m3), 1)},
        "fuel_l_per_m3_trainee": round(float(np.median(fuel_per_cycle)) / max(t_m3, 1e-6), 3),
        "fuel_l_per_m3_expert": round(ref["fuel_l_per_m3"], 3),
        "time_on_task_to_move_420m3": {"task": REFERENCE_TASK, "trainee_h": round(volume / t_rate, 2),
                                       "expert_h": round(volume / e_rate, 2),
                                       "extra_h": round(volume / t_rate - volume / e_rate, 2)},
        "gap_drivers": drivers,
        "assumptions": {"rated_bucket_m3": cap, "material": ex["material"], "density_t_per_m3": density,
                        "volume": "payload_t / density", "fuel_model": dict(FUEL_MODEL, source="generic 20 t excavator, ESTIMATE"),
                        "productive_h_per_shift": PRODUCTIVE_H_PER_SHIFT,
                        "expert_reference": "median of SIMULATED, safety-filtered expert cycles"},
    }


def tip_impact(metric: str, summary: dict[str, float], dists: dict[str, MetricDistribution],
               prod: dict[str, Any]) -> dict[str, Any]:
    """Estimated seconds per cycle (or m3/h) a tip would recover, where attributable. Not additive."""
    t_cycle, t_m3 = prod["trainee_cycle_s"], prod["trainee_m3_per_cycle"]
    saved_s: float | None = None
    if metric in TIME_ATTRIBUTION:
        target = TIME_ATTRIBUTION[metric]
        if target in summary and target in dists:
            saved_s = max(0.0, summary[target] - dists[target].p50)
    elif metric == "boom_swing_overlap" and {"boom_swing_overlap", "swing_loaded_s"} <= dists.keys():
        # boom lift not overlapped with the swing is done sequentially: missing overlap x expert swing time
        missing = max(0.0, dists["boom_swing_overlap"].p50 - summary.get("boom_swing_overlap", 0.0))
        saved_s = missing * dists["swing_loaded_s"].p50
    if metric == "bucket_fill_t":
        gain = _m3_per_h(t_cycle, max(0.0, prod["expert_m3_per_cycle"] - t_m3))
    elif saved_s is not None:
        saved_s = min(saved_s, 0.9 * t_cycle)
        gain = _m3_per_h(t_cycle - saved_s, t_m3) - _m3_per_h(t_cycle, t_m3)
    else:
        return {"est_s_saved_per_cycle": None, "impact_note": "safety or control quality: not traded against time",
                "impact_label": LABEL}
    return {"est_s_saved_per_cycle": None if saved_s is None else round(saved_s, 2),
            "est_m3_per_h_gain": round(gain, 1), "est_m3_per_shift_gain": round(gain * PRODUCTIVE_H_PER_SHIFT, 1),
            "impact_note": "estimate per tip; tips overlap, so gains are not additive", "impact_label": LABEL}
