"""Evaluation helpers for the Phase 7/Phase 10 model reports."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

import numpy as np

from .dataset import approximate_code_token_count

LABEL_ID_TO_NAME = {0: "human", 1: "ai"}
PHASE10_LENGTH_BUCKETS: tuple[tuple[str, int, int | None], ...] = (
    ("0-79", 0, 79),
    ("80-159", 80, 159),
    ("160-319", 160, 319),
    ("320-639", 320, 639),
    ("640+", 640, None),
)
EDIT_KEYWORDS = ("edit", "rewrite", "refactor", "repair", "post-edit", "post_edit")
PARAPHRASE_KEYWORDS = ("paraphrase", "paraphrased")
HYBRID_KEYWORDS = ("hybrid", "mixed", "human+ai", "human_ai", "post_edit", "human_edit")


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


def build_prediction_rows(
    *,
    samples: Sequence[Any],
    logits: Sequence[Sequence[float]] | np.ndarray,
) -> list[dict[str, Any]]:
    """Create row-level prediction details used for Phase 10 analysis."""

    probabilities = logits_to_probabilities(logits)
    positive_scores = probabilities[:, 1]
    predictions = (positive_scores >= 0.5).astype(int)
    if len(samples) != len(predictions):
        raise ValueError(
            "Prediction length mismatch. "
            f"Received {len(samples)} samples and {len(predictions)} predictions."
        )

    rows: list[dict[str, Any]] = []
    for index, sample in enumerate(samples):
        label_id = _resolve_label_id(getattr(sample, "label", None))
        raw_score = float(positive_scores[index])
        rows.append(
            {
                "id": str(getattr(sample, "id", f"sample_{index}")),
                "language": str(getattr(sample, "language", "unknown")),
                "source_dataset": str(getattr(sample, "source_dataset", "unknown") or "unknown"),
                "problem_id": getattr(sample, "problem_id", None),
                "task_id": getattr(sample, "task_id", None),
                "generator_model": getattr(sample, "generator_model", None),
                "prompt_type": getattr(sample, "prompt_type", None),
                "edit_type": getattr(sample, "edit_type", None),
                "is_paraphrased": getattr(sample, "is_paraphrased", None),
                "notes": getattr(sample, "notes", None),
                "label_id": label_id,
                "label": LABEL_ID_TO_NAME[label_id],
                "predicted_label_id": int(predictions[index]),
                "predicted_label": LABEL_ID_TO_NAME[int(predictions[index])],
                "raw_ai_score": raw_score,
                "token_count": approximate_code_token_count(str(getattr(sample, "code", ""))),
                "code_preview": _render_code_preview(str(getattr(sample, "code", ""))),
            }
        )
    return rows


def compute_group_metrics(prediction_rows: Sequence[dict[str, Any]], group_key: str) -> dict[str, dict[str, Any]]:
    """Compute scalar metrics per source/language/other grouping key."""

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in prediction_rows:
        group_name = str(row.get(group_key, "unknown") or "unknown")
        grouped.setdefault(group_name, []).append(row)

    metrics_by_group: dict[str, dict[str, Any]] = {}
    for group_name in sorted(grouped):
        rows = grouped[group_name]
        labels = np.asarray([int(item["label_id"]) for item in rows], dtype=np.int64)
        predictions = np.asarray([int(item["predicted_label_id"]) for item in rows], dtype=np.int64)
        scores = np.asarray([float(item["raw_ai_score"]) for item in rows], dtype=np.float64)
        metrics = _compute_scalar_metrics(labels, predictions, scores)
        metrics["sample_count"] = int(len(rows))
        metrics["confusion_matrix"] = _compute_confusion_matrix(labels, predictions)
        metrics_by_group[group_name] = metrics
    return metrics_by_group


def compute_length_bucket_metrics(prediction_rows: Sequence[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Compute metrics over fixed token-count buckets."""

    rows_by_bucket: dict[str, list[dict[str, Any]]] = {name: [] for name, _, _ in PHASE10_LENGTH_BUCKETS}
    rows_by_bucket["unbucketed"] = []

    for row in prediction_rows:
        token_count = int(row.get("token_count", 0))
        bucket_name = _resolve_length_bucket_name(token_count)
        rows_by_bucket.setdefault(bucket_name, []).append(row)

    metrics_by_bucket: dict[str, dict[str, Any]] = {}
    for bucket_name, _, _ in PHASE10_LENGTH_BUCKETS:
        rows = rows_by_bucket.get(bucket_name, [])
        if not rows:
            continue
        labels = np.asarray([int(item["label_id"]) for item in rows], dtype=np.int64)
        predictions = np.asarray([int(item["predicted_label_id"]) for item in rows], dtype=np.int64)
        scores = np.asarray([float(item["raw_ai_score"]) for item in rows], dtype=np.float64)
        metrics = _compute_scalar_metrics(labels, predictions, scores)
        metrics["sample_count"] = int(len(rows))
        metrics["confusion_matrix"] = _compute_confusion_matrix(labels, predictions)
        metrics_by_bucket[bucket_name] = metrics

    unbucketed_rows = rows_by_bucket.get("unbucketed", [])
    if unbucketed_rows:
        labels = np.asarray([int(item["label_id"]) for item in unbucketed_rows], dtype=np.int64)
        predictions = np.asarray([int(item["predicted_label_id"]) for item in unbucketed_rows], dtype=np.int64)
        scores = np.asarray([float(item["raw_ai_score"]) for item in unbucketed_rows], dtype=np.float64)
        metrics = _compute_scalar_metrics(labels, predictions, scores)
        metrics["sample_count"] = int(len(unbucketed_rows))
        metrics["confusion_matrix"] = _compute_confusion_matrix(labels, predictions)
        metrics_by_bucket["unbucketed"] = metrics

    return metrics_by_bucket


