"""Business value API. The cloud app mounts ``router`` under /api/v1 (guarded import).

Every response carries ``gains`` (operational units, for the product UI) and ``usd`` (for the
Business Value page only), plus the ESTIMATE / SIMULATED label. Works standalone on the
base-case defaults in config/value_model.yaml.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, Field

from sentinel.value import model as m
from sentinel.value import rollups as r

router = APIRouter(prefix="/value", tags=["value"])

ScenarioName = Literal["low", "base", "high"]


class EstimateRequest(BaseModel):
    fleet_size: int | None = Field(default=None, ge=1, le=100_000)
    overrides: dict[str, float] = Field(default_factory=dict)
    scenario: ScenarioName = "base"
    top_n: int = Field(default=8, ge=1, le=60)


class PracticeRequest(BaseModel):
    productivity: dict[str, Any]
    overrides: dict[str, float] = Field(default_factory=dict)
    scenario: ScenarioName = "base"
    closure: float | None = Field(default=None, ge=0, le=1)


class TodayRequest(BaseModel):
    fleet_summary: dict[str, Any] | None = None
    overrides: dict[str, float] = Field(default_factory=dict)


def _guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/assumptions")
def get_assumptions() -> dict[str, Any]:
    """The versioned assumption set: low/base/high, unit, tag, source and note for every entry."""
    cfg = m.load_config()
    return {"label": m.LABEL, "version": cfg["version"], "currency": cfg["currency"],
            "machine_class": cfg["machine_class"], "assumptions": cfg["assumptions"],
            "training_effect": cfg.get("training_effect")}


@router.post("/estimate")
def post_estimate(req: EstimateRequest | None = Body(default=None)) -> dict[str, Any]:
    """Per-lever gains and USD, totals, payback, scenarios and a sensitivity tornado."""
    req = req or EstimateRequest()
    return _guard(m.estimate, req.scenario, req.fleet_size, req.overrides, req.top_n)


@router.post("/practice")
def post_practice(req: PracticeRequest) -> dict[str, Any]:
    """PracticeReport.productivity → 'closing X% of your gap = +Y m³/shift = $Z/yr per operator'."""
    params = _guard(m.resolve, req.scenario, req.overrides)
    return _guard(m.practice_value, req.productivity, params, req.closure)


@router.get("/levers")
def get_levers() -> dict[str, Any]:
    """Each CAT Sentinel feature (R1–R5 + Practice Analyser) → value lever, KPI and how it is measured."""
    return r.levers_catalog()


@router.get("/unit-costs")
def get_unit_costs() -> dict[str, Any]:
    """USD per unit of outcome (idle minute, m³, cycle-second, avoided event, incident, training day, hour early)."""
    return r.unit_costs()


@router.post("/today")
def post_today(req: TodayRequest | None = Body(default=None)) -> dict[str, Any]:
    """'Value today' roll-up. Gains first, USD line items second. No body → seeded SIMULATED demo shift."""
    req = req or TodayRequest()
    return _guard(r.value_today, req.fleet_summary, req.overrides)


@router.get("/pitch")
def get_pitch() -> dict[str, Any]:
    """Five headline numbers for the judges' slide, each with a low–high range and sources."""
    return r.pitch()


@router.get("/gains-headline")
def get_gains_headline() -> dict[str, Any]:
    """4–5 headline gains in operational units, with ranges and sources, for the landing hero."""
    return r.gains_headline()
