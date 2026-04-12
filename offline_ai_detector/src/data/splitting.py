"""Leakage-aware merge and split helpers."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import random
from typing import Any, Iterable, Mapping, Sequence

from .cleaning import token_count
from .dedup import code_text_hash


@dataclass(slots=True)
class BucketPlan:
    available_count: int
    target_count: int


def choose_group_key(record: Mapping[str, object]) -> str:
    """Choose the safest available grouping key for leakage-aware splitting."""

    problem_id = str(record.get("problem_id") or "").strip()
    task_id = str(record.get("task_id") or "").strip()
    if problem_id:
        return f"problem::{problem_id}"
    if task_id:
        return f"task::{task_id}"
    # TODO: add similarity-based clustering after we inspect the real datasets.
    return f"codehash::{code_text_hash(str(record.get('code', '')))}"


def make_bucket_key(language: str, label: str) -> str:
    return f"{language.strip().lower()}_{label.strip().lower()}"


def summarize_bucket_counts(records: Iterable[Mapping[str, Any]]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for record in records:
        counts[make_bucket_key(str(record["language"]), str(record["label"]))] += 1
    return dict(sorted(counts.items()))


def compute_scaled_bucket_targets(
    available_counts: Mapping[str, int],
    requested_targets: Mapping[str, int],
) -> tuple[dict[str, BucketPlan], float]:
    """Reduce targets proportionally if any required bucket is underfilled."""

    scale_candidates: list[float] = []
    for bucket, requested in requested_targets.items():
        if requested <= 0:
            continue
        available = int(available_counts.get(bucket, 0))
        if available <= 0:
            raise ValueError(f"Required bucket '{bucket}' has no available records")
        scale_candidates.append(min(1.0, available / requested))

    scale_factor = min(scale_candidates) if scale_candidates else 1.0
    plans: dict[str, BucketPlan] = {}
    for bucket, requested in requested_targets.items():
        available = int(available_counts.get(bucket, 0))
        if requested <= 0 or available <= 0:
            plans[bucket] = BucketPlan(available_count=available, target_count=0)
            continue
        if scale_factor < 1.0:
            scaled_target = max(1, int(round(requested * scale_factor)))
        else:
            scaled_target = requested
        plans[bucket] = BucketPlan(
            available_count=available,
            target_count=min(available, scaled_target),
        )
    return plans, scale_factor


def sample_bucket_records(
    records: Sequence[Mapping[str, Any]],
    *,
    target_count: int,
    source_priority: Sequence[str],
    random_seed: int,
) -> list[dict[str, Any]]:
    """Sample records with group safety and source balancing in mind.

    Logic:
    - sample within a single `(language, label)` bucket
    - distribute quota across sources as evenly as possible
    - sample whole groups instead of arbitrary rows so near-identical task
      variants are less likely to be overrepresented
    """

    materialized = [dict(record) for record in records]
    if target_count >= len(materialized):
        return materialized

    by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in materialized:
        by_source[str(record.get("source_dataset", ""))].append(record)

    source_order = sorted(
        by_source,
        key=lambda source: (source_priority.index(source) if source in source_priority else len(source_priority), source),
    )
    source_quotas = _allocate_quotas_evenly(
        {source: len(by_source[source]) for source in source_order},
        target_count,
    )

    sampled: list[dict[str, Any]] = []
    for source in source_order:
        sampled.extend(
            _sample_groups_up_to_target(
                by_source[source],
                target_count=source_quotas[source],
                random_seed=_stable_seed(random_seed, source),
            )
        )
    return sampled


def split_records_by_bucket(
    records: Sequence[Mapping[str, Any]],
    *,
    train_ratio: float,
    validation_ratio: float,
    test_ratio: float,
    random_seed: int,
    supplemental_eval_sources: Sequence[str] = (),
) -> dict[str, list[dict[str, Any]]]:
    """Split records bucket-by-bucket while keeping group keys whole."""

    total_ratio = round(train_ratio + validation_ratio + test_ratio, 6)
    if total_ratio != 1.0:
        raise ValueError(f"Split ratios must sum to 1.0, received {total_ratio}")

    splits = {"train": [], "validation": [], "test": []}
    by_bucket: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        by_bucket[make_bucket_key(str(record["language"]), str(record["label"]))].append(dict(record))

    supplemental_set = set(supplemental_eval_sources)
    for bucket, bucket_records in by_bucket.items():
        primary_records = [record for record in bucket_records if record.get("source_dataset") not in supplemental_set]
        supplemental_records = [record for record in bucket_records if record.get("source_dataset") in supplemental_set]

        primary_split = _split_grouped_records(
            primary_records,
            ratios={"train": train_ratio, "validation": validation_ratio, "test": test_ratio},
            random_seed=_stable_seed(random_seed, f"{bucket}:primary"),
        )
        supplemental_split = _split_grouped_records(
            supplemental_records,
            ratios={
                "validation": validation_ratio / (validation_ratio + test_ratio),
                "test": test_ratio / (validation_ratio + test_ratio),
            },
            random_seed=_stable_seed(random_seed, f"{bucket}:supplemental"),
        )

        for split_name, items in primary_split.items():
            splits[split_name].extend(items)
        for split_name, items in supplemental_split.items():
            splits[split_name].extend(items)

    return splits


def summarize_records(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    total = len(records)
    language_counts = Counter(str(record["language"]) for record in records)
    label_counts = Counter(str(record["label"]) for record in records)
    source_counts = Counter(str(record["source_dataset"]) for record in records)
    token_lengths = [token_count(str(record["code"])) for record in records]
    problem_counts = Counter(str(record.get("problem_id") or "") for record in records if record.get("problem_id"))

    return {
        "total_samples": total,
        "language_counts": dict(sorted(language_counts.items())),
        "label_counts": dict(sorted(label_counts.items())),
        "source_dataset_counts": dict(sorted(source_counts.items())),
        "average_token_length": (sum(token_lengths) / len(token_lengths)) if token_lengths else 0.0,
        "distinct_problem_ids": len(problem_counts),
        "top_problem_ids": problem_counts.most_common(10),
    }


def summarize_splits(split_map: Mapping[str, Sequence[Mapping[str, Any]]]) -> dict[str, Any]:
    return {split_name: summarize_records(records) for split_name, records in split_map.items()}


def _allocate_quotas_evenly(source_counts: Mapping[str, int], target_total: int) -> dict[str, int]:
    quotas = {source: 0 for source in source_counts}
    active_sources = [source for source, count in source_counts.items() if count > 0]
    if not active_sources or target_total <= 0:
        return quotas

    remaining = target_total
    remaining_sources = active_sources[:]
    while remaining > 0 and remaining_sources:
        per_source = max(1, remaining // len(remaining_sources))
        next_round: list[str] = []
        for source in remaining_sources:
            available_remaining = source_counts[source] - quotas[source]
            if available_remaining <= 0:
                continue
            take = min(per_source, available_remaining, remaining)
            quotas[source] += take
            remaining -= take
            if quotas[source] < source_counts[source]:
                next_round.append(source)
            if remaining <= 0:
                break
        if next_round == remaining_sources:
            for source in next_round:
                if remaining <= 0:
                    break
                available_remaining = source_counts[source] - quotas[source]
                if available_remaining <= 0:
                    continue
                quotas[source] += 1
                remaining -= 1
        remaining_sources = [source for source in next_round if source_counts[source] > quotas[source]]
    return quotas


def _sample_groups_up_to_target(
    records: Sequence[Mapping[str, Any]],
    *,
    target_count: int,
    random_seed: int,
) -> list[dict[str, Any]]:
    if target_count <= 0:
        return []
    materialized = [dict(record) for record in records]
    if target_count >= len(materialized):
        return materialized

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in materialized:
        groups[choose_group_key(record)].append(record)

    rng = random.Random(random_seed)
    grouped_items = list(groups.items())
    rng.shuffle(grouped_items)
    grouped_items.sort(key=lambda item: len(item[1]))

    selected: list[dict[str, Any]] = []
    current_count = 0
    for _, group_records in grouped_items:
        if current_count >= target_count:
            break
        selected.extend(dict(record) for record in group_records)
        current_count += len(group_records)
    return selected


def _split_grouped_records(
    records: Sequence[Mapping[str, Any]],
    *,
    ratios: Mapping[str, float],
    random_seed: int,
) -> dict[str, list[dict[str, Any]]]:
    split_map = {split_name: [] for split_name in ratios}
    materialized = [dict(record) for record in records]
    if not materialized:
        return split_map

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in materialized:
        groups[choose_group_key(record)].append(record)

    total_rows = len(materialized)
    target_rows = {split: total_rows * ratio for split, ratio in ratios.items()}
    current_rows = {split: 0 for split in ratios}

    grouped_items = list(groups.items())
    rng = random.Random(random_seed)
    rng.shuffle(grouped_items)
    grouped_items.sort(key=lambda item: len(item[1]))

    current_group_counts = {split: 0 for split in ratios}
    if len(grouped_items) >= len(ratios):
        for split_name in sorted(ratios, key=lambda split: (ratios[split], split)):
            _, seed_group_records = grouped_items.pop(0)
            split_map[split_name].extend(dict(record) for record in seed_group_records)
            current_rows[split_name] += len(seed_group_records)
            current_group_counts[split_name] += 1

    grouped_items.sort(key=lambda item: len(item[1]), reverse=True)

    for _, group_records in grouped_items:
        destination = max(
            ratios,
            key=lambda split: (target_rows[split] - current_rows[split], -current_rows[split]),
        )
        split_map[destination].extend(dict(record) for record in group_records)
        current_rows[destination] += len(group_records)
        current_group_counts[destination] += 1

    return split_map


def _stable_seed(base_seed: int, text: str) -> int:
    digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]
    return base_seed + int(digest, 16)
