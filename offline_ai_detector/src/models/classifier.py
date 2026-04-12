"""Classifier selection and loading helpers for the M1-friendly baseline."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..config import ModelConfig


@dataclass(slots=True)
class ClassifierSpec:
    model_name: str
    reason: str
    recommended_max_length: int = 256


def recommended_v1_classifier() -> ClassifierSpec:
    return ClassifierSpec(
        model_name="microsoft/codebert-base",
        reason=(
            "A compact code-aware encoder that is a practical first baseline for "
            "Python and Java student submissions without jumping to a much heavier LLM."
        ),
    )


def resolve_classifier_spec(model_name: str | None = None) -> ClassifierSpec:
    """Return the explicit classifier choice for the current phase."""

    default = recommended_v1_classifier()
    if model_name is None or model_name == default.model_name:
        return default
    return ClassifierSpec(
        model_name=model_name,
        reason=(
            "Using a config override instead of the default baseline. Keep an eye on "
            "memory pressure and make sure comparisons remain fair."
        ),
    )


def load_tokenizer_and_model(model_config: "ModelConfig", *, num_labels: int = 2) -> tuple[Any, Any]:
    """Load the tokenizer and classifier lazily so imports stay lightweight."""

    try:
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
    except ImportError as exc:  # pragma: no cover - depends on local environment.
        raise ImportError(
            "transformers is required for Phase 7 training. "
            "Install the dependencies from offline_ai_detector/requirements.txt first."
        ) from exc

    tokenizer = AutoTokenizer.from_pretrained(
        model_config.model_name,
        local_files_only=model_config.local_files_only,
        use_fast=True,
    )
    model = AutoModelForSequenceClassification.from_pretrained(
        model_config.model_name,
        local_files_only=model_config.local_files_only,
        num_labels=num_labels,
    )
    return tokenizer, model


def load_saved_tokenizer_and_model(model_dir: str | Path, *, local_files_only: bool = False) -> tuple[Any, Any]:
    """Load a previously saved fine-tuned checkpoint for evaluation or inference."""

    try:
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
    except ImportError as exc:  # pragma: no cover - depends on local environment.
        raise ImportError(
            "transformers is required to load a saved detector checkpoint."
        ) from exc

    checkpoint_dir = Path(model_dir)
    if not checkpoint_dir.exists():
        raise FileNotFoundError(f"Saved model directory not found: {checkpoint_dir}")

    tokenizer = AutoTokenizer.from_pretrained(checkpoint_dir, local_files_only=local_files_only, use_fast=True)
    model = AutoModelForSequenceClassification.from_pretrained(checkpoint_dir, local_files_only=local_files_only)
    return tokenizer, model
