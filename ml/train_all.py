"""Train every CAT Sentinel model in dependency order.

    .venv\\Scripts\\python -m ml.train_all [--skip-datasets]

1. Simulated datasets (data/sim/*.parquet)       — sentinel.sim.datasets
2. Unusual-operation detector (Isolation Forest)  — ml.train_iforest
3. Task-time model (LightGBM quantile + CQR)      — ml.train_tasktime
4. Expert Motion Model (practice analyser)        — ml.train_expert_model

All training data is SIMULATED; model cards say so.
"""
from __future__ import annotations

import argparse
import importlib
import time


def _run(module: str, fn: str = "main") -> None:
    t0 = time.perf_counter()
    print(f"\n=== {module}.{fn}() ===", flush=True)
    getattr(importlib.import_module(module), fn)()
    print(f"=== {module} done in {time.perf_counter() - t0:.1f}s ===", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-datasets", action="store_true", help="reuse existing data/sim/*.parquet")
    args = ap.parse_args()
    if not args.skip_datasets:
        _run("sentinel.sim.datasets")
    for module in ("ml.train_iforest", "ml.train_tasktime", "ml.train_expert_model"):
        _run(module)


if __name__ == "__main__":
    main()
