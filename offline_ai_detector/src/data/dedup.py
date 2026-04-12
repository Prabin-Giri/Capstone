"""Duplicate detection helpers for code samples."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any, Iterable, Mapping, Sequence

from .cleaning import normalize_code_text


@dataclass(slots=True)
class DeduplicationSummary:
    input_count: int
    output_count: int
    dropped_exact_duplicates: int
    dropped_conflicting_duplicates: int
    conflicting_hashes: int


def code_text_hash(code: str) -> str:
    normalized = normalize_code_text(code)
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()


def deduplicate_records(
    records: Iterable[Mapping[str, Any]],
    *,
    source_priority: Sequence[str],
) -> tuple[list[dict[str, Any]], DeduplicationSummary]:
    """Drop exact duplicate code rows while handling conflicting labels safely.

    If identical normalized code appears with conflicting `(label, language)`
    pairs, all copies are dropped. That is conservative, but it avoids teaching
    the model contradictory labels for the same exact code.
    """

    priority_index = {source: index for index, source in enumerate(source_priority)}
    grouped: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    for index, record in enumerate(records):
        materialized = dict(record)
        grouped.setdefault(code_text_hash(str(materialized.get("code", ""))), []).append((index, materialized))

    kept_records: list[dict[str, Any]] = []
    dropped_exact_duplicates = 0
    dropped_conflicting_duplicates = 0
    conflicting_hashes = 0

    for items in grouped.values():
        signatures = {
            (
                str(record.get("label", "")).strip().lower(),
                str(record.get("language", "")).strip().lower(),
            )
            for _, record in items
        }
        if len(signatures) > 1:
            conflicting_hashes += 1
            dropped_conflicting_duplicates += len(items)
            continue

        best_index, best_record = min(
            items,
            key=lambda item: (
                priority_index.get(str(item[1].get("source_dataset", "")), len(priority_index)),
                item[0],
            ),
        )
        kept_records.append(dict(best_record))
        dropped_exact_duplicates += len(items) - 1

    summary = DeduplicationSummary(
        input_count=sum(len(items) for items in grouped.values()),
        output_count=len(kept_records),
        dropped_exact_duplicates=dropped_exact_duplicates,
        dropped_conflicting_duplicates=dropped_conflicting_duplicates,
        conflicting_hashes=conflicting_hashes,
    )
    return kept_records, summary
