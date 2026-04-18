"""Evaluate a saved Phase 7 model on a processed split."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import load_train_config
from src.models.evaluation import build_phase10_evaluation_report, required_metric_names
from src.models.training import evaluate_saved_model
from src.utils.io import write_text
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
    parser.add_argument(
        "--max-error-examples",
        type=int,
        default=5,
        help="Maximum false-positive/false-negative examples to include in the Phase 10 report.",
    )
    parser.add_argument(
        "--skip-phase10-report",
        action="store_true",
        help="Only print aggregate metrics and skip writing the Phase 10 report artifacts.",
    )
    args = parser.parse_args()

    configure_logging()
    logger = logging.getLogger("evaluate_model")
    config = load_train_config(PROJECT_ROOT / args.config)
    logger.info("Report directory: %s", config.outputs.report_dir)
    logger.info("Planned metrics: %s", ", ".join(required_metric_names()))
    result = evaluate_saved_model(
        config,
        split_name=args.split,
        include_prediction_rows=not args.skip_phase10_report,
    )
    prediction_rows = result.pop("prediction_rows", [])
    logger.info("%s split metrics: %s", args.split, result)

    if args.skip_phase10_report:
        return

    report_text, summary_payload = build_phase10_evaluation_report(
        split_name=args.split,
        metrics=result,
        prediction_rows=prediction_rows,
        max_error_examples=max(args.max_error_examples, 0),
    )
    report_path, summary_path = _phase10_report_paths(config.outputs.report_dir, split_name=args.split)
    write_text(report_path, report_text)
    write_text(summary_path, json.dumps(summary_payload, indent=2))
    logger.info("Wrote Phase 10 markdown report: %s", report_path)
    logger.info("Wrote Phase 10 summary JSON: %s", summary_path)


def _phase10_report_paths(report_dir: Path, *, split_name: str) -> tuple[Path, Path]:
    if split_name == "test":
        return (
            report_dir / "phase10_evaluation_report.md",
            report_dir / "phase10_evaluation_summary.json",
        )
    return (
        report_dir / f"phase10_{split_name}_evaluation_report.md",
        report_dir / f"phase10_{split_name}_evaluation_summary.json",
    )


if __name__ == "__main__":
    main()
