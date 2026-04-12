"""Placeholder entry point for calibration."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import load_train_config
from src.models.calibration import supported_calibration_methods
from src.utils.logging_utils import configure_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate offline AI code detector probabilities.")
    parser.add_argument("--config", default="configs/train.yaml", help="Path to the training YAML config.")
    args = parser.parse_args()

    configure_logging()
    logger = logging.getLogger("calibrate_model")
    config = load_train_config(PROJECT_ROOT / args.config)
    logger.info("Calibration enabled in config: %s", config.calibration.enabled)
    logger.info("Supported calibration methods: %s", ", ".join(supported_calibration_methods()))
    logger.info("Phase 1 scaffold only: calibration logic is deferred to Phase 8.")


if __name__ == "__main__":
    main()
