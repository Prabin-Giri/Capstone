"""Entry point for Phase 7 baseline training."""

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
from src.models.training import run_training, training_plan_notes
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
    logger.info("Why this baseline: %s", recommendation.reason)
    for note in training_plan_notes():
        logger.info("Training note: %s", note)

    artifacts = run_training(config)
    logger.info("Training complete. Model saved to %s", artifacts.model_dir)
    logger.info("Validation F1: %s", artifacts.validation_metrics.get("f1"))
    logger.info("Test F1: %s", artifacts.test_metrics.get("f1"))
    logger.info("Training report written to %s", artifacts.report_path)


if __name__ == "__main__":
    main()
