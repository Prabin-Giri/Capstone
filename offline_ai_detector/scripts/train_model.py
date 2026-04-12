"""Placeholder entry point for model training."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import load_train_config
from src.models.classifier import recommended_v1_classifier
from src.utils.logging_utils import configure_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the offline AI code detector.")
    parser.add_argument("--config", default="configs/train.yaml", help="Path to the training YAML config.")
    args = parser.parse_args()

    configure_logging()
    logger = logging.getLogger("train_model")
    config = load_train_config(PROJECT_ROOT / args.config)
    recommendation = recommended_v1_classifier()
    logger.info("Configured experiment: %s", config.project.experiment_name)
    logger.info("Current recommended baseline: %s", recommendation.model_name)
    logger.info("Phase 1 scaffold only: actual training begins in Phase 7 after dataset validation.")


if __name__ == "__main__":
    main()
