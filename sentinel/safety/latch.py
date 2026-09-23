"""Debounce / latch / clear-hold state machine for one rule activation.

Pure and allocation-free on the hot path. Times are sample timestamps (unix seconds).
"""
from __future__ import annotations

from typing import Literal

EPS_S = 1e-6          # absorbs float error in accumulated timestamps (t0 + n * 0.1)

Transition = Literal["raised", "cleared"]


class Latch:
    """Raise after the condition holds ``debounce_s``; clear after its negation holds ``clear_hold_s``.

    ``step`` takes a tri-state condition:
      * ``True``  — raise condition present,
      * ``False`` — clear condition present,
      * ``None``  — indeterminate (hysteresis band or unreadable input): no progress either way.

    While raised the latch never re-announces (one ``"raised"`` per continuous activation).
    """

    __slots__ = ("debounce_s", "clear_hold_s", "raised", "onset_ts", "_onset", "_clear_since")

    def __init__(self, debounce_s: float, clear_hold_s: float) -> None:
        self.debounce_s = float(debounce_s)
        self.clear_hold_s = float(clear_hold_s)
        self.raised = False
        self.onset_ts: float | None = None     # when the condition of the current activation began
        self._onset: float | None = None
        self._clear_since: float | None = None

    def step(self, cond: bool | None, ts: float, *, frozen: bool = False,
             inhibit_raise: bool = False) -> Transition | None:
        """Advance with one sample. ``frozen`` holds the state (sensor unusable); returns a transition."""
        if frozen:
            self._onset = self._clear_since = None
            return None
        if not self.raised:
            if cond is not True:
                self._onset = None
                return None
            if self._onset is None:
                self._onset = ts
            if inhibit_raise or ts - self._onset < self.debounce_s - EPS_S:
                return None
            self.raised, self.onset_ts, self._onset, self._clear_since = True, self._onset, None, None
            return "raised"
        if cond is not False:
            self._clear_since = None
            return None
        if self._clear_since is None:
            self._clear_since = ts
        if ts - self._clear_since < self.clear_hold_s - EPS_S:
            return None
        self.raised, self._clear_since = False, None
        return "cleared"

    def rebase(self, ts: float) -> None:
        """Restart running timers at ``ts`` after the sample clock jumped backwards."""
        if self._onset is not None:
            self._onset = ts
        if self._clear_since is not None:
            self._clear_since = ts
