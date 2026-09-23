"""Versioned constants for the Practice Analyser (Expert Motion Model).

Every threshold here is [PROPOSED] and carries ``PRACTICE_CONFIG_VERSION``. The expert
reference data behind the model is SIMULATED in the prototype.
"""
from __future__ import annotations

from typing import Any

from sentinel.shared.config import load_yaml

PRACTICE_CONFIG_VERSION = "practice-0.1.0"
MODEL_KIND = "expert_motion"
TRAINING_PROVENANCE = "SIMULATED expert operators"

# ---------------------------------------------------------------- signals
SAMPLE_HZ = 10.0
WORK_PHASES: tuple[str, ...] = ("dig", "swing_loaded", "dump", "swing_empty")
ALL_PHASES: tuple[str, ...] = WORK_PHASES + ("idle",)
BASE_CHANNELS: tuple[str, ...] = (
    "joy_swing", "joy_boom", "joy_stick", "joy_bucket", "swing_dps", "swing_angle_deg",
    "boom_angle_deg", "stick_angle_deg", "bucket_angle_deg", "hyd_pressure_bar", "payload_t",
    "bucket_to_truck_m",
)
ENVELOPE_CHANNELS: tuple[str, ...] = (
    "joy_swing", "joy_boom", "joy_stick", "joy_bucket", "swing_dps", "boom_angle_deg",
)
CHANNEL_LABELS: dict[str, str] = {
    "joy_swing": "swing lever", "joy_boom": "boom lever", "joy_stick": "stick lever",
    "joy_bucket": "bucket lever", "swing_dps": "swing speed", "boom_angle_deg": "boom angle",
}
CHANNEL_UNITS: dict[str, str] = {
    "joy_swing": "-1..1", "joy_boom": "-1..1", "joy_stick": "-1..1", "joy_bucket": "-1..1",
    "swing_dps": "deg/s", "boom_angle_deg": "deg",
}
# Minimum band sigma per channel so a very tight expert band does not explode z-scores.
CHANNEL_SIGMA_FLOOR: dict[str, float] = {
    "joy_swing": 0.05, "joy_boom": 0.05, "joy_stick": 0.05, "joy_bucket": 0.05,
    "swing_dps": 2.0, "boom_angle_deg": 1.0,
}
PHASE_LABELS: dict[str, str] = {
    "dig": "the dig", "swing_loaded": "the loaded swing", "dump": "the dump",
    "swing_empty": "the return swing", "idle": "pauses",
}
N_POINTS = 101                    # time-normalised points per phase
MISSING_TRUCK_M = 50.0            # feature fill when bucket_to_truck_m is None (no truck detected)
JOY_ACTIVE = 0.15                 # lever deflection counted as "active"
REVERSAL_HYSTERESIS = 0.10        # lever travel needed to count a direction change
ENVELOPE_EXIT_Z = 2.0             # |z| beyond which a point is outside the expert envelope
SIGMA_PER_P10_P90 = 2.563         # (P90 - P10) of a normal distribution in sigmas

# ---------------------------------------------------------------- phase model
MIN_PHASE_S = 0.2                 # minimum phase duration after smoothing
HMM_STAY_P = 0.95                 # per-sample probability of staying in the same phase
MIN_EXPERTS = 3                   # 05 §5.6 minimum support
MIN_EXPERT_CYCLES = 50

# ---------------------------------------------------------------- safety gates (site caps, not learned)
def _near_truck_rule() -> dict[str, Any]:
    """Single source of truth: behaviour rule fast_swing_near_truck in config/fusion.yaml."""
    try:
        rules = load_yaml("fusion")["rules"]
        rule = rules["fast_swing_near_truck"]
        return {"swing_dps": float(rule["swing_dps"]), "near_truck_m": float(rule["near_truck_m"]),
                "min_duration_s": float(rule["min_duration_s"]), "version": str(rules.get("version", "unknown")),
                "source": "config/fusion.yaml rules.fast_swing_near_truck"}
    except (FileNotFoundError, KeyError, TypeError):
        return {"swing_dps": 35.0, "near_truck_m": 5.0, "min_duration_s": 0.3, "version": PRACTICE_CONFIG_VERSION,
                "source": "sentinel.practice.settings fallback"}


# The practice gate is a training standard: it takes the rule's zone and duration from config but is
# never looser than 35 deg/s, even if the in-cab alert threshold is raised to limit alarm fatigue.
PRACTICE_NEAR_TRUCK_MAX_DPS = 35.0
NEAR_TRUCK_RULE = _near_truck_rule()
NEAR_TRUCK_M = NEAR_TRUCK_RULE["near_truck_m"]
NEAR_TRUCK_SUSTAIN_S = NEAR_TRUCK_RULE["min_duration_s"]
SAFETY_CAPS: dict[str, float] = {
    # |swing| held >= sustain with the bucket near the truck
    "swing_near_truck_dps": min(NEAR_TRUCK_RULE["swing_dps"], PRACTICE_NEAR_TRUCK_MAX_DPS),
    "swing_overshoot_deg": 15.0,   # swing past the dump point: bucket may pass over the truck cab (geometry proxy)
}
SAFETY_FLAGS: dict[str, str] = {
    "swing_near_truck_dps": "fast_swing_near_truck",
    "swing_overshoot_deg": "overshoot_past_truck",
}
SAFETY_FLAG_TEXT: dict[str, str] = {
    "fast_swing_near_truck": "Loaded swing faster than the {cap:.0f} deg/s site cap near the truck",
    "overshoot_past_truck": "Loaded bucket swung more than {cap:.0f} deg past the dump point (may pass over the truck cab)",
}
SAFETY_SCORE_CAP = 60.0           # a flagged cycle can never score above this
SESSION_FLAGGED_CAP = 84.0        # any flagged cycle keeps the session out of the expert_like band
SESSION_MANY_FLAGS_FRAC = 0.25    # at or above this flagged fraction the session is capped at SAFETY_SCORE_CAP

