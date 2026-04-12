"""Split the merged dataset into leakage-aware train/validation/test files."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import load_data_config
from src.data.splitting import split_records_by_bucket, summarize_splits
from src.utils.io import read_jsonl, write_jsonl
from src.utils.logging_utils import configure_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Split merged dataset into train/validation/test.")
    parser.add_argument("--config", default="configs/data.yaml", help="Path to the data YAML config.")
    args = parser.parse_args()

    configure_logging()
    logger = logging.getLogger("split_dataset")
    config = load_data_config(PROJECT_ROOT / args.config)

    merged_records = read_jsonl(config.outputs.merged_dataset_path)
    supplemental_records = read_jsonl(config.outputs.supplemental_eval_path)
    combined = merged_records + supplemental_records

    split_map = split_records_by_bucket(
        combined,
        train_ratio=config.merge.train_ratio,
        validation_ratio=config.merge.validation_ratio,
        test_ratio=config.merge.test_ratio,
        random_seed=config.merge.random_seed,
        supplemental_eval_sources=config.merge.supplemental_eval_sources,
    )

    write_jsonl(config.outputs.train_path, split_map["train"])
    write_jsonl(config.outputs.validation_path, split_map["validation"])
    write_jsonl(config.outputs.test_path, split_map["test"])

    summary = summarize_splits(split_map)
    logger.info(
        "wrote splits: train=%d validation=%d test=%d",
        len(split_map["train"]),
        len(split_map["validation"]),
        len(split_map["test"]),
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
