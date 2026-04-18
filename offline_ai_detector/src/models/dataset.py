"""Dataset helpers for model training and evaluation.

Phase 7 intentionally keeps the dataset layer explicit because leakage and
filtering mistakes are some of the easiest ways to get misleadingly good
results. The helpers here load the processed JSONL files, normalize labels, and
prepare tokenized samples for a Hugging Face classifier without hiding those
decisions inside the training loop.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any, Iterable, Sequence

from ..utils.io import read_jsonl

try:
    from torch.utils.data import Dataset
except ImportError:  # pragma: no cover - torch is optional until training time.
    class Dataset:  # type: ignore[no-redef]
        """Lightweight fallback so imports stay usable before torch is installed."""

        pass


LABEL_TO_ID = {"human": 0, "ai": 1}
ID_TO_LABEL = {value: key for key, value in LABEL_TO_ID.items()}
SUPPORTED_LANGUAGES = ("python", "java")
TOKEN_PATTERN = re.compile(r"[A-Za-z_]\w*|\d+|==|!=|<=|>=|->|=>|&&|\|\||[^\s]")


@dataclass(slots=True)
class CodeSample:
    id: str
    code: str
    language: str
    label: str
    source_dataset: str
    problem_id: str | None = None
    task_id: str | None = None
    generator_model: str | None = None
    prompt_type: str | None = None
    edit_type: str | None = None
    is_paraphrased: bool | None = None
    notes: str | None = None


@dataclass(slots=True)
class DatasetSummary:
    total_samples: int
    label_counts: dict[str, int]
    language_counts: dict[str, int]
    source_counts: dict[str, int]
    average_token_count: float


def approximate_code_token_count(code: str) -> int:
    """Return a lightweight token-ish count for code length filtering.

    We keep this heuristic simple and reproducible. It is not intended to match
    any specific model tokenizer exactly, but it is good enough to enforce a
    minimum evidence threshold before training.
    """

    return len(TOKEN_PATTERN.findall(code))


def normalize_label_value(value: str | int) -> str:
    """Normalize string or integer labels to the canonical string form."""

    if isinstance(value, int):
        try:
            return ID_TO_LABEL[value]
        except KeyError as exc:
            raise ValueError(f"Unsupported integer label: {value}") from exc

    normalized = str(value).strip().lower()
    if normalized in LABEL_TO_ID:
        return normalized
    if normalized in {"0", "human_written", "human-written"}:
        return "human"
    if normalized in {"1", "ai_written", "ai-written", "ai_generated", "ai-generated"}:
        return "ai"
    raise ValueError(f"Unsupported label value: {value!r}")


def _normalize_language(language: str) -> str:
    normalized = str(language).strip().lower()
    if normalized not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language in processed dataset: {language!r}")
    return normalized


def load_code_samples(
    path: str | Path,
    *,
    code_column: str = "code",
    label_column: str = "label",
    language_column: str = "language",
    source_dataset_column: str = "source_dataset",
    min_tokens: int = 0,
    language_allowlist: Sequence[str] | None = None,
) -> list[CodeSample]:
    """Load processed JSONL rows into typed samples for modeling."""

    raw_records = read_jsonl(path)
    allowlist = {language.lower() for language in language_allowlist or SUPPORTED_LANGUAGES}
    samples: list[CodeSample] = []

    for row in raw_records:
        code = str(row.get(code_column, "") or "")
        if not code.strip():
            continue

        language = _normalize_language(str(row.get(language_column, "") or ""))
        if language not in allowlist:
            continue

        token_count = approximate_code_token_count(code)
        if token_count < min_tokens:
            continue

        label = normalize_label_value(row.get(label_column))
        samples.append(
            CodeSample(
                id=str(row["id"]),
                code=code,
                language=language,
                label=label,
                source_dataset=str(row.get(source_dataset_column, "") or ""),
                problem_id=_optional_str(row.get("problem_id")),
                task_id=_optional_str(row.get("task_id")),
                generator_model=_optional_str(row.get("generator_model")),
                prompt_type=_optional_str(row.get("prompt_type")),
                edit_type=_optional_str(row.get("edit_type")),
                is_paraphrased=_optional_bool(row.get("is_paraphrased")),
                notes=_optional_str(row.get("notes")),
            )
        )

    if not samples:
        raise ValueError(
            f"No usable samples were loaded from {path}. "
            "Check the processed dataset files, language filters, and min_tokens setting."
        )
    return samples


def summarize_code_samples(samples: Iterable[CodeSample]) -> DatasetSummary:
    label_counts = {label: 0 for label in LABEL_TO_ID}
    language_counts = {language: 0 for language in SUPPORTED_LANGUAGES}
    source_counts: dict[str, int] = {}
    token_total = 0
    total_samples = 0

    for sample in samples:
        total_samples += 1
        label_counts[sample.label] = label_counts.get(sample.label, 0) + 1
        language_counts[sample.language] = language_counts.get(sample.language, 0) + 1
        source_counts[sample.source_dataset] = source_counts.get(sample.source_dataset, 0) + 1
        token_total += approximate_code_token_count(sample.code)

    average_token_count = (token_total / total_samples) if total_samples else 0.0
    return DatasetSummary(
        total_samples=total_samples,
        label_counts=label_counts,
        language_counts=language_counts,
        source_counts=dict(sorted(source_counts.items())),
        average_token_count=average_token_count,
    )


class TokenizedCodeDataset(Dataset):
    """Tokenize code samples lazily so training code stays readable."""

    def __init__(self, samples: Sequence[CodeSample], tokenizer: Any, max_length: int) -> None:
        self.samples = list(samples)
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> dict[str, Any]:
        import torch

        sample = self.samples[index]
        encoded = self.tokenizer(
            sample.code,
            truncation=True,
            max_length=self.max_length,
            padding=False,
        )
        item = {key: torch.tensor(value, dtype=torch.long) for key, value in encoded.items()}
        item["labels"] = torch.tensor(LABEL_TO_ID[sample.label], dtype=torch.long)
        return item


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if value == 1:
            return True
        if value == 0:
            return False
        return None
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes", "y"}:
        return True
    if normalized in {"false", "0", "no", "n"}:
        return False
    return None
