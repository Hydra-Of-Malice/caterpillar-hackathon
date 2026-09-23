"""The pipeline must never read simulator ground truth (`sample.gt`)."""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

from sentinel.pipeline import Pipeline, RuntimeContext
from sentinel.shared.schemas import TelemetrySample
from tests.pipeline.synth import idle_samples, loading_cycles

PIPELINE_DIR = Path(__file__).resolve().parents[2] / "sentinel" / "pipeline"


class GtTrap(TelemetrySample):
    """A sample whose `gt` attribute raises on access."""

    def __getattribute__(self, name: str):
        if name == "gt":
            raise AssertionError("pipeline read sample.gt")
        return super().__getattribute__(name)


def trapped(samples: list[TelemetrySample]) -> list[GtTrap]:
    return [GtTrap(**{**s.model_dump(exclude={"gt"}), "gt": {"inject": "fast_swing", "phase": "dig"}})
            for s in samples]


def stream() -> list[TelemetrySample]:
    fast = loading_cycles(6, seed=5, swing_scale=2.4)
    return fast + idle_samples(30.0, fast[-1].ts + 0.1, seq0=len(fast))


def test_trap_works():
    with pytest.raises(AssertionError):
        _ = trapped(idle_samples(0.1, 0.0))[0].gt


@pytest.mark.parametrize("with_model", [True, False])
def test_pipeline_never_reads_gt(with_model, model_dir, no_model_dir):
    pipe = Pipeline(model_dir if with_model else no_model_dir)
    events = [e for s in trapped(stream()) for e in pipe.process(s, RuntimeContext(task_type="truck_loading"))]
    assert events, "the stream should exercise the rule / fusion paths"
    assert pipe.last_window() is not None


def test_no_gt_access_in_pipeline_source():
    for path in PIPELINE_DIR.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            assert not (isinstance(node, ast.Attribute) and node.attr == "gt"), f"{path.name}:{node.lineno}"
            assert not (isinstance(node, ast.Constant) and node.value == "gt"), f"{path.name}:{node.lineno}"
