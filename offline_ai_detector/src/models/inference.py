"""Inference response scaffolding for later phases."""

from __future__ import annotations


def format_inference_response(
    *,
    language: str,
    raw_score: float | None,
    calibrated_score: float | None,
    label: str,
    confidence_note: str,
) -> dict[str, object]:
    return {
        "language": language,
        "raw_score": raw_score,
        "calibrated_score": calibrated_score,
        "label": label,
        "confidence_note": confidence_note,
    }
