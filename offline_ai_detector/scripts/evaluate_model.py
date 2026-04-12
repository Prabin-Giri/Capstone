"""Evaluate a saved Phase 7 model on a processed split."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import load_train_config
from src.models.evaluation import required_metric_names
from src.models.training import evaluate_saved_model
from src.utils.logging_utils import configure_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the offline AI code detector.")
    parser.add_argument("--config", default="configs/train.yaml", help="Path to the training YAML config.")
    parser.add_argument(
        "--split",
        default="test",
        choices=("train", "validation", "test"),
        help="Which processed split to evaluate.",
    )
    args = parser.parse_args()

    configure_logging()
    logger = logging.getLogger("evaluate_model")
    config = load_train_config(PROJECT_ROOT / args.config)
    logger.info("Report directory: %s", config.outputs.report_dir)
    logger.info("Planned metrics: %s", ", ".join(required_metric_names()))
    result = evaluate_saved_model(config, split_name=args.split)
    logger.info("%s split metrics: %s", args.split, result.metrics)


if __name__ == "__main__":
    main()
