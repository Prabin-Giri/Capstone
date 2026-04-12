"""Placeholder entry point for offline inference."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import load_inference_config
from src.models.inference import format_inference_response
from src.utils.logging_utils import configure_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Run offline AI code detector inference.")
    parser.add_argument("--config", default="configs/inference.yaml", help="Path to the inference YAML config.")
    parser.add_argument("--file", help="Path to a code file to score.")
    parser.add_argument("--text", help="Inline code snippet to score.")
    parser.add_argument("--language", help="Provided language label for later phases.")
    args = parser.parse_args()

    configure_logging()
    logging.getLogger("run_inference")
    load_inference_config(PROJECT_ROOT / args.config)

    payload = format_inference_response(
        language=args.language or "unknown",
        raw_score=None,
        calibrated_score=None,
        label="unclear",
        confidence_note="Phase 1 scaffold only: inference will be implemented in Phase 9.",
    )
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
