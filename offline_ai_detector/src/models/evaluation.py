"""Evaluation scaffolding for later phases."""

from __future__ import annotations


def required_metric_names() -> list[str]:
    return [
        "accuracy",
        "precision",
        "recall",
        "f1",
        "confusion_matrix",
        "false_positive_rate",
        "false_negative_rate",
        "per_language_metrics",
    ]
