"""Typed config loading for the code-detector scaffold.

Phase 1 keeps config handling lightweight but explicit so later phases can add
real dataset ingestion, training, and inference behavior without rewriting the
basic config contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .paths import DETECTOR_ROOT


def _resolve_path(value: str | Path | None) -> Path | None:
    if value is None:
        return None
    path = Path(value)
    if path.is_absolute():
        return path
    return (DETECTOR_ROOT / path).resolve()


def _load_yaml(path: str | Path) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle) or {}
    if not isinstance(payload, dict):
        raise ValueError(f"Expected mapping-style YAML config at {path}")
    return payload


@dataclass(slots=True)
class DatasetSourceConfig:
    root_dir: Path
    role: str
    enabled: bool = True


@dataclass(slots=True)
class DataFiltersConfig:
    languages: list[str]
    min_tokens: int = 50


@dataclass(slots=True)
class DataCleaningConfig:
    normalize_line_endings: bool = True
    strip_trailing_spaces: bool = True
    expand_tabs: bool = False
    tab_width: int = 4
    trim_terminal_blank_lines: bool = True
    preserve_comments: bool = True


@dataclass(slots=True)
class DataMergeConfig:
    primary_human_sources: list[str]
    primary_ai_sources: list[str]
    supplemental_eval_sources: list[str]
    target_counts_per_bucket: dict[str, int]
    train_ratio: float = 0.70
    validation_ratio: float = 0.15
    test_ratio: float = 0.15
    max_imbalance_pct: float = 20.0
    random_seed: int = 42


@dataclass(slots=True)
class DataOutputsConfig:
    interim_dir: Path
    processed_dir: Path
    report_path: Path
    source_report_dir: Path
    merged_dataset_path: Path
    supplemental_eval_path: Path
    train_path: Path
    validation_path: Path
    test_path: Path


@dataclass(slots=True)
class DataConfig:
    datasets: dict[str, DatasetSourceConfig]
    filters: DataFiltersConfig
    cleaning: DataCleaningConfig
    merge: DataMergeConfig
    outputs: DataOutputsConfig


@dataclass(slots=True)
class ProjectConfig:
    name: str
    experiment_name: str
    random_seed: int = 42


@dataclass(slots=True)
class TrainingDataConfig:
    train_path: Path
    validation_path: Path
    test_path: Path
    file_format: str
    code_column: str = "code"
    label_column: str = "label"
    language_column: str = "language"
    source_dataset_column: str = "source_dataset"
    language_allowlist: list[str] | None = None
    min_tokens: int = 50


@dataclass(slots=True)
class ModelConfig:
    model_name: str
    local_files_only: bool = False
    max_length: int = 256
    batch_size: int = 4
    learning_rate: float = 2e-5
    weight_decay: float = 0.01
    num_epochs: int = 1
    warmup_ratio: float = 0.1
    gradient_accumulation_steps: int = 1
    resume_from_checkpoint: bool = True


@dataclass(slots=True)
class CalibrationConfig:
    method: str = "temperature_scaling"
    enabled: bool = False


@dataclass(slots=True)
class ThresholdConfig:
    lower: float = 0.35
    upper: float = 0.65


@dataclass(slots=True)
class OutputConfig:
    model_dir: Path
    report_dir: Path
    figures_dir: Path


@dataclass(slots=True)
class TrainConfig:
    project: ProjectConfig
    data: TrainingDataConfig
    model: ModelConfig
    calibration: CalibrationConfig
    thresholds: ThresholdConfig
    outputs: OutputConfig


@dataclass(slots=True)
class RuntimeConfig:
    model_dir: Path
    calibration_path: Path | None
    language_allowlist: list[str] | None
    min_tokens: int = 50
    max_length: int = 256
    local_files_only: bool = False


@dataclass(slots=True)
class InferenceConfig:
    runtime: RuntimeConfig
    thresholds: ThresholdConfig


def load_data_config(path: str | Path) -> DataConfig:
    raw = _load_yaml(path)
    datasets = {
        name: DatasetSourceConfig(
            root_dir=_resolve_path(block["root_dir"]),
            role=block["role"],
            enabled=block.get("enabled", True),
        )
        for name, block in raw["datasets"].items()
    }
    filters = DataFiltersConfig(**raw["filters"])
    cleaning = DataCleaningConfig(**raw.get("cleaning", {}))
    merge = DataMergeConfig(**raw["merge"])
    outputs = DataOutputsConfig(
        interim_dir=_resolve_path(raw["outputs"]["interim_dir"]),
        processed_dir=_resolve_path(raw["outputs"]["processed_dir"]),
        report_path=_resolve_path(raw["outputs"]["report_path"]),
        source_report_dir=_resolve_path(raw["outputs"]["source_report_dir"]),
        merged_dataset_path=_resolve_path(raw["outputs"]["merged_dataset_path"]),
        supplemental_eval_path=_resolve_path(raw["outputs"]["supplemental_eval_path"]),
        train_path=_resolve_path(raw["outputs"]["train_path"]),
        validation_path=_resolve_path(raw["outputs"]["validation_path"]),
        test_path=_resolve_path(raw["outputs"]["test_path"]),
    )
    return DataConfig(datasets=datasets, filters=filters, cleaning=cleaning, merge=merge, outputs=outputs)


def load_train_config(path: str | Path) -> TrainConfig:
    raw = _load_yaml(path)
    return TrainConfig(
        project=ProjectConfig(**raw["project"]),
        data=TrainingDataConfig(
            train_path=_resolve_path(raw["data"]["train_path"]),
            validation_path=_resolve_path(raw["data"]["validation_path"]),
            test_path=_resolve_path(raw["data"]["test_path"]),
            file_format=raw["data"]["file_format"],
            code_column=raw["data"].get("code_column", "code"),
            label_column=raw["data"].get("label_column", "label"),
            language_column=raw["data"].get("language_column", "language"),
            source_dataset_column=raw["data"].get("source_dataset_column", "source_dataset"),
            language_allowlist=raw["data"].get("language_allowlist"),
            min_tokens=raw["data"].get("min_tokens", 50),
        ),
        model=ModelConfig(**raw["model"]),
        calibration=CalibrationConfig(**raw.get("calibration", {})),
        thresholds=ThresholdConfig(**raw["thresholds"]),
        outputs=OutputConfig(
            model_dir=_resolve_path(raw["outputs"]["model_dir"]),
            report_dir=_resolve_path(raw["outputs"]["report_dir"]),
            figures_dir=_resolve_path(raw["outputs"]["figures_dir"]),
        ),
    )


def load_inference_config(path: str | Path) -> InferenceConfig:
    raw = _load_yaml(path)
    runtime = raw["runtime"]
    return InferenceConfig(
        runtime=RuntimeConfig(
            model_dir=_resolve_path(runtime["model_dir"]),
            calibration_path=_resolve_path(runtime.get("calibration_path")),
            language_allowlist=runtime.get("language_allowlist"),
            min_tokens=runtime.get("min_tokens", 50),
            max_length=runtime.get("max_length", 256),
            local_files_only=runtime.get("local_files_only", False),
        ),
        thresholds=ThresholdConfig(**raw["thresholds"]),
    )
