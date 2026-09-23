"""Independent deterministic critical-safety advisory layer.

Runs as its own process (``python -m sentinel.safety.main``). It depends only on the standard
library, pydantic, PyYAML, the bus client and ``sentinel.shared`` — never on ML, pipeline,
alerts, APIs or cloud code (enforced by tests/safety/test_safety_independence.py).
"""
from sentinel.safety.rules import RuleEngine

__all__ = ["RuleEngine"]