def compute_robustness_slice_metrics(prediction_rows: Sequence[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Compute metrics for edited/paraphrased/hybrid stress-test slices."""

    slice_rows = {
        "paraphrased_ai": [row for row in prediction_rows if _is_paraphrased_ai(row)],
        "edited_ai": [row for row in prediction_rows if _is_edited_ai(row)],
        "hybrid_candidate": [row for row in prediction_rows if _is_hybrid_candidate(row)],
        "raw_ai_baseline": [row for row in prediction_rows if _is_raw_ai_baseline(row)],
    }
    metrics_by_slice: dict[str, dict[str, Any]] = {}
    for slice_name in sorted(slice_rows):
        rows = slice_rows[slice_name]
        if not rows:
            continue
        labels = np.asarray([int(item["label_id"]) for item in rows], dtype=np.int64)
        predictions = np.asarray([int(item["predicted_label_id"]) for item in rows], dtype=np.int64)
        scores = np.asarray([float(item["raw_ai_score"]) for item in rows], dtype=np.float64)
        metrics = _compute_scalar_metrics(labels, predictions, scores)
        metrics["sample_count"] = int(len(rows))
        metrics["confusion_matrix"] = _compute_confusion_matrix(labels, predictions)
        metrics_by_slice[slice_name] = metrics
    return metrics_by_slice


def collect_error_examples(
    prediction_rows: Sequence[dict[str, Any]],
    *,
    error_type: str,
    max_examples: int = 5,
) -> list[dict[str, Any]]:
    """Return top misclassification examples for report inspection."""

    if max_examples <= 0:
        return []
    if error_type not in {"false_positive", "false_negative"}:
        raise ValueError(f"Unsupported error_type: {error_type}")

    if error_type == "false_positive":
        matches = [
            row
            for row in prediction_rows
            if int(row["label_id"]) == 0 and int(row["predicted_label_id"]) == 1
        ]
        ordered = sorted(matches, key=lambda row: float(row["raw_ai_score"]), reverse=True)
    else:
        matches = [
            row
            for row in prediction_rows
            if int(row["label_id"]) == 1 and int(row["predicted_label_id"]) == 0
        ]
        ordered = sorted(matches, key=lambda row: float(row["raw_ai_score"]))

    return [
        {
            "id": str(row["id"]),
            "language": str(row["language"]),
            "source_dataset": str(row["source_dataset"]),
            "token_count": int(row["token_count"]),
            "raw_ai_score": float(row["raw_ai_score"]),
            "code_preview": str(row["code_preview"]),
        }
        for row in ordered[:max_examples]
    ]


def build_phase10_evaluation_report(
    *,
    split_name: str,
    metrics: dict[str, Any],
    prediction_rows: Sequence[dict[str, Any]],
    max_error_examples: int = 5,
) -> tuple[str, dict[str, Any]]:
    """Build the Phase 10 markdown report and JSON summary payload."""

    per_source_metrics = compute_group_metrics(prediction_rows, "source_dataset")
    length_bucket_metrics = compute_length_bucket_metrics(prediction_rows)
    robustness_slice_metrics = compute_robustness_slice_metrics(prediction_rows)
    false_positive_examples = collect_error_examples(
        prediction_rows,
        error_type="false_positive",
        max_examples=max_error_examples,
    )
    false_negative_examples = collect_error_examples(
        prediction_rows,
        error_type="false_negative",
        max_examples=max_error_examples,
    )
    limitations = [
        "Predictions can still reflect dataset-source artifacts rather than true authorship signals.",
        "Length and formatting cues can become shortcuts if source balancing drifts over time.",
        "A static threshold band can become stale as assignment types and prompting styles evolve.",
        "This detector is a triage signal and cannot establish intent or academic misconduct by itself.",
    ]
    next_step_recommendations = [
        "Expand held-out evaluation on edited/paraphrased AI code and mixed human-AI drafts.",
        "Track calibration drift each semester and retune thresholds on fresh validation data.",
        "Compare one joint model against language-specific heads for Python and Java.",
        "Add structural AST-based features as optional explainability signals in v2.",
    ]

    report_lines = [
        "# Phase 10 Evaluation Report",
        "",
        f"- Split evaluated: `{split_name}`",
        f"- Sample count: {metrics.get('sample_count', len(prediction_rows))}",
        "",
        "## Overall metrics",
        "",
        f"- Accuracy: {_format_metric(metrics.get('accuracy'))}",
        f"- Precision: {_format_metric(metrics.get('precision'))}",
        f"- Recall: {_format_metric(metrics.get('recall'))}",
        f"- F1: {_format_metric(metrics.get('f1'))}",
        f"- ROC-AUC: {_format_metric(metrics.get('roc_auc'))}",
        f"- False positive rate: {_format_metric(metrics.get('false_positive_rate'))}",
        f"- False negative rate: {_format_metric(metrics.get('false_negative_rate'))}",
        f"- Confusion matrix: {metrics.get('confusion_matrix')}",
        "",
    ]
    report_lines.extend(
        _render_group_metrics_table(
            title="Per-language metrics",
            group_metrics=metrics.get("per_language_metrics", {}),
        )
    )
    report_lines.extend(
        _render_group_metrics_table(
            title="Performance by source dataset",
            group_metrics=per_source_metrics,
        )
    )
    report_lines.extend(
        _render_group_metrics_table(
            title="Performance by code length bucket",
            group_metrics=length_bucket_metrics,
        )
    )
    report_lines.extend(
        _render_group_metrics_table(
            title="Robustness slices (paraphrased/edited/hybrid)",
            group_metrics=robustness_slice_metrics,
        )
    )
    report_lines.extend(
        _render_error_table(
            title="False-positive examples (human predicted as AI)",
            examples=false_positive_examples,
        )
    )
    report_lines.extend(
        _render_error_table(
            title="False-negative examples (AI predicted as human)",
            examples=false_negative_examples,
        )
    )
    report_lines.extend(
        [
            "## Limitations",
            "",
            *[f"- {line}" for line in limitations],
            "",
            "## Next-step recommendations",
            "",
            *[f"- {line}" for line in next_step_recommendations],
            "",
        ]
    )
    report_text = "\n".join(report_lines).rstrip() + "\n"

    summary_payload = {
        "split_name": split_name,
        "overall_metrics": {
            "sample_count": metrics.get("sample_count", len(prediction_rows)),
            "accuracy": metrics.get("accuracy"),
            "precision": metrics.get("precision"),
            "recall": metrics.get("recall"),
            "f1": metrics.get("f1"),
            "roc_auc": metrics.get("roc_auc"),
            "false_positive_rate": metrics.get("false_positive_rate"),
            "false_negative_rate": metrics.get("false_negative_rate"),
            "confusion_matrix": metrics.get("confusion_matrix"),
        },
        "per_language_metrics": metrics.get("per_language_metrics", {}),
        "per_source_metrics": per_source_metrics,
        "length_bucket_metrics": length_bucket_metrics,
        "robustness_slice_metrics": robustness_slice_metrics,
        "false_positive_examples": false_positive_examples,
        "false_negative_examples": false_negative_examples,
        "limitations": limitations,
        "next_step_recommendations": next_step_recommendations,
    }
    return report_text, summary_payload


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


def _render_group_metrics_table(*, title: str, group_metrics: dict[str, dict[str, Any]]) -> list[str]:
    lines = [f"## {title}", ""]
    if not group_metrics:
        lines.extend(["No rows available for this section.", ""])
        return lines

    lines.extend(
        [
            "| Group | Samples | Accuracy | Precision | Recall | F1 | FPR | FNR | ROC-AUC |",
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for group_name in sorted(group_metrics):
        metrics = group_metrics[group_name]
        lines.append(
            f"| `{_escape_cell(group_name)}` | {int(metrics.get('sample_count', 0))} | "
            f"{_format_metric(metrics.get('accuracy'))} | "
            f"{_format_metric(metrics.get('precision'))} | "
            f"{_format_metric(metrics.get('recall'))} | "
            f"{_format_metric(metrics.get('f1'))} | "
            f"{_format_metric(metrics.get('false_positive_rate'))} | "
            f"{_format_metric(metrics.get('false_negative_rate'))} | "
            f"{_format_metric(metrics.get('roc_auc'))} |"
        )
    lines.append("")
    return lines


def _render_error_table(*, title: str, examples: Sequence[dict[str, Any]]) -> list[str]:
    lines = [f"## {title}", ""]
    if not examples:
        lines.extend(["No examples in this category for the evaluated split.", ""])
        return lines

    lines.extend(
        [
            "| Sample ID | Language | Source | Tokens | Raw AI score | Code preview |",
            "|---|---|---|---:|---:|---|",
        ]
    )
    for example in examples:
        lines.append(
            f"| `{_escape_cell(str(example['id']))}` | `{_escape_cell(str(example['language']))}` | "
            f"`{_escape_cell(str(example['source_dataset']))}` | {int(example['token_count'])} | "
            f"{_format_metric(example['raw_ai_score'])} | `{_escape_cell(str(example['code_preview']))}` |"
        )
    lines.append("")
    return lines


def _resolve_length_bucket_name(token_count: int) -> str:
    for bucket_name, lower, upper in PHASE10_LENGTH_BUCKETS:
        if token_count < lower:
            continue
        if upper is None or token_count <= upper:
            return bucket_name
    return "unbucketed"


def _resolve_label_id(value: Any) -> int:
    if isinstance(value, int):
        if value in LABEL_ID_TO_NAME:
            return value
        raise ValueError(f"Unsupported integer label value: {value}")

    normalized = str(value).strip().lower()
    if normalized in {"human", "0"}:
        return 0
    if normalized in {"ai", "1"}:
        return 1
    raise ValueError(f"Unsupported label value: {value!r}")


def _render_code_preview(code: str, max_chars: int = 120) -> str:
    collapsed = " ".join(code.strip().split())
    if not collapsed:
        return "<empty>"
    if len(collapsed) <= max_chars:
        return collapsed
    return collapsed[: max_chars - 3] + "..."


def _is_paraphrased_ai(row: dict[str, Any]) -> bool:
    if int(row.get("label_id", -1)) != 1:
        return False
    if row.get("is_paraphrased") is True:
        return True
    text_candidates = [row.get("edit_type"), row.get("prompt_type"), row.get("notes")]
    return _contains_keyword(text_candidates, PARAPHRASE_KEYWORDS)


def _is_edited_ai(row: dict[str, Any]) -> bool:
    if int(row.get("label_id", -1)) != 1:
        return False
    text_candidates = [row.get("edit_type"), row.get("prompt_type"), row.get("notes")]
    return _contains_keyword(text_candidates, EDIT_KEYWORDS) or _is_paraphrased_ai(row)


def _is_hybrid_candidate(row: dict[str, Any]) -> bool:
    text_candidates = [
        row.get("source_dataset"),
        row.get("edit_type"),
        row.get("prompt_type"),
        row.get("notes"),
    ]
    return _contains_keyword(text_candidates, HYBRID_KEYWORDS)


def _is_raw_ai_baseline(row: dict[str, Any]) -> bool:
    if int(row.get("label_id", -1)) != 1:
        return False
    return not _is_edited_ai(row) and not _is_hybrid_candidate(row)


def _contains_keyword(values: Sequence[Any], keywords: Sequence[str]) -> bool:
    haystacks = [str(value).lower() for value in values if value is not None]
    for haystack in haystacks:
        for keyword in keywords:
            if keyword in haystack:
                return True
    return False


def _safe_rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return float(numerator / denominator)


def _format_metric(value: Any) -> str:
    if value is None:
        return "n/a"
    return f"{float(value):.4f}"


def _escape_cell(value: str) -> str:
    return value.replace("|", "\\|")
