"""Source-specific inspection and normalization loaders.

Phase 3 purpose:
- inspect each dataset independently before merging
- normalize per-source columns into the shared schema
- filter to Python and Java only
- save cleaned interim exports without creating train/val/test splits yet

Main failure risks this module is trying to prevent:
- silently assuming raw source layouts that do not exist
- losing problem or task identifiers needed for leakage-safe splitting
- keeping malformed or empty code rows that poison later metrics
- allowing dataset-specific column names to leak into downstream code
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import statistics
from typing import Any

import pandas as pd

from .cleaning import CodeCleaningResult, clean_code_sample, token_count
from .dedup import code_text_hash
from .schema import CANONICAL_FIELDS, validate_and_normalize_record


SUPPORTED_SOURCE_NAMES = ("codenet", "multiaigcd", "codemirage", "aigcodeset")
TABULAR_SUFFIXES = {".csv", ".tsv", ".jsonl", ".json", ".parquet"}


COMMON_ALIASES: dict[str, tuple[str, ...]] = {
    "id": ("id", "submission_id", "sample_id", "solution_id", "record_id"),
    "code": ("code", "source_code", "source", "content", "program", "snippet", "solution"),
    "label": ("label", "class", "target"),
    "language": ("language", "lang", "programming_language"),
    "source_split": ("source_split", "split", "partition"),
    "problem_id": ("problem_id", "problem", "problemid", "question_id"),
    "task_id": ("task_id", "task", "taskid"),
    "generator_model": ("generator_model", "model", "model_name", "llm", "generator"),
    "prompt_type": ("prompt_type", "prompt", "prompt_style", "scenario"),
    "edit_type": ("edit_type", "repair_mode", "edit_level", "rewrite_type"),
    "is_paraphrased": ("is_paraphrased", "paraphrased", "paraphrased_flag"),
    "difficulty": ("difficulty", "level"),
    "notes": ("notes", "status", "submission_status", "comment"),
}


SOURCE_DEFAULT_LABELS = {
    "codenet": "human",
    "multiaigcd": "ai",
    "codemirage": "ai",
    "aigcodeset": None,
}


@dataclass(slots=True)
class SourceInspectionReport:
    source_name: str
    source_path: str
    total_rows: int
    kept_rows: int
    python_rows: int
    java_rows: int
    avg_char_length: float
    avg_token_length: float
    duplicate_rate: float
    null_counts: dict[str, int]
    raw_columns: list[str]
    warnings: list[str]
    output_path: str | None = None


@dataclass(slots=True)
class SourceLoadResult:
    frame: pd.DataFrame
    report: SourceInspectionReport


def assert_source_directory(path: str | Path) -> Path:
    directory = Path(path)
    if not directory.exists():
        raise FileNotFoundError(f"Dataset directory does not exist: {directory}")
    if not directory.is_dir():
        raise NotADirectoryError(f"Expected dataset directory, found file: {directory}")
    return directory


def discover_source_paths(root_dir: str | Path) -> list[Path]:
    root = assert_source_directory(root_dir)
    return sorted(path for path in root.rglob("*") if path.is_file() and not path.name.startswith("."))


def inspect_dataset_source(
    source_name: str,
    root_dir: str | Path,
    allowed_languages: list[str],
    *,
    min_tokens_warn: int = 50,
    cleaning_options: dict[str, Any] | None = None,
) -> SourceInspectionReport:
    result = _load_source(
        source_name,
        root_dir=root_dir,
        allowed_languages=allowed_languages,
        min_tokens_warn=min_tokens_warn,
        cleaning_options=cleaning_options or {},
        save_output_path=None,
    )
    return result.report


def clean_dataset_source(
    source_name: str,
    *,
    root_dir: str | Path,
    allowed_languages: list[str],
    output_path: str | Path,
    min_tokens_warn: int = 50,
    cleaning_options: dict[str, Any] | None = None,
) -> SourceLoadResult:
    return _load_source(
        source_name,
        root_dir=root_dir,
        allowed_languages=allowed_languages,
        min_tokens_warn=min_tokens_warn,
        cleaning_options=cleaning_options or {},
        save_output_path=Path(output_path),
    )


def render_report_markdown(report: SourceInspectionReport) -> str:
    warnings = report.warnings or ["None"]
    warning_lines = "\n".join(f"- {warning}" for warning in warnings)
    null_lines = "\n".join(f"- `{field}`: {count}" for field, count in sorted(report.null_counts.items()))
    if not null_lines:
        null_lines = "- none"

    return f"""# {report.source_name} inspection

