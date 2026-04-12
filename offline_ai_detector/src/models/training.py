"""Training scaffolding for later phases."""

from __future__ import annotations


def training_plan_notes() -> list[str]:
    return [
        "Start with a 1-epoch smoke test before longer runs.",
        "Prefer small batch sizes and gradient accumulation on M1.",
        "Resume-from-checkpoint support should be added before long runs.",
    ]
