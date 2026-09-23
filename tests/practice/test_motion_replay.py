"""Motion replay (expert demonstration animation) — SIMULATED operator frames for the UI."""
from __future__ import annotations

from sentinel.practice.replay import motion_replay


def test_expert_replay_frames_are_drawable_and_safe_near_truck():
    r = motion_replay("expert", "truck_loading_basic", 2)
    assert r["hz"] == 10 and len(r["frames"]) > 200 and r["truck"]
    f = r["frames"][0]
    assert len(f["joints"]) == 4 and all(len(p) == 2 for p in f["joints"])
    assert {"dig", "swing_loaded", "dump", "swing_empty"} <= {fr["phase"] for fr in r["frames"]}
    rule = r["near_truck_rule"]
    near = [fr for fr in r["frames"] if fr["bucket_to_truck_m"] is not None and fr["bucket_to_truck_m"] < rule["within_m"]]
    assert near and max(abs(fr["swing_dps"]) for fr in near) <= rule["swing_dps"]     # the expert slows near the truck
    assert "SIMULATED" in r["label"]


def test_novice_swings_faster_than_expert():
    peak = lambda a: max(abs(fr["swing_dps"]) for fr in motion_replay(a, "truck_loading_basic", 2)["frames"])
    assert peak("novice") > peak("expert")
