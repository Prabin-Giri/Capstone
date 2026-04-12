"""Unified dataset schema for Python and Java code samples.

Phase 2 purpose:
- define one common row contract before source-specific dataset ingestion begins
- normalize field names and values into a single representation
- fail loudly on broken assumptions instead of silently fabricating data

Main failure risks this module is trying to prevent:
- label leakage through metadata that should never become model input
- dataset-specific field naming drift across CodeNet, MultiAIGCD, CodeMirage, and AIGCodeSet
- split contamination caused by losing `problem_id` or `task_id`
- fabricated metadata where missing values should remain null
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping


# Canonical field order for JSONL/CSV exports.
# Keeping this stable makes dataset inspection and downstream tooling easier.
CANONICAL_FIELDS = (
    "id",
    "code",
    "label",
    "language",
    "source_dataset",
    "source_split",
    "problem_id",
    "task_id",
    "generator_model",
    "prompt_type",
    "edit_type",
    "is_paraphrased",
    "difficulty",
    "notes",
)

REQUIRED_FIELDS = ("id", "code", "label", "language", "source_dataset")
OPTIONAL_FIELDS = tuple(field for field in CANONICAL_FIELDS if field not in REQUIRED_FIELDS)

SUPPORTED_LANGUAGES = {"python", "java"}
SUPPORTED_LABELS = {"human", "ai"}

LANGUAGE_ALIASES = {
    "py": "python",
    "python": "python",
    "python3": "python",
    "python 3": "python",
    "java": "java",
    "java8": "java",
    "java 8": "java",
    "java11": "java",
    "java 11": "java",
}

LABEL_ALIASES = {
    "human": "human",
    "ai": "ai",
    "machine": "ai",
    "ai_written": "ai",
    "ai-generated": "ai",
    "ai_generated": "ai",
}

# These metadata fields are useful for auditing and split safety, but they are
# dangerous model inputs because they can leak labels or source shortcuts.
LEAKAGE_PRONE_FIELDS = {
    "label",
    "source_dataset",
    "source_split",
    "generator_model",
    "prompt_type",
    "edit_type",
    "is_paraphrased",
    "difficulty",
    "notes",
}


@dataclass(slots=True)
class CodeDatasetRecord:
    """Canonical record shape for all code datasets.

    Required fields must be non-empty after normalization.
    Optional fields stay `None` when unavailable. We do not fabricate metadata,
    because invented values can distort audits and accidentally create leakage.
    """

    id: str
    code: str
    label: str
    language: str
    source_dataset: str
    source_split: str | None = None
    problem_id: str | None = None
    task_id: str | None = None
    generator_model: str | None = None
    prompt_type: str | None = None
    edit_type: str | None = None
    is_paraphrased: bool | None = None
    difficulty: str | None = None
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class SchemaValidationError:
    field: str
    message: str


def _normalize_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_language(value: Any) -> str | None:
    text = _normalize_string(value)
    if text is None:
        return None
    normalized = LANGUAGE_ALIASES.get(text.lower())
    return normalized


def normalize_label(value: Any) -> str | None:
    text = _normalize_string(value)
    if text is None:
        return None
    return LABEL_ALIASES.get(text.lower())


def normalize_nullable_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "y"}:
        return True
    if text in {"false", "0", "no", "n"}:
        return False
    return None


def normalize_record(record: Mapping[str, Any]) -> CodeDatasetRecord:
    """Normalize a raw mapping into the canonical dataset schema.

    We preserve `problem_id` and `task_id` whenever present because they are
    central to leakage-safe splitting later. Random row splits are not enough for
    student-code datasets where many solutions to the same task are near-duplicates.
    """

    normalized = CodeDatasetRecord(
        id=_normalize_string(record.get("id")) or "",
        code=_normalize_string(record.get("code")) or "",
        label=normalize_label(record.get("label")) or "",
        language=normalize_language(record.get("language")) or "",
        source_dataset=_normalize_string(record.get("source_dataset")) or "",
        source_split=_normalize_string(record.get("source_split")),
        problem_id=_normalize_string(record.get("problem_id")),
        task_id=_normalize_string(record.get("task_id")),
        generator_model=_normalize_string(record.get("generator_model")),
        prompt_type=_normalize_string(record.get("prompt_type")),
        edit_type=_normalize_string(record.get("edit_type")),
        is_paraphrased=normalize_nullable_bool(record.get("is_paraphrased")),
        difficulty=_normalize_string(record.get("difficulty")),
        notes=_normalize_string(record.get("notes")),
    )
    return normalized


def validate_record(record: Mapping[str, Any]) -> list[SchemaValidationError]:
    """Validate a raw or normalized record against the canonical schema.

    Validation failures are explicit and non-silent:
    - missing required fields produce one error per field
    - unsupported labels or languages produce field-specific errors
    - empty required string values are rejected
    - malformed booleans for `is_paraphrased` are rejected
    """

    errors: list[SchemaValidationError] = []
    normalized = normalize_record(record)

    for field in REQUIRED_FIELDS:
        if field not in record:
            errors.append(SchemaValidationError(field=field, message="missing required field"))

    if not normalized.id:
        errors.append(SchemaValidationError(field="id", message="id must be non-empty"))
    if not normalized.code:
        errors.append(SchemaValidationError(field="code", message="code must be non-empty"))
    if not normalized.source_dataset:
        errors.append(
            SchemaValidationError(field="source_dataset", message="source_dataset must be non-empty")
        )

    raw_language = _normalize_string(record.get("language"))
    if raw_language is not None and not normalized.language:
        errors.append(
            SchemaValidationError(
                field="language",
                message=f"unsupported language '{record.get('language')}', expected one of {sorted(SUPPORTED_LANGUAGES)}",
            )
        )
    elif not normalized.language:
        errors.append(SchemaValidationError(field="language", message="language must be non-empty"))

    raw_label = _normalize_string(record.get("label"))
    if raw_label is not None and not normalized.label:
        errors.append(
            SchemaValidationError(
                field="label",
                message=f"unsupported label '{record.get('label')}', expected one of {sorted(SUPPORTED_LABELS)}",
            )
        )
    elif not normalized.label:
        errors.append(SchemaValidationError(field="label", message="label must be non-empty"))

    raw_is_paraphrased = record.get("is_paraphrased")
    if raw_is_paraphrased is not None and normalize_nullable_bool(raw_is_paraphrased) is None:
        errors.append(
            SchemaValidationError(
                field="is_paraphrased",
                message="is_paraphrased must be a boolean-like value or null",
            )
        )

    return errors


def validate_and_normalize_record(record: Mapping[str, Any]) -> CodeDatasetRecord:
    """Return a normalized record or raise with a readable multi-error message."""

    errors = validate_record(record)
    if errors:
        message = "\n".join(f"{error.field}: {error.message}" for error in errors)
        raise ValueError(f"Dataset schema validation failed:\n{message}")
    return normalize_record(record)
