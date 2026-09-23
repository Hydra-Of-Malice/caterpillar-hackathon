"""Safety-gated scoring, coaching tips, full reports, live feedback and model persistence."""
from __future__ import annotations

import json
import statistics
import time

import numpy as np
import pytest

from sentinel.practice.analyser import NoCyclesError, PracticeAnalyser
from sentinel.practice.feedback import MAX_TIPS, TEMPLATES, coaching_tips
from sentinel.practice.metrics import summarise
from sentinel.practice.model import ExpertMotionModel
from sentinel.practice.scorer import score_band, session_score
from sentinel.practice.settings import SAFETY_SCORE_CAP
from sentinel.shared.schemas import PracticeReport, PracticeSample

EX = "truck_loading_basic"


@pytest.fixture(scope="module")
def reports(analyser, make_session):
    """One report per archetype (unseen seed and persona)."""
    return {a: analyser.analyse(make_session(a, 8, seed=31, operator="EXP-NEW" if a == "expert" else "TRN"),
                                EX, f"T-{a}", f"S-{a}")
            for a in ("expert", "intermediate", "novice", "novice_improving")}


# ---------------------------------------------------------------- scoring
def test_archetype_separation(reports):
    s = {a: r.overall_score for a, r in reports.items()}
    assert s["expert"] >= 80 and reports["expert"].score_band in ("expert_like", "proficient")
    assert s["expert"] > s["intermediate"] + 10 > s["novice"] + 20
    cycles = [c.expert_likeness for c in reports["novice_improving"].cycles]
    assert cycles[-1] > cycles[0] and statistics.correlation(range(len(cycles)), cycles) > 0.8


def test_safety_gate_caps_cycle_score(emm, reports):
    """An otherwise expert cycle with a fast swing near the truck can never exceed 60."""
    scorer = emm.exercises[EX].scorer
    expert_cycle = {m.name: m.value for m in reports["expert"].cycles[0].metrics}
    assert scorer.cycle_score(expert_cycle, []) > 80
    unsafe = dict(expert_cycle, swing_near_truck_dps=60.0, cycle_time_s=expert_cycle["cycle_time_s"] - 3)
    assert scorer.cycle_score(unsafe, ["fast_swing_near_truck"]) <= SAFETY_SCORE_CAP
    for c in reports["novice"].cycles:
        assert c.safety_flags and c.expert_likeness <= SAFETY_SCORE_CAP


def test_session_caps_and_bands():
    assert session_score([95.0] * 10, [[]] * 10) == 95.0
    assert session_score([95.0] * 10, [["fast_swing_near_truck"]] + [[]] * 9) < 85       # never expert_like
    assert session_score([95.0] * 4, [["fast_swing_near_truck"]] + [[]] * 3) <= SAFETY_SCORE_CAP
    assert [score_band(x) for x in (10, 40, 64.9, 65, 84.9, 85)] == [
        "beginner", "developing", "developing", "proficient", "proficient", "expert_like"]


def test_calibration_expert_median_near_90(emm):
    sc = emm.exercises[EX].scorer
    assert sc.calibrate(sc.ll_p50) == pytest.approx(90.0, abs=1.0)
    lls = np.linspace(sc.ll_p50 - 500, sc.ll_sorted[-1], 50)
    assert np.all(np.diff([sc.calibrate(v) for v in lls]) >= 0)                      # monotone


# ---------------------------------------------------------------- feedback
def test_novice_tips_ranked_safety_first(reports):
    tips = reports["novice"].tips
    assert 1 <= len(tips) <= MAX_TIPS
    assert tips[0].severity == "priority" and tips[0].competency_id == "C04"
    assert tips[0].metric in ("swing_near_truck_dps", "swing_overshoot_deg")
    ranks = [t.evidence["rank"] for t in tips]
    assert ranks == sorted(ranks, reverse=True)
    families = [t.evidence["family"] for t in tips]
    assert len(families) == len(set(families))                                        # deduplicated


def test_tip_wording_carries_numbers(reports):
    for tip in reports["novice"].tips:
        ev = tip.evidence
        assert ev["module_id"].startswith("MOD-") and tip.competency_id
        assert any(ch.isdigit() for ch in tip.detail)
        assert "expert" in tip.detail
    near = next(t for t in reports["novice"].tips if t.metric == "swing_near_truck_dps")
    assert f"{near.evidence['value']:.0f}°/s" in near.detail and "site safety cap" in near.detail


def test_overlap_tip_text(emm):
    dists = emm.exercises[EX].dists
    cycles = [{"boom_swing_overlap": 0.12}] * 6
    tips = coaching_tips(summarise(cycles), cycles, [[]] * 6, dists)
    assert tips[0].metric == "boom_swing_overlap"
    assert "your overlap 12% vs expert" in tips[0].detail


def test_expert_gets_few_or_no_tips(reports):
    assert all(t.severity != "priority" for t in reports["expert"].tips)


def test_every_template_formats():
    words = {"yours": "1", "band": "1–2", "upto": "≤ 2", "phase_label": "the dig", "channel_label": "boom lever",
             "exit_pct": "40%"}
    for tpl in TEMPLATES.values():
        assert tpl.detail.format(**words) and tpl.title.format(**words)


