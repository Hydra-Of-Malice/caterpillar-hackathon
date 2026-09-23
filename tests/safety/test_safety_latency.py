"""Latency micro-benchmark: RuleEngine.evaluate must be far inside the 500 ms T-CRIT budget."""
from __future__ import annotations

import math
import time

from sentinel.shared.schemas import TelemetrySample

from sentinel.safety.rules import RuleEngine

from tests.safety.factory import DT, T0, sample

N = 20_000


def _mixed_stream(n: int) -> list[TelemetrySample]:
    """A 10 Hz stream that keeps every rule busy: belt cycling, person approaching, speed changes."""
    out = []
    for i in range(n):
        t = i * DT
        phase = (i // 50) % 8
        d = 2.0 + 10.0 * abs(math.sin(t / 7.0)) + (i % 3) * 1e-3
        out.append(sample(
            T0 + t, seq=i, t_pub_ns=i,
            seatbelt=phase not in (2, 3), park_brake=phase in (4, 5), hyd_lockout=phase == 6,
            travel_kmh=abs(9.0 * math.sin(t / 5.0)), swing_dps=30.0 * math.sin(t), joy_boom=0.5 * math.cos(t),
            prox_person_m=d if phase != 7 else None, prox_person_sector="rear",
            prox_truck_m=6.0 + (i % 5) * 1e-3, zone="TL-1" if phase % 2 else None))
    return out


def test_evaluate_p99_under_1ms() -> None:
    stream = _mixed_stream(N)
    engine = RuleEngine()
    for s in stream[:500]:                                   # warm-up
        engine.evaluate(s)
    engine = RuleEngine()
    durations, transitions = [], 0
    for s in stream:
        t0 = time.perf_counter_ns()
        transitions += len(engine.evaluate(s))
        durations.append(time.perf_counter_ns() - t0)
    durations.sort()
    p50, p99 = durations[N // 2] / 1e6, durations[int(N * 0.99)] / 1e6
    print(f"\nRuleEngine.evaluate over {N} samples ({transitions} transitions): "
          f"p50={p50 * 1000:.1f} us  p99={p99 * 1000:.1f} us  max={durations[-1] / 1e6:.3f} ms")
    assert transitions >= 50                                  # the stream really exercises transitions
    assert p50 < 0.2
    assert p99 < 1.0