- Source path: `{report.source_path}`
- Total rows: {report.total_rows}
- Kept rows after Python/Java filtering: {report.kept_rows}
- Python rows: {report.python_rows}
- Java rows: {report.java_rows}
- Average character length: {report.avg_char_length:.2f}
- Average token length: {report.avg_token_length:.2f}
- Duplicate rate: {report.duplicate_rate:.4f}
- Output path: `{report.output_path or "not written"}`

## Raw Columns

{", ".join(report.raw_columns) if report.raw_columns else "None"}

## Null Counts

{null_lines}

## Warnings

{warning_lines}
"""


def cross_source_length_warnings(reports: list[SourceInspectionReport]) -> list[str]:
    usable = [report for report in reports if report.avg_token_length > 0]
    if len(usable) < 2:
        return []

    median_length = statistics.median(report.avg_token_length for report in usable)
    warnings: list[str] = []
    for report in usable:
        if report.avg_token_length > median_length * 2:
            warnings.append(
                f"{report.source_name} average token length ({report.avg_token_length:.2f}) is much higher than the cross-source median ({median_length:.2f})"
            )
        elif report.avg_token_length < median_length * 0.5:
            warnings.append(
                f"{report.source_name} average token length ({report.avg_token_length:.2f}) is much lower than the cross-source median ({median_length:.2f})"
            )
    return warnings


def _load_source(
    source_name: str,
    *,
    root_dir: str | Path,
    allowed_languages: list[str],
    min_tokens_warn: int,
    cleaning_options: dict[str, Any],
    save_output_path: Path | None,
) -> SourceLoadResult:
    if source_name not in SUPPORTED_SOURCE_NAMES:
        raise ValueError(f"Unsupported source '{source_name}'. Expected one of {SUPPORTED_SOURCE_NAMES}")

    raw_frame, selected_path, warnings = _read_source_frame(source_name, root_dir)
    raw_columns = [str(column) for column in raw_frame.columns]
    normalized_rows, row_warnings = _normalize_source_rows(
        source_name,
        raw_frame,
        allowed_languages=allowed_languages,
        min_tokens_warn=min_tokens_warn,
        cleaning_options=cleaning_options,
    )
    warnings.extend(row_warnings)

    cleaned_frame = pd.DataFrame(normalized_rows, columns=CANONICAL_FIELDS)
    if cleaned_frame.empty:
        null_counts = {field: 0 for field in CANONICAL_FIELDS}
        avg_char_length = 0.0
        avg_token_length = 0.0
        duplicate_rate = 0.0
        python_rows = 0
        java_rows = 0
    else:
        null_counts = {field: int(cleaned_frame[field].isna().sum()) for field in cleaned_frame.columns}
        avg_char_length = float(cleaned_frame["code"].map(len).mean())
        avg_token_length = float(cleaned_frame["code"].map(token_count).mean())
        duplicate_rate = _duplicate_rate(cleaned_frame["code"].tolist())
        python_rows = int((cleaned_frame["language"] == "python").sum())
        java_rows = int((cleaned_frame["language"] == "java").sum())
        warnings.extend(_metadata_warnings(source_name, cleaned_frame))

    if save_output_path is not None:
        _write_jsonl(save_output_path, cleaned_frame.to_dict(orient="records"))

    report = SourceInspectionReport(
        source_name=source_name,
        source_path=str(selected_path),
        total_rows=int(len(raw_frame)),
        kept_rows=int(len(cleaned_frame)),
        python_rows=python_rows,
        java_rows=java_rows,
        avg_char_length=avg_char_length,
        avg_token_length=avg_token_length,
        duplicate_rate=duplicate_rate,
        null_counts=null_counts,
        raw_columns=raw_columns,
        warnings=_dedupe_preserve_order(warnings),
        output_path=str(save_output_path) if save_output_path is not None else None,
    )
    return SourceLoadResult(frame=cleaned_frame, report=report)


def _read_source_frame(source_name: str, root_dir: str | Path) -> tuple[pd.DataFrame, Path, list[str]]:
    files = discover_source_paths(root_dir)
    candidate_files = [path for path in files if path.suffix.lower() in TABULAR_SUFFIXES]
    if not candidate_files:
        raise FileNotFoundError(
            f"No supported tabular files found for {source_name} under {root_dir}. "
            "Expected CSV, TSV, JSONL, JSON, or Parquet."
        )

    selected_path = _select_candidate_file(source_name, candidate_files)
    warnings: list[str] = []
    if len(candidate_files) > 1:
        warnings.append(
            f"multiple candidate tabular files found; selected {selected_path.name}"
        )
    return _read_tabular_file(selected_path), selected_path, warnings


def _select_candidate_file(source_name: str, candidate_files: list[Path]) -> Path:
    preferred_names = (
        f"{source_name}.jsonl",
        f"{source_name}.csv",
        f"{source_name}.tsv",
        f"{source_name}.parquet",
    )
    by_name = {path.name.lower(): path for path in candidate_files}
    for name in preferred_names:
        if name in by_name:
            return by_name[name]
    return sorted(candidate_files)[0]


def _read_tabular_file(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix == ".tsv":
        return pd.read_csv(path, sep="\t")
    if suffix == ".jsonl":
        return pd.read_json(path, lines=True)
    if suffix == ".json":
        return pd.read_json(path)
    if suffix == ".parquet":
        return pd.read_parquet(path)
    raise ValueError(f"Unsupported tabular file format: {path}")


def _normalize_column_name(name: Any) -> str:
    text = str(name).strip().lower()
    for old, new in ((" ", "_"), ("-", "_"), (".", "_"), ("/", "_")):
        text = text.replace(old, new)
    return text


def _build_column_lookup(frame: pd.DataFrame) -> dict[str, str]:
    return {_normalize_column_name(column): str(column) for column in frame.columns}


def _find_column(column_lookup: dict[str, str], aliases: tuple[str, ...]) -> str | None:
    for alias in aliases:
        normalized_alias = _normalize_column_name(alias)
        if normalized_alias in column_lookup:
            return column_lookup[normalized_alias]
    return None


def _normalize_source_rows(
    source_name: str,
    frame: pd.DataFrame,
    *,
    allowed_languages: list[str],
    min_tokens_warn: int,
    cleaning_options: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    column_lookup = _build_column_lookup(frame)
    default_label = SOURCE_DEFAULT_LABELS[source_name]
    warnings: list[str] = []
    normalized_rows: list[dict[str, Any]] = []

    if _find_column(column_lookup, COMMON_ALIASES["code"]) is None:
        raise ValueError(f"{source_name} is missing a recognizable code column")
    if _find_column(column_lookup, COMMON_ALIASES["language"]) is None:
        raise ValueError(f"{source_name} is missing a recognizable language column")
    if _find_column(column_lookup, COMMON_ALIASES["id"]) is None:
        raise ValueError(f"{source_name} is missing a recognizable id column")
    if default_label is None and _find_column(column_lookup, COMMON_ALIASES["label"]) is None:
        raise ValueError(f"{source_name} requires a label column because it has no default class label")

    label_column = _find_column(column_lookup, COMMON_ALIASES["label"])
    if label_column is None and default_label is not None:
        warnings.append(f"{source_name}: no label column found; defaulting all rows to '{default_label}'")

    raw_language_values: set[str] = set()
    dropped_for_language = 0
    validation_failures = 0
    broken_code_rows = 0
    short_code_rows = 0
    cleaned_with_changes = 0

    for _, row in frame.iterrows():
        raw_row = _build_canonical_row(source_name, row, column_lookup, default_label=default_label)
        raw_language = str(row.get(_find_column(column_lookup, COMMON_ALIASES["language"]) or "", "")).strip()
        if raw_language:
            raw_language_values.add(raw_language)

        try:
            normalized = validate_and_normalize_record(raw_row).to_dict()
        except ValueError:
            validation_failures += 1
            continue

        cleaning_result = clean_code_sample(
            normalized["code"],
            min_tokens_warn=min_tokens_warn,
            **cleaning_options,
        )
        normalized["code"] = cleaning_result.cleaned_code
        if _cleaning_changed_content(cleaning_result):
            cleaned_with_changes += 1
        if cleaning_result.is_broken:
            broken_code_rows += 1
            continue
        if cleaning_result.is_short_candidate:
            short_code_rows += 1

        if normalized["language"] not in allowed_languages:
            dropped_for_language += 1
            continue

        normalized_rows.append(normalized)

    if validation_failures:
        warnings.append(f"{source_name}: dropped {validation_failures} rows that failed schema validation")
    if dropped_for_language:
        warnings.append(f"{source_name}: dropped {dropped_for_language} rows outside the allowed language set")
    if broken_code_rows:
        warnings.append(f"{source_name}: dropped {broken_code_rows} rows with empty or clearly broken code")
    if short_code_rows:
        warnings.append(
            f"{source_name}: kept {short_code_rows} rows below the {min_tokens_warn}-token guideline; these should be filtered later before training"
        )
    if cleaned_with_changes:
        warnings.append(
            f"{source_name}: conservative cleaning changed formatting on {cleaned_with_changes} kept rows"
        )

    unsupported_values = sorted(
        value for value in raw_language_values if value.strip().lower() not in {"python", "python 3", "python3", "java", "java 8", "java8", "java 11", "java11", "py"}
    )
    if unsupported_values:
        warnings.append(
            f"{source_name}: observed unsupported or inconsistent raw language values: {', '.join(unsupported_values[:10])}"
        )

    return normalized_rows, warnings


def _build_canonical_row(
    source_name: str,
    row: pd.Series,
    column_lookup: dict[str, str],
    *,
    default_label: str | None,
) -> dict[str, Any]:
    def value_for(field: str) -> Any:
        column = _find_column(column_lookup, COMMON_ALIASES[field])
        return row[column] if column is not None else None

    label_value = value_for("label")
    if label_value is None and default_label is not None:
        label_value = default_label

    return {
        "id": value_for("id"),
        "code": value_for("code"),
        "label": label_value,
        "language": value_for("language"),
        "source_dataset": source_name,
        "source_split": value_for("source_split"),
        "problem_id": value_for("problem_id"),
        "task_id": value_for("task_id"),
        "generator_model": value_for("generator_model"),
        "prompt_type": value_for("prompt_type"),
        "edit_type": value_for("edit_type"),
        "is_paraphrased": value_for("is_paraphrased"),
        "difficulty": value_for("difficulty"),
        "notes": value_for("notes"),
    }


def _duplicate_rate(code_values: list[str]) -> float:
    if not code_values:
        return 0.0
    hashes = [code_text_hash(code) for code in code_values]
    duplicate_count = len(hashes) - len(set(hashes))
    return duplicate_count / len(hashes)


def _metadata_warnings(source_name: str, frame: pd.DataFrame) -> list[str]:
    warnings: list[str] = []
    if frame.empty:
        warnings.append(f"{source_name}: no usable Python/Java rows remained after normalization")
        return warnings

    if source_name in {"multiaigcd", "codemirage"} and frame["generator_model"].isna().all():
        warnings.append(f"{source_name}: generator_model metadata is missing for all kept rows")
    if source_name == "codenet" and frame["problem_id"].isna().all():
        warnings.append(f"{source_name}: problem_id is missing for all kept rows, which increases leakage risk later")
    if frame["code"].map(token_count).mean() < 10:
        warnings.append(f"{source_name}: average token length is very low, which may indicate malformed code extraction")
    return warnings


def _cleaning_changed_content(result: CodeCleaningResult) -> bool:
    return (
        result.changed_line_endings
        or result.stripped_trailing_spaces
        or result.expanded_tabs
        or result.trimmed_terminal_blank_lines
    )


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(records).to_json(path, orient="records", lines=True, force_ascii=False)
