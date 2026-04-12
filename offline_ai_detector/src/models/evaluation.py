"""Evaluation helpers for the Phase 7 baseline classifier."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

import numpy as np


def required_metric_names() -> list[str]:
    return [
        "accuracy",
        "precision",
        "recall",
        "f1",
        "roc_auc",
        "confusion_matrix",
        "false_positive_rate",
        "false_negative_rate",
        "per_language_metrics",
    ]


@dataclass(slots=True)
class SplitEvaluation:
    split_name: str
    metrics: dict[str, Any]


def logits_to_probabilities(logits: Sequence[Sequence[float]] | np.ndarray) -> np.ndarray:
    """Convert binary-class logits to class probabilities with a stable softmax."""

    array = np.asarray(logits, dtype=np.float64)
    if array.ndim != 2 or array.shape[1] < 2:
        raise ValueError(f"Expected 2D logits with at least 2 columns, got shape {array.shape}")
    shifted = array - np.max(array, axis=1, keepdims=True)
    exp = np.exp(shifted)
    return exp / np.sum(exp, axis=1, keepdims=True)


def compute_trainer_selection_metrics(eval_prediction: Any) -> dict[str, float]:
    """Small metric set for checkpoint selection during training."""

    if hasattr(eval_prediction, "predictions") and hasattr(eval_prediction, "label_ids"):
        logits = eval_prediction.predictions
        label_ids = eval_prediction.label_ids
    else:
        logits, label_ids = eval_prediction
    probabilities = logits_to_probabilities(logits)
    positive_scores = probabilities[:, 1]
    predictions = (positive_scores >= 0.5).astype(int)
    return _compute_scalar_metrics(np.asarray(label_ids), predictions, positive_scores)


def compute_classification_metrics(
    *,
    labels: Sequence[int],
    logits: Sequence[Sequence[float]] | np.ndarray,
    languages: Sequence[str],
    loss: float | None = None,
) -> dict[str, Any]:
    """Compute overall and per-language metrics for a model split.

    We keep language-specific reporting here because a single headline F1 can
    hide that Python performs well while Java does not, or vice versa.
    """

    labels_array = np.asarray(labels, dtype=np.int64)
    probabilities = logits_to_probabilities(logits)
    positive_scores = probabilities[:, 1]
    predictions = (positive_scores >= 0.5).astype(int)

    metrics = _compute_scalar_metrics(labels_array, predictions, positive_scores)
    metrics["confusion_matrix"] = _compute_confusion_matrix(labels_array, predictions)
    metrics["per_language_metrics"] = {}
    metrics["sample_count"] = int(len(labels_array))
    if loss is not None:
        metrics["loss"] = float(loss)

    for language in sorted(set(languages)):
        indices = [index for index, item in enumerate(languages) if item == language]
        language_labels = labels_array[indices]
        language_predictions = predictions[indices]
        language_scores = positive_scores[indices]
        per_language = _compute_scalar_metrics(language_labels, language_predictions, language_scores)
        per_language["confusion_matrix"] = _compute_confusion_matrix(language_labels, language_predictions)
        per_language["sample_count"] = int(len(indices))
        metrics["per_language_metrics"][language] = per_language

    return metrics


def render_evaluation_markdown(split_results: Sequence[SplitEvaluation]) -> str:
    lines = ["# Phase 7 Evaluation Report", ""]
    for result in split_results:
        metrics = result.metrics
        lines.extend(
            [
                f"## {result.split_name.title()}",
                "",
                f"- Samples: {metrics.get('sample_count', 0)}",
                f"- Accuracy: {_format_metric(metrics.get('accuracy'))}",
                f"- Precision: {_format_metric(metrics.get('precision'))}",
                f"- Recall: {_format_metric(metrics.get('recall'))}",
                f"- F1: {_format_metric(metrics.get('f1'))}",
                f"- ROC-AUC: {_format_metric(metrics.get('roc_auc'))}",
                f"- False positive rate: {_format_metric(metrics.get('false_positive_rate'))}",
                f"- False negative rate: {_format_metric(metrics.get('false_negative_rate'))}",
                f"- Confusion matrix: {metrics.get('confusion_matrix')}",
                "",
                "### Per-language metrics",
                "",
            ]
        )
        per_language = metrics.get("per_language_metrics", {})
        for language, language_metrics in per_language.items():
            lines.append(
                f"- {language}: F1={_format_metric(language_metrics.get('f1'))}, "
                f"precision={_format_metric(language_metrics.get('precision'))}, "
                f"recall={_format_metric(language_metrics.get('recall'))}, "
                f"FPR={_format_metric(language_metrics.get('false_positive_rate'))}, "
                f"FNR={_format_metric(language_metrics.get('false_negative_rate'))}"
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _compute_scalar_metrics(
    labels: np.ndarray,
    predictions: np.ndarray,
    positive_scores: np.ndarray,
) -> dict[str, float | None]:
    precision, recall, f1, accuracy, roc_auc = _sklearn_scalar_metrics(labels, predictions, positive_scores)
    confusion = _compute_confusion_matrix(labels, predictions)
    tn, fp = confusion[0]
    fn, tp = confusion[1]
    false_positive_rate = _safe_rate(fp, fp + tn)
    false_negative_rate = _safe_rate(fn, fn + tp)

    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "roc_auc": roc_auc,
        "false_positive_rate": false_positive_rate,
        "false_negative_rate": false_negative_rate,
    }


def _sklearn_scalar_metrics(
    labels: np.ndarray,
    predictions: np.ndarray,
    positive_scores: np.ndarray,
) -> tuple[float, float, float, float, float | None]:
    try:
        from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
    except ImportError as exc:  # pragma: no cover - depends on local environment.
        raise ImportError(
            "scikit-learn is required for evaluation metrics. "
            "Install the dependencies from offline_ai_detector/requirements.txt first."
        ) from exc

    accuracy = float(accuracy_score(labels, predictions))
    precision = float(precision_score(labels, predictions, zero_division=0))
    recall = float(recall_score(labels, predictions, zero_division=0))
    f1 = float(f1_score(labels, predictions, zero_division=0))
    roc_auc = None
    if len(np.unique(labels)) > 1:
        roc_auc = float(roc_auc_score(labels, positive_scores))
    return precision, recall, f1, accuracy, roc_auc


def _compute_confusion_matrix(labels: np.ndarray, predictions: np.ndarray) -> list[list[int]]:
    tn = int(np.sum((labels == 0) & (predictions == 0)))
    fp = int(np.sum((labels == 0) & (predictions == 1)))
    fn = int(np.sum((labels == 1) & (predictions == 0)))
    tp = int(np.sum((labels == 1) & (predictions == 1)))
    return [[tn, fp], [fn, tp]]


def _safe_rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return float(numerator / denominator)


def _format_metric(value: Any) -> str:
    if value is None:
        return "n/a"
    return f"{float(value):.4f}"
