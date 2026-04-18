"""Phase 7 training and evaluation flow for the code detector baseline."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Any

from ..config import TrainConfig
from ..utils.io import write_text
from ..utils.transformers_compat import training_args_eval_strategy_epoch_kwarg
from ..utils.seed import seed_everything
from .classifier import load_saved_tokenizer_and_model, load_tokenizer_and_model, resolve_classifier_spec
from .dataset import TokenizedCodeDataset, load_code_samples, summarize_code_samples
from .evaluation import (
    SplitEvaluation,
    build_prediction_rows,
    compute_classification_metrics,
    compute_trainer_selection_metrics,
    render_evaluation_markdown,
)


@dataclass(slots=True)
class TrainingRunArtifacts:
    model_dir: Path
    report_path: Path
    summary_path: Path
    train_metrics: dict[str, Any]
    validation_metrics: dict[str, Any]
    test_metrics: dict[str, Any]
    best_checkpoint: str | None


def training_plan_notes() -> list[str]:
    return [
        "Start with a 1-epoch smoke test before longer runs.",
        "Prefer small batch sizes and gradient accumulation on M1.",
        "Choose checkpoints based on validation F1 so false positives stay visible.",
    ]


def run_training(config: TrainConfig) -> TrainingRunArtifacts:
    """Train the Phase 7 baseline and write a report to disk."""

    trainer_module = _require_transformers()
    seed_everything(config.project.random_seed)
    _ensure_output_dirs(config)

    train_samples, validation_samples, test_samples = _load_split_samples(config)
    tokenizer, model = load_tokenizer_and_model(config.model)
    train_dataset = TokenizedCodeDataset(train_samples, tokenizer=tokenizer, max_length=config.model.max_length)
    validation_dataset = TokenizedCodeDataset(validation_samples, tokenizer=tokenizer, max_length=config.model.max_length)
    test_dataset = TokenizedCodeDataset(test_samples, tokenizer=tokenizer, max_length=config.model.max_length)

    trainer = _build_trainer(
        trainer_module=trainer_module,
        config=config,
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_dataset,
        validation_dataset=validation_dataset,
    )
    resume_checkpoint = _resolve_resume_checkpoint(config, trainer_module)
    train_result = trainer.train(resume_from_checkpoint=resume_checkpoint)

    trainer.save_model(str(config.outputs.model_dir))
    tokenizer.save_pretrained(str(config.outputs.model_dir))

    validation_metrics = evaluate_with_trainer(
        trainer=trainer,
        samples=validation_samples,
        dataset=validation_dataset,
        split_name="validation",
    )
    test_metrics = evaluate_with_trainer(
        trainer=trainer,
        samples=test_samples,
        dataset=test_dataset,
        split_name="test",
    )
    artifacts = _write_training_artifacts(
        config=config,
        train_samples=train_samples,
        validation_samples=validation_samples,
        test_samples=test_samples,
        train_metrics=_sanitize_metrics(train_result.metrics),
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        best_checkpoint=trainer.state.best_model_checkpoint,
    )
    return artifacts


def evaluate_saved_model(
    config: TrainConfig,
    *,
    split_name: str = "test",
    include_prediction_rows: bool = False,
) -> dict[str, Any]:
    """Load a saved checkpoint and evaluate it on one processed split."""

    trainer_module = _require_transformers()
    seed_everything(config.project.random_seed)
    split_name = split_name.lower()
    if split_name not in {"train", "validation", "test"}:
        raise ValueError(f"Unsupported split for evaluation: {split_name}")

    split_path = {
        "train": config.data.train_path,
        "validation": config.data.validation_path,
        "test": config.data.test_path,
    }[split_name]
    samples = load_code_samples(
        split_path,
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
    dataset = TokenizedCodeDataset(samples, tokenizer=tokenizer, max_length=config.model.max_length)
    trainer = _build_trainer(
        trainer_module=trainer_module,
        config=config,
        model=model,
        tokenizer=tokenizer,
        train_dataset=None,
        validation_dataset=dataset,
    )
    return evaluate_with_trainer(
        trainer=trainer,
        samples=samples,
        dataset=dataset,
        split_name=split_name,
        include_prediction_rows=include_prediction_rows,
    )


def evaluate_with_trainer(
    *,
    trainer: Any,
    samples: list[Any],
    dataset: Any,
    split_name: str,
    include_prediction_rows: bool = False,
) -> dict[str, Any]:
    prediction_output = trainer.predict(dataset)
    metrics = compute_classification_metrics(
        labels=[0 if sample.label == "human" else 1 for sample in samples],
        logits=prediction_output.predictions,
        languages=[sample.language for sample in samples],
        loss=prediction_output.metrics.get("test_loss"),
    )
    if include_prediction_rows:
        metrics["prediction_rows"] = build_prediction_rows(
            samples=samples,
            logits=prediction_output.predictions,
        )
    metrics["split_name"] = split_name
    return _sanitize_metrics(metrics)


def _build_trainer(
    *,
    trainer_module: Any,
    config: TrainConfig,
    model: Any,
    tokenizer: Any,
    train_dataset: Any | None,
    validation_dataset: Any,
) -> Any:
    DataCollatorWithPadding = trainer_module["DataCollatorWithPadding"]
    EarlyStoppingCallback = trainer_module["EarlyStoppingCallback"]
    Trainer = trainer_module["Trainer"]
    TrainingArguments = trainer_module["TrainingArguments"]

    classifier_spec = resolve_classifier_spec(config.model.model_name)
    logging_steps = max(1, config.model.logging_steps)
    callbacks = []
    if config.model.early_stopping_patience is not None:
        callbacks.append(EarlyStoppingCallback(early_stopping_patience=config.model.early_stopping_patience))

    training_args = TrainingArguments(
        output_dir=str(config.outputs.model_dir),
        overwrite_output_dir=False,
        **training_args_eval_strategy_epoch_kwarg(TrainingArguments),
        save_strategy="epoch",
        learning_rate=config.model.learning_rate,
        per_device_train_batch_size=config.model.batch_size,
        per_device_eval_batch_size=config.model.batch_size,
        gradient_accumulation_steps=config.model.gradient_accumulation_steps,
        num_train_epochs=config.model.num_epochs,
        weight_decay=config.model.weight_decay,
        warmup_ratio=config.model.warmup_ratio,
        logging_steps=logging_steps,
        load_best_model_at_end=True,
        metric_for_best_model=config.model.metric_for_best_model,
        greater_is_better=True,
        save_total_limit=config.model.save_total_limit,
        dataloader_num_workers=0,
        report_to=[],
        seed=config.project.random_seed,
        data_seed=config.project.random_seed,
        label_names=["labels"],
    )

    return Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=validation_dataset,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
        compute_metrics=compute_trainer_selection_metrics,
        callbacks=callbacks,
        model_init=None,
    )


def _load_split_samples(config: TrainConfig) -> tuple[list[Any], list[Any], list[Any]]:
    train_samples = load_code_samples(
        config.data.train_path,
        code_column=config.data.code_column,
        label_column=config.data.label_column,
        language_column=config.data.language_column,
        source_dataset_column=config.data.source_dataset_column,
        min_tokens=config.data.min_tokens,
        language_allowlist=config.data.language_allowlist,
    )
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
    return train_samples, validation_samples, test_samples


def _write_training_artifacts(
    *,
    config: TrainConfig,
    train_samples: list[Any],
    validation_samples: list[Any],
    test_samples: list[Any],
    train_metrics: dict[str, Any],
    validation_metrics: dict[str, Any],
    test_metrics: dict[str, Any],
    best_checkpoint: str | None,
) -> TrainingRunArtifacts:
    split_results = [
        SplitEvaluation(split_name="validation", metrics=validation_metrics),
        SplitEvaluation(split_name="test", metrics=test_metrics),
    ]
    report_lines = [
        "# Phase 7 Training Report",
        "",
        f"- Experiment: {config.project.experiment_name}",
        f"- Model: {config.model.model_name}",
        f"- Train samples: {len(train_samples)}",
        f"- Validation samples: {len(validation_samples)}",
        f"- Test samples: {len(test_samples)}",
        f"- Best checkpoint: {best_checkpoint or 'n/a'}",
        "",
        "## Split summaries",
        "",
        f"- Train summary: {asdict(summarize_code_samples(train_samples))}",
        f"- Validation summary: {asdict(summarize_code_samples(validation_samples))}",
        f"- Test summary: {asdict(summarize_code_samples(test_samples))}",
        "",
        "## Train metrics",
        "",
        f"```json\n{json.dumps(train_metrics, indent=2)}\n```",
        "",
        render_evaluation_markdown(split_results).rstrip(),
        "",
        "## Known limitations",
        "",
        "- This baseline still relies on processed dataset quality and leakage-safe splits.",
        "- Validation F1 is useful, but false positives on polished human code still matter.",
        "- Calibration and abstain-band tuning are deferred to Phase 8.",
        "",
    ]
    report_text = "\n".join(report_lines)

    report_path = config.outputs.report_dir / "phase7_training_report.md"
    summary_path = config.outputs.report_dir / "phase7_training_summary.json"
    write_text(report_path, report_text)
    summary_payload = {
        "experiment_name": config.project.experiment_name,
        "model_name": config.model.model_name,
        "best_checkpoint": best_checkpoint,
        "train_metrics": train_metrics,
        "validation_metrics": validation_metrics,
        "test_metrics": test_metrics,
        "train_summary": asdict(summarize_code_samples(train_samples)),
        "validation_summary": asdict(summarize_code_samples(validation_samples)),
        "test_summary": asdict(summarize_code_samples(test_samples)),
    }
    write_text(summary_path, json.dumps(summary_payload, indent=2))

    return TrainingRunArtifacts(
        model_dir=config.outputs.model_dir,
        report_path=report_path,
        summary_path=summary_path,
        train_metrics=train_metrics,
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        best_checkpoint=best_checkpoint,
    )


def _ensure_output_dirs(config: TrainConfig) -> None:
    config.outputs.model_dir.mkdir(parents=True, exist_ok=True)
    config.outputs.report_dir.mkdir(parents=True, exist_ok=True)
    config.outputs.figures_dir.mkdir(parents=True, exist_ok=True)


def _resolve_resume_checkpoint(config: TrainConfig, trainer_module: Any) -> str | None:
    if not config.model.resume_from_checkpoint:
        return None
    get_last_checkpoint = trainer_module["get_last_checkpoint"]
    if not config.outputs.model_dir.exists():
        return None
    return get_last_checkpoint(str(config.outputs.model_dir))


def _require_transformers() -> dict[str, Any]:
    try:
        from transformers import DataCollatorWithPadding, EarlyStoppingCallback, Trainer, TrainingArguments
        from transformers.trainer_utils import get_last_checkpoint
    except ImportError as exc:  # pragma: no cover - depends on local environment.
        raise ImportError(
            "Phase 7 training requires transformers and torch. "
            "Install the dependencies from offline_ai_detector/requirements.txt first."
        ) from exc

    return {
        "DataCollatorWithPadding": DataCollatorWithPadding,
        "EarlyStoppingCallback": EarlyStoppingCallback,
        "Trainer": Trainer,
        "TrainingArguments": TrainingArguments,
        "get_last_checkpoint": get_last_checkpoint,
    }


def _sanitize_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    sanitized: dict[str, Any] = {}
    for key, value in metrics.items():
        if isinstance(value, Path):
            sanitized[key] = str(value)
        elif isinstance(value, dict):
            sanitized[key] = _sanitize_metrics(value)
        elif isinstance(value, list):
            sanitized[key] = [
                _sanitize_metrics(item) if isinstance(item, dict) else _sanitize_scalar(item)
                for item in value
            ]
        else:
            sanitized[key] = _sanitize_scalar(value)
    return sanitized


def _sanitize_scalar(value: Any) -> Any:
    if hasattr(value, "item"):
        return value.item()
    return value
