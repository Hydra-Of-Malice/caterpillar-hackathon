"""DEMO_MODE only: injections (→ sim/control, with direct fallback), WAN switch, scenario, fast-forward."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from sentinel.edge_api import demo
from sentinel.edge_api.routes import get_rt
from sentinel.edge_api.runtime import EdgeRuntime

router = APIRouter(prefix="/demo", tags=["demo"])


class Inject(BaseModel):
    kind: str
    mode: str = "auto"                     # auto | sim | direct
    params: dict[str, Any] = Field(default_factory=dict)


class Wan(BaseModel):
    up: bool


class Scenario(BaseModel):
    name: str
    speed: float = Field(default=1.0, gt=0)


class FastForward(BaseModel):
    minutes: float = Field(ge=0, le=600)


def demo_rt(rt: EdgeRuntime = Depends(get_rt)) -> EdgeRuntime:
    if not rt.settings.demo_mode:
        raise HTTPException(403, "demo controls are disabled (DEMO_MODE=0)")
    return rt


@router.get("/kinds")
def kinds() -> dict[str, Any]:
    return {"kinds": list(demo.ALL_KINDS), "modes": ["auto", "sim", "direct"]}


@router.post("/inject")
def inject(body: Inject, rt: EdgeRuntime = Depends(demo_rt)) -> dict[str, Any]:
    if body.kind not in demo.ALL_KINDS:
        raise HTTPException(422, {"reason": "unknown_kind", "kinds": list(demo.ALL_KINDS)})
    if body.mode not in ("auto", "sim", "direct"):
        raise HTTPException(422, "mode must be auto, sim or direct")
    return demo.inject(rt, body.kind, body.mode, body.params)


@router.post("/wan")
def wan(body: Wan, rt: EdgeRuntime = Depends(demo_rt)) -> dict[str, Any]:
    """Simulated WAN partition between the edge sync agent and the cloud process."""
    rt.sync.set_wan(body.up)
    return {"ok": True, "wan_up": rt.sync.wan_up, "cloud": "online" if rt.sync.cloud_online else "offline"}


@router.post("/scenario")
def scenario(body: Scenario, rt: EdgeRuntime = Depends(demo_rt)) -> dict[str, Any]:
    return demo.scenario(rt, body.name, body.speed)


@router.post("/fast-forward-operation")
def fast_forward(body: FastForward, rt: EdgeRuntime = Depends(demo_rt)) -> dict[str, Any]:
    """Jump continuous operation to ``minutes`` (e.g. 125 → T1 check-in, 151 → T3, 166 → T4)."""
    return demo.fast_forward(rt, body.minutes)
