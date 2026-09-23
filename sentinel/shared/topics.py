"""MQTT topic names. Prefix: sentinel/v1/{site}/{machine}/..."""
from __future__ import annotations

PREFIX = "sentinel/v1"


def _t(site: str, machine: str, leaf: str) -> str:
    return f"{PREFIX}/{site}/{machine}/{leaf}"


def telemetry_raw(site: str, machine: str) -> str:        # 10 Hz TelemetrySample, QoS 0
    return _t(site, machine, "telemetry/raw")


def telemetry_tier_a(site: str, machine: str) -> str:     # TierASnapshot, QoS 1
    return _t(site, machine, "telemetry/tier_a")


def safety_alert(site: str, machine: str) -> str:         # SafetyAlertMsg, QoS 1
    return _t(site, machine, "safety/alert")


def safety_heartbeat(site: str, machine: str) -> str:     # SafetyHeartbeat, QoS 0, NOT retained
    return _t(site, machine, "safety/heartbeat")


def task_state(site: str, machine: str) -> str:           # context (waiting_for_truck etc.), QoS 1, retained
    return _t(site, machine, "context/task_state")


def health(site: str, machine: str, component: str) -> str:
    return _t(site, machine, f"health/{component}")


def sim_control(site: str, machine: str) -> str:          # demo injections → simulator
    return _t(site, machine, "sim/control")


def practice_raw(session_id: str) -> str:                 # trainee PracticeSample stream
    return f"{PREFIX}/practice/{session_id}/raw"


# wildcard helpers
ALL_TELEMETRY = f"{PREFIX}/+/+/telemetry/raw"
ALL_SAFETY_ALERTS = f"{PREFIX}/+/+/safety/alert"
ALL_HEARTBEATS = f"{PREFIX}/+/+/safety/heartbeat"
ALL_TASK_STATE = f"{PREFIX}/+/+/context/task_state"
