"""Build the leakage-safe merged dataset from cleaned interim sources."""

from __future__ import annotations

import argparse
from dataclasses import asdict
import json
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import load_data_config
from src.data.dedup import deduplicate_records
from src.data.splitting import compute_scaled_bucket_targets, sample_bucket_records, summarize_bucket_counts
from src.utils.io import read_jsonl, write_jsonl
from src.utils.logging_utils import configure_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the merged processed dataset.")
    parser.add_argument("--config", default="configs/data.yaml", help="Path to the data YAML config.")
    args = parser.parse_args()

    configure_logging()
    logger = logging.getLogger("build_dataset")
    config = load_data_config(PROJECT_ROOT / args.config)

    primary_sources = list(config.merge.primary_human_sources) + list(config.merge.primary_ai_sources)
    supplemental_sources = list(config.merge.supplemental_eval_sources)
    source_priority = primary_sources + supplemental_sources

    loaded_records: list[dict] = []
    for source_name in source_priority:
        path = config.outputs.interim_dir / f"{source_name}_clean.jsonl"
        records = read_jsonl(path)
        loaded_records.extend(records)
        logger.info("%s: loaded %d interim rows from %s", source_name, len(records), path)

    deduped_records, dedup_summary = deduplicate_records(loaded_records, source_priority=source_priority)
    logger.info(
        "dedup summary: input=%d output=%d dropped_exact=%d dropped_conflicting=%d conflicting_hashes=%d",
        dedup_summary.input_count,
        dedup_summary.output_count,
        dedup_summary.dropped_exact_duplicates,
        dedup_summary.dropped_conflicting_duplicates,
        dedup_summary.conflicting_hashes,
    )

    primary_records = [record for record in deduped_records if record["source_dataset"] in primary_sources]
    supplemental_records = [record for record in deduped_records if record["source_dataset"] in supplemental_sources]

    available_counts = summarize_bucket_counts(primary_records)
    bucket_plans, scale_factor = compute_scaled_bucket_targets(
        available_counts,
        config.merge.target_counts_per_bucket,
    )
    logger.info("effective scale factor for target buckets: %.4f", scale_factor)

    merged_records: list[dict] = []
    for bucket_name, plan in bucket_plans.items():
        bucket_language, bucket_label = bucket_name.split("_", 1)
        bucket_records = [
            record
            for record in primary_records
            if record["language"] == bucket_language and record["label"] == bucket_label
        ]
        sampled = sample_bucket_records(
            bucket_records,
            target_count=plan.target_count,
            source_priority=source_priority,
            random_seed=config.merge.random_seed,
        )
        merged_records.extend(sampled)
        logger.info(
            "%s: available=%d target=%d sampled=%d",
            bucket_name,
            plan.available_count,
            plan.target_count,
            len(sampled),
        )

    write_jsonl(config.outputs.merged_dataset_path, merged_records)
    write_jsonl(config.outputs.supplemental_eval_path, supplemental_records)

    summary = {
        "dedup_summary": asdict(dedup_summary),
        "available_bucket_counts": available_counts,
        "effective_bucket_targets": {
            bucket: {"available_count": plan.available_count, "target_count": plan.target_count}
            for bucket, plan in bucket_plans.items()
        },
        "merged_count": len(merged_records),
        "supplemental_eval_count": len(supplemental_records),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