# ---------------------------------------------------------------- score calibration
EXPERT_MEDIAN_SCORE = 90.0        # expert median log-likelihood maps here
EXPERT_P10_SCORE = 78.0           # expert P10 log-likelihood maps here
ANCHOR_BAND_WIDTHS = 2.0          # a cycle this many band-widths outside the expert band on every metric...
ANCHOR_SCORE = 40.0               # ...scores this (beginner / developing boundary)
SCORE_BANDS: tuple[tuple[float, str], ...] = (
    (85.0, "expert_like"), (65.0, "proficient"), (40.0, "developing"), (0.0, "beginner"),
)

# ---------------------------------------------------------------- live feedback
LIVE_BUFFER = 12                  # samples kept per live session (>= longest feature window + 1)
LIVE_HINT_MIN_INTERVAL_S = 6.0    # at most one hint per 6 s of sample time
LIVE_HINT_REPEAT_S = 15.0         # the same hint text is not repeated within 15 s
LIVE_SUSTAIN_S = 1.0              # a deviation must persist this long before it produces a hint

# ---------------------------------------------------------------- productivity (ESTIMATE)
REFERENCE_TASK = {"task_id": "T-1", "name": "Truck Loading, Bench 3", "volume_m3": 420.0}
PRODUCTIVE_H_PER_SHIFT = 7.0      # loading hours in a 06:00-14:30 shift after breaks and truck waits (ESTIMATE)
# Generic 20 t excavator fuel model from main pump pressure (ESTIMATE, not measured):
# fuel_lph = base + load * clip((p - standby) / (relief - standby), 0, 1)
FUEL_MODEL = {"base_lph": 6.2, "load_lph": 15.0, "standby_bar": 32.0, "relief_bar": 343.0}

# ---------------------------------------------------------------- cohort simulation (SIMULATED + ASSUMPTION)
def _cohort_assumptions() -> dict[str, Any]:
    """Cohort-simulation assumptions. The coaching effect comes from config/value_model.yaml training_effect."""
    out: dict[str, Any] = {
        "lr_multiplier": 1.18, "lr_multiplier_range": [1.05, 1.41], "effect_source": "fallback default",
        "lr_multiplier_note": ("ASSUMPTION - to be validated in a pilot; literature on augmented feedback in "
                               "simulator training suggests a modest benefit, not a measured effect size"),
        "base_learning_rate": 0.18,  # fraction of the remaining skill gap closed per session (median trainee)
        "learning_rate_spread": 0.35,  # lognormal sigma across trainees
        "initial_skill": 0.12,       # novice start (0 = novice reference, 1 = expert reference)
        "tips_acted_on": 3,          # coached trainees work on the top-N tips each session
        "cycles_per_session": 8,
    }
    try:
        effect = load_yaml("value_model")["training_effect"]
        lrm = effect["learning_rate_multiplier"]
        out |= {"lr_multiplier": float(lrm["base"]), "lr_multiplier_range": [float(lrm["low"]), float(lrm["high"])],
                "effect_source": f"config/value_model.yaml training_effect ({effect.get('version', 'unversioned')}, "
                                 f"{effect.get('tag', 'ASSUMPTION')})"}
    except (FileNotFoundError, KeyError, TypeError):
        pass
    return out


COHORT_ASSUMPTIONS = _cohort_assumptions()

# ---------------------------------------------------------------- exercises and training content
EXERCISES: dict[str, dict[str, Any]] = {
    "truck_loading_basic": {
        "exercise_id": "truck_loading_basic",
        "title": "Truck loading - basic",
        "description": "Dig at the face, swing about 90 deg to a haul truck, dump, return. "
                       "Scored against SIMULATED expert operators.",
        "task_type": "truck_loading",
        "machine_type": "EX-20t",
        "truck": True,
        "material": "clay_gravel",
        "density_t_per_m3": 1.9,
        "rated_bucket_m3": 1.2,
        "competencies": ["C04", "C08", "C09"],
        "modules": ["MOD-SWING-APPROACH", "MOD-TRUCK-LOADING", "MOD-SMOOTH-CONTROLS"],
        "suggested_cycles": 8,
    },
    "trench_basic": {
        "exercise_id": "trench_basic",
        "title": "Trench - basic dig and cast to spoil",
        "description": "Dig a straight trench, swing about 75 deg to a spoil pile, dump, return. "
                       "Scored against SIMULATED expert operators.",
        "task_type": "trenching",
        "machine_type": "EX-20t",
        "truck": False,
        "material": "clay",
        "density_t_per_m3": 1.8,
        "rated_bucket_m3": 1.2,
        "competencies": ["C07", "C08", "C09"],
        "modules": ["MOD-TRENCH-EDGES", "MOD-SMOOTH-CONTROLS"],
        "suggested_cycles": 8,
    },
}
DEFAULT_EXERCISE = "truck_loading_basic"
