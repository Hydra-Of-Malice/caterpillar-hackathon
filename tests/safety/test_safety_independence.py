"""The safety layer must stay independent of ML, pipeline, alerts, APIs and cloud code.

Two checks: a static AST scan of every import in sentinel/safety (allow-list), and a runtime check
that importing the safety process does not transitively load any forbidden module.
"""
from __future__ import annotations

import ast
import json
import subprocess
import sys
from pathlib import Path

import pytest

from sentinel.shared.config import ROOT

SAFETY_DIR = ROOT / "sentinel" / "safety"
FORBIDDEN = ("sklearn", "lightgbm", "pandas", "numpy", "scipy", "statsmodels", "anthropic", "rank_bm25",
             "sentinel.pipeline", "sentinel.practice", "sentinel.alerts", "sentinel.edge_api", "sentinel.cloud",
             "sentinel.eta", "sentinel.sync", "sentinel.store", "sentinel.sim", "ml")
ALLOWED_THIRD_PARTY = ("pydantic", "yaml", "paho")
ALLOWED_INTERNAL = ("sentinel.safety", "sentinel.shared", "sentinel.bus")


def _under(module: str, roots: tuple[str, ...]) -> bool:
    return any(module == r or module.startswith(r + ".") for r in roots)


def _imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:                                   # relative import stays inside the package
                found.append("sentinel.safety" + (f".{node.module}" if node.module else ""))
            else:
                found.append(node.module or "")
    return found


SOURCES = sorted(SAFETY_DIR.rglob("*.py"))


def test_scan_covers_the_package() -> None:
    names = {p.name for p in SOURCES}
    assert {"__init__.py", "rules.py", "main.py", "health.py", "latch.py"} <= names


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: p.name)
def test_no_forbidden_or_unexpected_imports(path: Path) -> None:
    for module in _imports(path):
        assert not _under(module, FORBIDDEN), f"{path.name} imports forbidden {module}"
        top = module.split(".")[0]
        ok = (top in sys.stdlib_module_names or top in ALLOWED_THIRD_PARTY or top == "__future__"
              or _under(module, ALLOWED_INTERNAL))
        assert ok, f"{path.name} imports {module}, which is not on the safety allow-list"


def test_runtime_import_graph_is_ml_free() -> None:
    code = ("import json, sys; import sentinel.safety.main; "
            "print(json.dumps(sorted(sys.modules)))")
    res = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True, timeout=60,
                         check=True)
    loaded = json.loads(res.stdout.strip().splitlines()[-1])
    leaked = sorted(m for m in loaded if _under(m, FORBIDDEN))
    assert leaked == []
