"""Scenario files (config/scenarios/<name>.yaml): shifts, schedules, cues and machine faults.

Validated with pydantic at load time (boundary validation). All scenario content is SIMULATED.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator

from sentinel.shared.config import CONFIG_DIR
from sentinel.shared.schemas import TaskType

SCENARIO_DIR = CONFIG_DIR / "scenarios"


class Segment(BaseModel):
    """One block of the shift schedule. Durations are planned; activity finishes its current cycle."""
    kind: Literal["warmup", "travel", "task", "break", "cooldown"]
    minutes: float
    task_id: str | None = None          # may contain "{shift}", replaced by the shift id
    task_type: TaskType | None = None
    zone: str | None = None
    material: str = "clay_gravel"
    truck_gap_s: float = 120.0          # mean gap between trucks (exponential)
    passes_per_truck: int = 6
    truck_angle_deg: float = 90.0
    truck_present: bool = False         # a truck is already positioned when the segment starts
    speed_kmh: float = 2.8              # travel segments

    @model_validator(mode="after")
    def _task_fields(self) -> "Segment":
        if self.kind == "task" and (self.task_id is None or self.task_type is None):
            raise ValueError("task segments need task_id and task_type")
        return self


class Cue(BaseModel):
    """Scripted injection at an offset from the shift start (at_min or at_s)."""
    kind: str
    at_min: float | None = None
    at_s: float | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    speed: float | None = None          # pacing hint for sim.run while this injection is active
    label: str | None = None

    @model_validator(mode="after")
    def _one_time(self) -> "Cue":
        if (self.at_min is None) == (self.at_s is None):
            raise ValueError("cue needs exactly one of at_min / at_s")
        return self

    @property
    def offset_s(self) -> float:
        return self.at_s if self.at_s is not None else float(self.at_min) * 60.0


class MachineFault(BaseModel):
    """Machine-side fault active over an absolute time window (applies to every operator)."""
    kind: Literal["hyd_fault"]
    start: datetime
    end: datetime
    params: dict[str, Any] = Field(default_factory=dict)


class MachineSpec(BaseModel):
    machine_type: str = "EX-20t"
    model: str = "Cat 320 (simulated)"
    smu_h: float = 5000.0
    fuel_l: float = 0.0
    prox_fitted: bool = True
    faults: list[MachineFault] = Field(default_factory=list)


class Conditions(BaseModel):
    ambient_c: float = 31.0
    rain_from: time | None = None       # local time; cycles slow by rain_cycle_mult afterwards
    rain_cycle_mult: float = 1.05


class ShiftSpec(BaseModel):
    shift_id: str
    operator_id: str
    machine_id: str
    archetype: str
    skill: float = 0.0
    start: datetime                     # timezone-aware local start
    schedule: list[Segment] | str       # inline, or a key into Scenario.schedules
    cues: list[Cue] = Field(default_factory=list)
    low_prob_events: bool = False
    conditions: Conditions = Field(default_factory=Conditions)
    operator_overrides: dict[str, float] = Field(default_factory=dict)   # pin OperatorParams fields

    @field_validator("start")
    @classmethod
    def _aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("shift start must carry a UTC offset, e.g. 2026-09-23T06:00:00+05:30")
        return v


class Scenario(BaseModel):
    version: str
    name: str
    description: str = ""
    simulated: bool = True
    site_id: str = "north-quarry"
    machines: dict[str, MachineSpec]
    schedules: dict[str, list[Segment]] = Field(default_factory=dict)
    shifts: list[ShiftSpec]

    @model_validator(mode="after")
    def _refs(self) -> "Scenario":
        for sh in self.shifts:
            if sh.machine_id not in self.machines:
                raise ValueError(f"shift {sh.shift_id}: unknown machine {sh.machine_id}")
            if isinstance(sh.schedule, str) and sh.schedule not in self.schedules:
                raise ValueError(f"shift {sh.shift_id}: unknown schedule {sh.schedule!r}")
        return self

    def schedule_of(self, shift: ShiftSpec) -> list[Segment]:
        return self.schedules[shift.schedule] if isinstance(shift.schedule, str) else shift.schedule

    def duration_s(self, shift: ShiftSpec) -> float:
        return sum(seg.minutes for seg in self.schedule_of(shift)) * 60.0

    def end_of(self, shift: ShiftSpec) -> datetime:
        return shift.start + timedelta(seconds=self.duration_s(shift))

    def for_machine(self, machine_id: str) -> "Scenario":
        """Sub-scenario with only the shifts of one machine."""
        shifts = [s for s in self.shifts if s.machine_id == machine_id]
        if not shifts:
            raise ValueError(f"scenario {self.name} has no shifts on {machine_id}")
        return self.model_copy(update={"shifts": shifts})

    @property
    def machine_ids(self) -> list[str]:
        return list(dict.fromkeys(s.machine_id for s in self.shifts))


def load_scenario_file(name: str) -> Scenario:
    """Load and validate config/scenarios/<name>.yaml."""
    path = SCENARIO_DIR / f"{name}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"no scenario {name!r} in {SCENARIO_DIR}")
    with path.open("r", encoding="utf-8") as f:
        return Scenario.model_validate(yaml.safe_load(f))
