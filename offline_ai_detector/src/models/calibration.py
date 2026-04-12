"""Calibration helpers for the offline code detector.

Calibration is intentionally a separate validation-time step. Raw classifier
probabilities are often miscalibrated, and tuning thresholds directly on raw
scores can make the detector look more certain than it really is.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import TYPE_CHECKING, Any, Sequence

import numpy as np

from ..utils.io import write_text
from ..utils.seed import seed_everything
from .dataset import TokenizedCodeDataset, load_code_samples
from .evaluation import logits_to_probabilities

if TYPE_CHECKING:
    from ..config import TrainConfig


def supported_calibration_methods() -> tuple[str, ...]:
    return ("temperature_scaling", "platt_scaling")


@dataclass(slots=True)
class CalibrationArtifact:
    method: str
    parameters: dict[str, float]
    validation_metrics_raw: dict[str, Any]
    validation_metrics_calibrated: dict[str, Any]
    threshold_recommendation: dict[str, float]
    threshold_sweep: list[dict[str, float | int]]
    calibration_diagnostics: dict[str, float | None]


@dataclass(slots=True)
class CalibrationRunArtifacts:
    calibration_path: Path
    report_path: Path
    artifact: CalibrationArtifact
    test_metrics_raw: dict[str, Any]
    test_metrics_calibrated: dict[str, Any]
    test_band_metrics: dict[str, Any]


def run_calibration(config: "TrainConfig") -> CalibrationRunArtifacts:
    """Fit a calibrator on validation data and save a reusable artifact."""

    from .classifier import load_saved_tokenizer_and_model

    trainer_module = _require_transformers()
    seed_everything(config.project.random_seed)
    config.outputs.model_dir.mkdir(parents=True, exist_ok=True)
    config.outputs.report_dir.mkdir(parents=True, exist_ok=True)

    validation_samples = load_code_samples(
        config.data.validation_path,
        code_column=config.data.code_column,
        label_column=config.data.label_column,
        language_column=config.data.language_column,
        source_dataset_column=config.data.source_dataset_column,
        min_tokens=config.data.min_tokens,
        language_allowlist=config.data.language_allowlist,
    )
    test_samples = load_code_samples(
        config.data.test_path,
        code_column=config.data.code_column,
        label_column=config.data.label_column,
        language_column=config.data.language_column,
        source_dataset_column=config.data.source_dataset_column,
        min_tokens=config.data.min_tokens,
        language_allowlist=config.data.language_allowlist,
    )

    tokenizer, model = load_saved_tokenizer_and_model(
        config.outputs.model_dir,
        local_files_only=config.model.local_files_only,
    )

    validation_logits = _predict_logits(
        trainer_module=trainer_module,
        model=model,
        tokenizer=tokenizer,
        samples=validation_samples,
        max_length=config.model.max_length,
        batch_size=config.model.batch_size,
    )
    test_logits = _predict_logits(
        trainer_module=trainer_module,
        model=model,
        tokenizer=tokenizer,
        samples=test_samples,
        max_length=config.model.max_length,
        batch_size=config.model.batch_size,
    )

    validation_labels = np.asarray([0 if sample.label == "human" else 1 for sample in validation_samples], dtype=np.int64)
    test_labels = np.asarray([0 if sample.label == "human" else 1 for sample in test_samples], dtype=np.int64)
    validation_languages = [sample.language for sample in validation_samples]
    test_languages = [sample.language for sample in test_samples]

    raw_validation_scores = positive_class_scores(validation_logits)
    raw_test_scores = positive_class_scores(test_logits)

    calibrator = fit_calibrator(
        logits=validation_logits,
        labels=validation_labels,
        method=config.calibration.method,
        ece_bins=config.calibration.ece_bins,
        risk_target=config.calibration.risk_target,
        report_top_k_thresholds=config.calibration.report_top_k_thresholds,
    )
    calibrated_validation_scores = apply_calibration(validation_logits, calibrator)
    calibrated_test_scores = apply_calibration(test_logits, calibrator)

    validation_metrics_raw = _probability_metrics(raw_validation_scores, validation_labels, validation_languages)
    validation_metrics_calibrated = _probability_metrics(calibrated_validation_scores, validation_labels, validation_languages)
    test_metrics_raw = _probability_metrics(raw_test_scores, test_labels, test_languages)
    test_metrics_calibrated = _probability_metrics(calibrated_test_scores, test_labels, test_languages)
    test_band_metrics = compute_band_metrics(
        calibrated_test_scores,
        test_labels,
        lower=calibrator.threshold_recommendation["lower"],
        upper=calibrator.threshold_recommendation["upper"],
    )

    artifact = CalibrationArtifact(
        method=calibrator.method,
        parameters=calibrator.parameters,
        validation_metrics_raw=validation_metrics_raw,
        validation_metrics_calibrated=validation_metrics_calibrated,
        threshold_recommendation=calibrator.threshold_recommendation,
        threshold_sweep=calibrator.threshold_sweep,
        calibration_diagnostics=calibrator.calibration_diagnostics,
    )
    calibration_path = config.outputs.model_dir / "calibration.json"
    save_calibration_artifact(calibration_path, artifact)

    report_path = config.outputs.report_dir / "phase8_calibration_report.md"
    write_text(
        report_path,
        render_calibration_report(
            config=config,
            artifact=artifact,
            test_metrics_raw=test_metrics_raw,
            test_metrics_calibrated=test_metrics_calibrated,
            test_band_metrics=test_band_metrics,
        ),
    )

    return CalibrationRunArtifacts(
        calibration_path=calibration_path,
        report_path=report_path,
        artifact=artifact,
        test_metrics_raw=test_metrics_raw,
        test_metrics_calibrated=test_metrics_calibrated,
        test_band_metrics=test_band_metrics,
    )


@dataclass(slots=True)
class _FitCalibratorResult:
    method: str
    parameters: dict[str, float]
    threshold_recommendation: dict[str, float]
    threshold_sweep: list[dict[str, float | int]]
    calibration_diagnostics: dict[str, float | None]


def fit_calibrator(
    *,
    logits: Sequence[Sequence[float]] | np.ndarray,
    labels: Sequence[int] | np.ndarray,
    method: str,
    ece_bins: int = 10,
    risk_target: float = 0.05,
    report_top_k_thresholds: int = 5,
) -> _FitCalibratorResult:
    """Fit a validation-time calibrator and derive threshold recommendations."""

    logits_array = np.asarray(logits, dtype=np.float64)
    labels_array = np.asarray(labels, dtype=np.int64)
    method = method.lower()
    if method not in supported_calibration_methods():
        raise ValueError(f"Unsupported calibration method: {method}")

    if method == "temperature_scaling":
        temperature = fit_temperature_scaler(logits_array, labels_array)
        calibrated_scores = apply_temperature_scaling(logits_array, temperature)
        parameters = {"temperature": temperature}
    else:
        coef, intercept = fit_platt_scaler(logits_array, labels_array)
        calibrated_scores = apply_platt_scaling(logits_array, coef=coef, intercept=intercept)
        parameters = {"coef": coef, "intercept": intercept}

    threshold_sweep = compute_threshold_sweep(
        calibrated_scores,
        labels_array,
        limit=report_top_k_thresholds,
    )
    threshold_recommendation = suggest_threshold_band(
        calibrated_scores,
        labels_array,
        risk_target=risk_target,
    )
    diagnostics = {
        "raw_brier": brier_score(labels_array, positive_class_scores(logits_array)),
        "calibrated_brier": brier_score(labels_array, calibrated_scores),
        "raw_ece": expected_calibration_error(labels_array, positive_class_scores(logits_array), bins=ece_bins),
        "calibrated_ece": expected_calibration_error(labels_array, calibrated_scores, bins=ece_bins),
    }
    return _FitCalibratorResult(
        method=method,
        parameters=parameters,
        threshold_recommendation=threshold_recommendation,
        threshold_sweep=threshold_sweep,
        calibration_diagnostics=diagnostics,
    )


def apply_calibration(
    logits: Sequence[Sequence[float]] | np.ndarray,
    artifact: CalibrationArtifact | _FitCalibratorResult | dict[str, Any],
) -> np.ndarray:
    """Apply a saved or in-memory calibrator to logits."""

    if isinstance(artifact, dict):
        method = str(artifact["method"])
        parameters = artifact["parameters"]
    else:
        method = artifact.method
        parameters = artifact.parameters

    logits_array = np.asarray(logits, dtype=np.float64)
    if method == "temperature_scaling":
        return apply_temperature_scaling(logits_array, parameters["temperature"])
    if method == "platt_scaling":
        return apply_platt_scaling(logits_array, coef=parameters["coef"], intercept=parameters["intercept"])
    raise ValueError(f"Unsupported calibration artifact method: {method}")


def fit_temperature_scaler(logits: np.ndarray, labels: np.ndarray) -> float:
    """Fit a scalar temperature on validation logits using cross-entropy."""

    try:
        import torch
        import torch.nn.functional as F
    except ImportError as exc:  # pragma: no cover - depends on local environment.
        raise ImportError("temperature scaling requires torch to be installed.") from exc

    logits_tensor = torch.tensor(logits, dtype=torch.float32)
    labels_tensor = torch.tensor(labels, dtype=torch.long)
    log_temperature = torch.nn.Parameter(torch.zeros(1, dtype=torch.float32))
    optimizer = torch.optim.LBFGS([log_temperature], lr=0.1, max_iter=100)

    def closure() -> torch.Tensor:
        optimizer.zero_grad()
        temperature = torch.exp(log_temperature).clamp(min=1e-3, max=100.0)
        loss = F.cross_entropy(logits_tensor / temperature, labels_tensor)
        loss.backward()
        return loss

    optimizer.step(closure)
    temperature = float(torch.exp(log_temperature).detach().cpu().item())
    return max(1e-3, temperature)


def apply_temperature_scaling(logits: np.ndarray, temperature: float) -> np.ndarray:
    temperature = max(float(temperature), 1e-3)
    return positive_class_scores(logits / temperature)


def fit_platt_scaler(logits: np.ndarray, labels: np.ndarray) -> tuple[float, float]:
    """Fit a simple logistic mapping on the binary logit margin."""

    try:
        from sklearn.linear_model import LogisticRegression
    except ImportError as exc:  # pragma: no cover - depends on local environment.
        raise ImportError("platt scaling requires scikit-learn to be installed.") from exc

    margin = logit_margin(logits).reshape(-1, 1)
    model = LogisticRegression(solver="lbfgs", max_iter=1000)
    model.fit(margin, labels)
    return float(model.coef_[0][0]), float(model.intercept_[0])


def apply_platt_scaling(logits: np.ndarray, *, coef: float, intercept: float) -> np.ndarray:
    margin = logit_margin(logits)
    z = coef * margin + intercept
    return 1.0 / (1.0 + np.exp(-z))


def positive_class_scores(logits: Sequence[Sequence[float]] | np.ndarray) -> np.ndarray:
    return logits_to_probabilities(logits)[:, 1]


def logit_margin(logits: Sequence[Sequence[float]] | np.ndarray) -> np.ndarray:
    logits_array = np.asarray(logits, dtype=np.float64)
    if logits_array.ndim != 2 or logits_array.shape[1] < 2:
        raise ValueError(f"Expected logits with shape (n, 2+), got {logits_array.shape}")
    return logits_array[:, 1] - logits_array[:, 0]


def brier_score(labels: Sequence[int] | np.ndarray, scores: Sequence[float] | np.ndarray) -> float:
    labels_array = np.asarray(labels, dtype=np.float64)
    scores_array = np.asarray(scores, dtype=np.float64)
    return float(np.mean((scores_array - labels_array) ** 2))


def expected_calibration_error(
    labels: Sequence[int] | np.ndarray,
    scores: Sequence[float] | np.ndarray,
    *,
    bins: int = 10,
) -> float:
    labels_array = np.asarray(labels, dtype=np.float64)
    scores_array = np.asarray(scores, dtype=np.float64)
    edges = np.linspace(0.0, 1.0, bins + 1)
    total = len(scores_array)
    if total == 0:
        return 0.0

    ece = 0.0
    for index in range(bins):
        lower = edges[index]
        upper = edges[index + 1]
        if index == bins - 1:
            mask = (scores_array >= lower) & (scores_array <= upper)
        else:
            mask = (scores_array >= lower) & (scores_array < upper)
        if not np.any(mask):
            continue
        bin_scores = scores_array[mask]
        bin_labels = labels_array[mask]
        confidence = float(np.mean(bin_scores))
        accuracy = float(np.mean(bin_labels == (bin_scores >= 0.5)))
        ece += (len(bin_scores) / total) * abs(accuracy - confidence)
    return float(ece)


def compute_threshold_sweep(
    scores: Sequence[float] | np.ndarray,
    labels: Sequence[int] | np.ndarray,
    *,
    thresholds: Sequence[float] | None = None,
    limit: int | None = None,
) -> list[dict[str, float | int]]:
    """Build a threshold table to inspect precision/recall/FPR tradeoffs."""

    scores_array = np.asarray(scores, dtype=np.float64)
    labels_array = np.asarray(labels, dtype=np.int64)
    threshold_values = thresholds or [round(value, 2) for value in np.linspace(0.05, 0.95, 19)]
    rows: list[dict[str, float | int]] = []

    for threshold in threshold_values:
        predictions = (scores_array >= float(threshold)).astype(int)
        tn, fp, fn, tp = _binary_counts(labels_array, predictions)
        precision = _safe_rate(tp, tp + fp)
        recall = _safe_rate(tp, tp + fn)
        false_positive_rate = _safe_rate(fp, fp + tn)
        rows.append(
            {
                "threshold": float(threshold),
                "precision": precision,
                "recall": recall,
                "false_positive_rate": false_positive_rate,
                "true_positive": int(tp),
                "false_positive": int(fp),
                "false_negative": int(fn),
                "true_negative": int(tn),
            }
        )

    rows.sort(key=lambda row: (-float(row["precision"]), float(row["false_positive_rate"]), -float(row["recall"])))
    if limit is not None:
        return rows[:limit]
    return rows


def suggest_threshold_band(
    scores: Sequence[float] | np.ndarray,
    labels: Sequence[int] | np.ndarray,
    *,
    risk_target: float = 0.05,
    default_lower: float = 0.35,
    default_upper: float = 0.65,
) -> dict[str, float]:
    """Choose conservative lower/upper thresholds from validation data only."""

    scores_array = np.asarray(scores, dtype=np.float64)
    labels_array = np.asarray(labels, dtype=np.int64)
    threshold_values = [round(value, 2) for value in np.linspace(0.05, 0.95, 19)]

    lower_candidates: list[float] = []
    upper_candidates: list[float] = []
    for threshold in threshold_values:
        predictions = (scores_array >= threshold).astype(int)
        tn, fp, fn, tp = _binary_counts(labels_array, predictions)
        fnr = _safe_rate(fn, fn + tp)
        fpr = _safe_rate(fp, fp + tn)
        if fnr <= risk_target:
            lower_candidates.append(float(threshold))
        if fpr <= risk_target:
            upper_candidates.append(float(threshold))

    lower = max(lower_candidates) if lower_candidates else default_lower
    upper = min(upper_candidates) if upper_candidates else default_upper
    if lower >= upper:
        lower = min(default_lower, upper - 0.05) if upper > 0.05 else default_lower
        upper = max(default_upper, lower + 0.05) if lower < 0.95 else default_upper
        lower = max(0.0, min(lower, 0.95))
        upper = min(1.0, max(upper, 0.05))

    return {
        "lower": round(float(lower), 2),
        "upper": round(float(upper), 2),
        "risk_target": float(risk_target),
    }


def compute_band_metrics(
    scores: Sequence[float] | np.ndarray,
    labels: Sequence[int] | np.ndarray,
    *,
    lower: float,
    upper: float,
) -> dict[str, Any]:
    """Measure how much of the dataset receives a direct call vs abstention."""

    scores_array = np.asarray(scores, dtype=np.float64)
    labels_array = np.asarray(labels, dtype=np.int64)
    total = len(scores_array)
    likely_human_mask = scores_array < lower
    likely_ai_mask = scores_array > upper
    unclear_mask = ~(likely_human_mask | likely_ai_mask)

    likely_human_total = int(np.sum(likely_human_mask))
    likely_ai_total = int(np.sum(likely_ai_mask))
    unclear_total = int(np.sum(unclear_mask))

    human_fp = int(np.sum(likely_human_mask & (labels_array == 1)))
    ai_fp = int(np.sum(likely_ai_mask & (labels_array == 0)))

    return {
        "lower": float(lower),
        "upper": float(upper),
        "coverage": _safe_rate(likely_human_total + likely_ai_total, total),
        "abstain_rate": _safe_rate(unclear_total, total),
        "likely_human_total": likely_human_total,
        "likely_ai_total": likely_ai_total,
        "unclear_total": unclear_total,
        "human_band_error_rate": _safe_rate(human_fp, likely_human_total),
        "ai_band_error_rate": _safe_rate(ai_fp, likely_ai_total),
    }


def save_calibration_artifact(path: str | Path, artifact: CalibrationArtifact) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    write_text(target, json.dumps(asdict(artifact), indent=2))


def load_calibration_artifact(path: str | Path) -> CalibrationArtifact:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return CalibrationArtifact(**payload)


def render_calibration_report(
    *,
    config: "TrainConfig",
    artifact: CalibrationArtifact,
    test_metrics_raw: dict[str, Any],
    test_metrics_calibrated: dict[str, Any],
    test_band_metrics: dict[str, Any],
) -> str:
    lines = [
        "# Phase 8 Calibration Report",
        "",
        f"- Experiment: {config.project.experiment_name}",
        f"- Method: {artifact.method}",
        f"- Model directory: {config.outputs.model_dir}",
        f"- Threshold recommendation: lower={artifact.threshold_recommendation['lower']:.2f}, upper={artifact.threshold_recommendation['upper']:.2f}",
        "",
        "## Why this phase exists",
        "",
        "- Raw classifier probabilities are often overconfident or underconfident.",
        "- Thresholds must be chosen on validation data, not test data.",
        "- The abstain band is safer than forcing every submission into human or AI-written.",
        "",
        "## Validation calibration diagnostics",
        "",
        f"- Raw Brier score: {_fmt(artifact.calibration_diagnostics.get('raw_brier'))}",
        f"- Calibrated Brier score: {_fmt(artifact.calibration_diagnostics.get('calibrated_brier'))}",
        f"- Raw ECE: {_fmt(artifact.calibration_diagnostics.get('raw_ece'))}",
        f"- Calibrated ECE: {_fmt(artifact.calibration_diagnostics.get('calibrated_ece'))}",
        "",
        "## Validation threshold sweep highlights",
        "",
    ]
    for row in artifact.threshold_sweep:
        lines.append(
            f"- threshold={row['threshold']:.2f}: precision={_fmt(row['precision'])}, "
            f"recall={_fmt(row['recall'])}, fpr={_fmt(row['false_positive_rate'])}"
        )
    lines.extend(
        [
            "",
            "## Test metrics",
            "",
            f"- Raw test metrics: {json.dumps(test_metrics_raw, indent=2)}",
            f"- Calibrated test metrics: {json.dumps(test_metrics_calibrated, indent=2)}",
            "",
            "## Test abstain-band behavior",
            "",
            f"- Coverage: {_fmt(test_band_metrics['coverage'])}",
            f"- Abstain rate: {_fmt(test_band_metrics['abstain_rate'])}",
            f"- Human-band error rate: {_fmt(test_band_metrics['human_band_error_rate'])}",
            f"- AI-band error rate: {_fmt(test_band_metrics['ai_band_error_rate'])}",
            "",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def _probability_metrics(scores: np.ndarray, labels: np.ndarray, languages: Sequence[str]) -> dict[str, Any]:
    classification_metrics = _classification_metrics_from_scores(scores, labels, languages)
    return {
        **classification_metrics,
        "brier_score": brier_score(labels, scores),
        "expected_calibration_error": expected_calibration_error(labels, scores),
    }


def _classification_metrics_from_scores(
    scores: np.ndarray,
    labels: np.ndarray,
    languages: Sequence[str],
) -> dict[str, Any]:
    probabilities = np.asarray(scores, dtype=np.float64)
    label_array = np.asarray(labels, dtype=np.int64)
    predictions = (probabilities >= 0.5).astype(int)

    try:
        from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
    except ImportError as exc:  # pragma: no cover - depends on local environment.
        raise ImportError("scikit-learn is required for calibration metrics.") from exc

    tn, fp, fn, tp = _binary_counts(label_array, predictions)
    metrics: dict[str, Any] = {
        "sample_count": int(len(label_array)),
        "accuracy": float(accuracy_score(label_array, predictions)),
        "precision": float(precision_score(label_array, predictions, zero_division=0)),
        "recall": float(recall_score(label_array, predictions, zero_division=0)),
        "f1": float(f1_score(label_array, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(label_array, probabilities)) if len(np.unique(label_array)) > 1 else None,
        "false_positive_rate": _safe_rate(fp, fp + tn),
        "false_negative_rate": _safe_rate(fn, fn + tp),
        "confusion_matrix": [[tn, fp], [fn, tp]],
        "per_language_metrics": {},
    }
    for language in sorted(set(languages)):
        indices = [index for index, item in enumerate(languages) if item == language]
        language_labels = label_array[indices]
        language_scores = probabilities[indices]
        language_predictions = predictions[indices]
        l_tn, l_fp, l_fn, l_tp = _binary_counts(language_labels, language_predictions)
        metrics["per_language_metrics"][language] = {
            "sample_count": int(len(indices)),
            "accuracy": float(accuracy_score(language_labels, language_predictions)),
            "precision": float(precision_score(language_labels, language_predictions, zero_division=0)),
            "recall": float(recall_score(language_labels, language_predictions, zero_division=0)),
            "f1": float(f1_score(language_labels, language_predictions, zero_division=0)),
            "roc_auc": float(roc_auc_score(language_labels, language_scores)) if len(np.unique(language_labels)) > 1 else None,
            "false_positive_rate": _safe_rate(l_fp, l_fp + l_tn),
            "false_negative_rate": _safe_rate(l_fn, l_fn + l_tp),
            "confusion_matrix": [[l_tn, l_fp], [l_fn, l_tp]],
        }
    return metrics


def _predict_logits(
    *,
    trainer_module: dict[str, Any],
    model: Any,
    tokenizer: Any,
    samples: Sequence[Any],
    max_length: int,
    batch_size: int,
) -> np.ndarray:
    DataCollatorWithPadding = trainer_module["DataCollatorWithPadding"]
    Trainer = trainer_module["Trainer"]
    TrainingArguments = trainer_module["TrainingArguments"]

    dataset = TokenizedCodeDataset(samples, tokenizer=tokenizer, max_length=max_length)
    args = TrainingArguments(
        output_dir=str(Path(tokenizer.name_or_path) if hasattr(tokenizer, "name_or_path") else Path(".")),
        per_device_eval_batch_size=batch_size,
        do_train=False,
        do_eval=False,
        do_predict=True,
        dataloader_num_workers=0,
        report_to=[],
    )
    trainer = Trainer(
        model=model,
        args=args,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
    )
    prediction_output = trainer.predict(dataset)
    return np.asarray(prediction_output.predictions, dtype=np.float64)


def _require_transformers() -> dict[str, Any]:
    try:
        from transformers import DataCollatorWithPadding, Trainer, TrainingArguments
    except ImportError as exc:  # pragma: no cover - depends on local environment.
        raise ImportError(
            "Calibration requires transformers and torch because it reuses the saved classifier for validation-time predictions."
        ) from exc
    return {
        "DataCollatorWithPadding": DataCollatorWithPadding,
        "Trainer": Trainer,
        "TrainingArguments": TrainingArguments,
    }


def _binary_counts(labels: np.ndarray, predictions: np.ndarray) -> tuple[int, int, int, int]:
    tn = int(np.sum((labels == 0) & (predictions == 0)))
    fp = int(np.sum((labels == 0) & (predictions == 1)))
    fn = int(np.sum((labels == 1) & (predictions == 0)))
    tp = int(np.sum((labels == 1) & (predictions == 1)))
    return tn, fp, fn, tp


def _safe_rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return float(numerator / denominator)


def _fmt(value: Any) -> str:
    if value is None:
        return "n/a"
    return f"{float(value):.4f}"
