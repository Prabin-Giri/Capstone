"""Inference-facing score interpretation and single-sample inference engine.

Phase 8 added the abstain band and conservative confidence wording.
Phase 9 adds run_single_inference(), which wires together:
  - artifact validation
  - tokenization
  - model forward pass
  - calibration
  - abstain-band decision
  - feature summary (optional)
  - conservative output formatting

Design rules carried from the project context:
  - never output overconfident yes/no claims
  - always expose both raw and calibrated scores
  - always warn on short code
  - always warn when code is truncated
  - use wording that frames results as signals, not proof
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


LIKELY_HUMAN = "likely human"
LIKELY_AI = "likely AI-written"
UNCLEAR = "unclear"

# Minimum token-ish count below which confidence notes are surfaced.
_SHORT_SAMPLE_THRESHOLD = 30


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
    features: dict[str, float] | None = None,
    feature_notes: list[str] | None = None,
    truncated: bool = False,
) -> dict[str, object]:
    payload: dict[str, Any] = {
        "language": language,
        "raw_score": raw_score,
        "calibrated_score": calibrated_score,
        "score_used": score_used,
        "label": label,
        "confidence_note": confidence_note,
    }
    if truncated:
        payload["truncation_warning"] = (
            "The input code was longer than the model's maximum sequence length and was truncated. "
            "The score reflects only the beginning of the submission."
        )
    if thresholds is not None:
        payload["thresholds"] = thresholds
    if explanation is not None:
        payload["explanation"] = explanation
    if features is not None:
        payload["features"] = features
    if feature_notes:
        payload["feature_notes"] = feature_notes
    return payload


# ---------------------------------------------------------------------------
# Phase 9 inference engine
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class InferenceResult:
    """Full result bundle returned by run_single_inference."""

    language: str
    raw_score: float | None
    calibrated_score: float | None
    label: str
    confidence_note: str
    score_used: float | None
    thresholds: dict[str, float]
    truncated: bool
    token_count: int
    features: dict[str, float] | None
    feature_notes: list[str] | None

    def to_response_dict(self) -> dict[str, Any]:
        return format_inference_response(
            language=self.language,
            raw_score=self.raw_score,
            calibrated_score=self.calibrated_score,
            label=self.label,
            confidence_note=self.confidence_note,
            score_used=self.score_used,
            thresholds=self.thresholds,
            truncated=self.truncated,
            features=self.features,
            feature_notes=self.feature_notes,
        )


def validate_inference_artifacts(
    model_dir: Path,
    calibration_path: Path | None,
) -> None:
    """Fail loudly if the model checkpoint or calibration artifact is missing.

    Raises FileNotFoundError with a descriptive message so the user knows
    exactly which artifact is absent before torch is even imported.
    """
    config_file = model_dir / "config.json"
    if not config_file.exists():
        raise FileNotFoundError(
            f"No model checkpoint found at: {model_dir}\n"
            "Run `python scripts/train_model.py` first to produce a fine-tuned checkpoint."
        )
    if calibration_path is not None and not calibration_path.exists():
        raise FileNotFoundError(
            f"No calibration artifact found at: {calibration_path}\n"
            "Run `python scripts/calibrate_model.py` first, or set calibration_path to null in inference.yaml."
        )


def _detect_language_from_extension(file_path: Path) -> str | None:
    """Return a normalized language string from a file extension, or None."""
    ext = file_path.suffix.lower()
    mapping = {
        ".py": "python",
        ".java": "java",
    }
    return mapping.get(ext)


def _load_calibration(calibration_path: Path) -> dict[str, Any]:
    return json.loads(calibration_path.read_text(encoding="utf-8"))


def _raw_logits_for_single(
    *,
    code: str,
    tokenizer: Any,
    model: Any,
    max_length: int,
) -> tuple[list[float], bool]:
    """Run a single forward pass and return (logits, was_truncated).

    Returns logits as a plain Python list so callers do not need torch imported
    at the call site.
    """
    try:
        import torch
    except ImportError as exc:
        raise ImportError(
            "torch is required for inference. Install requirements.txt first."
        ) from exc

    encoding = tokenizer(
        code,
        return_tensors="pt",
        max_length=max_length,
        truncation=True,
        padding=False,
    )
    # Check if the un-truncated token count would exceed max_length.
    # We do a second call without truncation just to measure length, which
    # is cheap because it is tokenizer-only (no model forward).
    full_encoding = tokenizer(code, truncation=False, padding=False)
    truncated = len(full_encoding["input_ids"]) > max_length

    model.eval()
    with torch.no_grad():
        outputs = model(**encoding)
    logits = outputs.logits[0].cpu().tolist()
    return logits, truncated


def _logits_to_raw_score(logits: list[float]) -> float:
    """Softmax over binary logits -> positive-class probability."""
    import math
    max_logit = max(logits)
    exp_vals = [math.exp(v - max_logit) for v in logits]
    total = sum(exp_vals)
    return exp_vals[1] / total  # index 1 = AI class


def _apply_calibration_to_score(
    logits: list[float],
    calibration: dict[str, Any],
) -> float:
    """Apply temperature or Platt scaling to a single-sample logit pair."""
    import math

    method = str(calibration["method"]).lower()
    params = calibration["parameters"]

    if method == "temperature_scaling":
        temperature = max(float(params["temperature"]), 1e-3)
        scaled = [v / temperature for v in logits]
        max_s = max(scaled)
        exp_vals = [math.exp(v - max_s) for v in scaled]
        return exp_vals[1] / sum(exp_vals)

    if method == "platt_scaling":
        coef = float(params["coef"])
        intercept = float(params["intercept"])
        # margin = logit[1] - logit[0]
        margin = logits[1] - logits[0]
        z = coef * margin + intercept
        return 1.0 / (1.0 + math.exp(-z))

    raise ValueError(f"Unsupported calibration method in artifact: {method}")


def run_single_inference(
    *,
    code: str,
    language: str,
    model_dir: Path,
    calibration_path: Path | None,
    lower_threshold: float,
    upper_threshold: float,
    max_length: int = 256,
    min_tokens: int = 50,
    local_files_only: bool = False,
    include_features: bool = False,
    include_structural_features: bool = False,
) -> InferenceResult:
    """Run the full inference pipeline for a single code submission.

    Steps
    -----
    1. Load the fine-tuned checkpoint (lazy import keeps startup light).
    2. Tokenize and forward pass → raw logits.
    3. Convert logits → raw probability (softmax positive class).
    4. Apply calibration if an artifact exists → calibrated probability.
    5. Compute abstain-band decision using calibrated (or raw) score.
    6. Optionally extract lightweight code features.
    7. Return InferenceResult with all components for the CLI to format.
    """
    from .classifier import load_saved_tokenizer_and_model

    tokenizer, model = load_saved_tokenizer_and_model(
        model_dir,
        local_files_only=local_files_only,
    )

    logits, truncated = _raw_logits_for_single(
        code=code,
        tokenizer=tokenizer,
        model=model,
        max_length=max_length,
    )
    raw_score = _logits_to_raw_score(logits)

    calibrated_score: float | None = None
    calibration_data: dict[str, Any] | None = None
    if calibration_path is not None and calibration_path.exists():
        calibration_data = _load_calibration(calibration_path)
        calibrated_score = _apply_calibration_to_score(logits, calibration_data)

    score_for_banding = calibrated_score if calibrated_score is not None else raw_score
    score_name = "calibrated score" if calibrated_score is not None else "raw score"

    # Rough token count from the feature extractor (cheap, no model pass needed)
    from ..features.code_features import extract_code_features, feature_risk_notes
    feature_dict = extract_code_features(
        code,
        language=language,
        include_structural=include_structural_features,
    )
    token_count_approx = int(feature_dict.get("token_count", 0))

    decision = decide_score_band(
        score=score_for_banding,
        lower=lower_threshold,
        upper=upper_threshold,
        min_tokens=min_tokens,
        token_count=token_count_approx,
        score_name=score_name,
    )

    features: dict[str, float] | None = None
    notes: list[str] | None = None
    if include_features:
        features = feature_dict
        notes = feature_risk_notes(feature_dict) or None

    return InferenceResult(
        language=language,
        raw_score=raw_score,
        calibrated_score=calibrated_score,
        label=decision.label,
        confidence_note=decision.confidence_note,
        score_used=decision.score_used,
        thresholds={"lower": lower_threshold, "upper": upper_threshold},
        truncated=truncated,
        token_count=token_count_approx,
        features=features,
        feature_notes=notes,
    )