# ---------------------------------------------------------------- report
def test_report_schema_and_provenance(reports):
    r = reports["novice_improving"]
    again = PracticeReport.model_validate(json.loads(r.model_dump_json()))
    assert again.n_cycles == 8 == len(r.cycles)
    assert [p.value for p in r.provenance] == ["ML", "SIMULATED"]
    assert r.model_version == "emm-test"
    assert {"dig", "swing_loaded", "dump", "swing_empty"} <= {p["phase"] for p in r.cycles[0].phases}
    ov = r.trajectory_overlay
    assert ov["expert_reference"] == "SIMULATED expert operators" and ov["n_points"] == 101
    ch = ov["phases"]["swing_loaded"]["channels"]["joy_boom"]
    assert len(ch["expert_p10"]) == len(ch["trainee_mean"]) == 101
    assert {"trainee", "expert_p50", "expert_p90"} <= ov["phases"]["dig"]["dtw"].keys()


def test_productivity_and_tip_impact(reports):
    p = reports["novice"].productivity
    assert p["label"] == "SIMULATED / ESTIMATE"
    assert p["trainee_m3_per_h"] < p["expert_m3_per_h"] and p["gap_pct"] > 20
    assert p["trainee_cycle_s"] > p["expert_cycle_s"]
    assert p["fuel_l_per_m3_trainee"] > p["fuel_l_per_m3_expert"]
    task = p["time_on_task_to_move_420m3"]
    assert task["trainee_h"] > task["expert_h"] and task["task"]["volume_m3"] == 420
    assert p["gap_drivers"] and p["gap_drivers"][0]["delta_s_per_cycle"] > 0
    idle = next((t for t in reports["novice"].tips if t.metric == "idle_gap_s"), None)
    if idle is not None:
        assert idle.evidence["est_s_saved_per_cycle"] > 0 and idle.evidence["est_m3_per_shift_gain"] > 0
    near = next(t for t in reports["novice"].tips if t.metric == "swing_near_truck_dps")
    assert near.evidence["est_s_saved_per_cycle"] is None                     # safety is not traded for time
    assert reports["novice"].value_estimate is None or isinstance(reports["novice"].value_estimate, dict)


def test_no_cycles_raises(analyser, make_session):
    idle = [PracticeSample(ts=1000 + i * 0.1, joy_swing=0, joy_boom=0, joy_stick=0, joy_bucket=0) for i in range(50)]
    with pytest.raises(NoCyclesError):
        analyser.analyse(idle, EX, "T", "S")


def test_unknown_exercise_falls_back_to_reference(analyser, make_session):
    r = analyser.analyse(make_session("expert", 3, seed=5), "some_other_drill", "T", "S")
    assert r.trajectory_overlay["reference_fallback"] and r.trajectory_overlay["reference_exercise"] == EX


# ---------------------------------------------------------------- live
def test_live_step_contract_and_latency(analyser, make_session):
    samples = make_session("novice", 3, seed=8)
    for s in samples[:30]:                                                     # warm-up
        analyser.live_step("warm", s)
    times, outs = [], []
    for s in samples:
        t0 = time.perf_counter()
        outs.append(analyser.live_step("lat", s))
        times.append(time.perf_counter() - t0)
    assert float(np.percentile(times, 95)) < 0.005 and float(np.mean(times)) < 0.005
    out = outs[100]
    assert {"phase", "deviation", "hint"} <= out.keys()
    assert set(out["deviation"]) <= {"joy_swing", "joy_boom", "joy_stick", "joy_bucket", "swing_dps", "boom_angle_deg"}
    live_phase = [o["phase"] for o in outs]
    gt = [s.gt["phase"] for s in samples]
    assert np.mean([a == b for a, b in zip(live_phase, gt)]) > 0.85


def test_live_hints_rate_limited(analyser, make_session):
    samples = make_session("novice", 6, seed=9)
    hinted = [(s.ts, o["hint"]) for s in samples if (o := analyser.live_step("hints", s))["hint"]]
    assert hinted, "a novice should receive at least one live hint"
    gaps = np.diff([t for t, _ in hinted])
    assert (gaps >= 6.0 - 1e-6).all()
    analyser.end_live("hints")


# ---------------------------------------------------------------- persistence and training data hygiene
def test_save_load_roundtrip(model_dir, make_session):
    loaded = PracticeAnalyser.load(model_dir)
    card = json.loads(next(model_dir.glob("*/model_card.json")).read_text(encoding="utf-8"))
    assert card["training_data"]["provenance"] == "SIMULATED expert operators"
    assert card["training_data"]["n_cycles_excluded_safety"] >= 1                  # the planted unsafe cycle
    assert len(card["sha256"]) == 64
    envelopes = json.loads(next(model_dir.glob("*/envelopes.json")).read_text(encoding="utf-8"))
    assert len(envelopes["exercises"][EX]["dig"]["channels"]["joy_stick"]["p50"]) == 101
    r = loaded.analyse(make_session("intermediate", 2, seed=4), EX, "T", "S")
    assert r.model_version == "emm-test"


def test_load_missing_model_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        ExpertMotionModel.load(tmp_path)
