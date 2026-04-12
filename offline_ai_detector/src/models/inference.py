"""Inference-facing score interpretation helpers.

Phase 8 adds the abstain band and careful confidence wording so later CLI
inference can present detector output as a conservative risk score rather than
as proof of AI authorship.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


LIKELY_HUMAN = "likely human"
LIKELY_AI = "likely AI-written"
UNCLEAR = "unclear"


@dataclass(slots=True)
class ScoreBandDecision:
    label: str
    score_used: float | None
    confidence_note: str


def decide_score_band(
    *,
    score: float | None,
    lower: float,
    upper: float,
    min_tokens: int | None = None,
    token_count: int | None = None,
    score_name: str = "score",
) -> ScoreBandDecision:
    """Map a probability-like score into a conservative three-band label.

    Values exactly on the thresholds remain in the unclear region. This keeps
    the boundary behavior intentionally cautious.
    """

    if score is None:
        return ScoreBandDecision(
            label=UNCLEAR,
            score_used=None,
            confidence_note="No usable score was available, so the detector abstained.",
        )

    short_sample_warning = ""
    if min_tokens is not None and token_count is not None and token_count < min_tokens:
        short_sample_warning = (
            f" Confidence is reduced because the sample has only {token_count} token-ish units, "
            f"below the recommended minimum of {min_tokens}."
        )

    if score < lower:
        return ScoreBandDecision(
            label=LIKELY_HUMAN,
            score_used=score,
            confidence_note=(
                f"The {score_name} fell below the lower threshold ({lower:.2f}), so this code is more "
                f"consistent with human-written submissions than with the AI class used in training."
                f"{short_sample_warning}"
            ),
        )
    if score > upper:
        return ScoreBandDecision(
            label=LIKELY_AI,
            score_used=score,
            confidence_note=(
                f"The {score_name} exceeded the upper threshold ({upper:.2f}), so this code is more "
                f"consistent with AI-written samples from the training set. This is a review signal, not proof."
                f"{short_sample_warning}"
            ),
        )
    return ScoreBandDecision(
        label=UNCLEAR,
        score_used=score,
        confidence_note=(
            f"The {score_name} landed inside the abstain band ({lower:.2f} to {upper:.2f}), so the detector "
            f"does not have enough separation to make a confident call.{short_sample_warning}"
        ),
    )


def format_inference_response(
    *,
    language: str,
    raw_score: float | None,
    calibrated_score: float | None,
    label: str,
    confidence_note: str,
    score_used: float | None = None,
    thresholds: dict[str, float] | None = None,
    explanation: str | None = None,
) -> dict[str, object]:
    payload: dict[str, Any] = {
        "language": language,
        "raw_score": raw_score,
        "calibrated_score": calibrated_score,
        "score_used": score_used,
        "label": label,
        "confidence_note": confidence_note,
    }
    if thresholds is not None:
        payload["thresholds"] = thresholds
    if explanation is not None:
        payload["explanation"] = explanation
    return payload
