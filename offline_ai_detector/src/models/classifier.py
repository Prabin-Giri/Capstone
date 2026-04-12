"""Classifier selection notes for the M1-friendly baseline."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ClassifierSpec:
    model_name: str
    reason: str


def recommended_v1_classifier() -> ClassifierSpec:
    return ClassifierSpec(
        model_name="microsoft/codebert-base",
        reason=(
            "Reasonable starting point for code-aware encoding while still being "
            "small enough to evaluate on M1 hardware in staged runs."
        ),
    )
