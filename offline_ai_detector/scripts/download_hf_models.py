"""One-time download of Hugging Face Hub weights into artifacts/models/pretrained/.

Requires network once; after that, training and inference use local_files_only.

Examples:
  python scripts/download_hf_models.py
  python scripts/download_hf_models.py --models codebert
  python scripts/download_hf_models.py --models smoke-detector
  python scripts/download_hf_models.py --all
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import cast

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.utils.hf_pretrained import (
    ModelKey,
    download_all_pretrained,
    download_pretrained_snapshot,
    hub_id_for,
    pretrained_dir_for,
)
from src.utils.logging_utils import configure_logging

_MODEL_CHOICES = ("codebert", "smoke-detector")


def main() -> None:
    configure_logging()
    logger = logging.getLogger("download_hf_models")

    parser = argparse.ArgumentParser(
        description="Download HF weights into artifacts/models/pretrained/ for offline use.",
    )
    parser.add_argument(
        "--models",
        default="codebert",
        help=f"Comma-separated keys (default: codebert). Choices: {', '.join(_MODEL_CHOICES)}.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Download every known pretrained snapshot (codebert + smoke-detector).",
    )
    args = parser.parse_args()

    if args.all:
        paths = download_all_pretrained(logger=logger)
        _print_summary(logger, paths)
        return

    keys = _parse_model_keys(args.models)
    paths: dict[ModelKey, Path] = {}
    for key in keys:
        logger.info("Hub id %s -> %s", hub_id_for(key), pretrained_dir_for(key))
        paths[key] = download_pretrained_snapshot(key, logger=logger)
    _print_summary(logger, paths)


def _parse_model_keys(raw: str) -> list[ModelKey]:
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        raise SystemExit("No model keys in --models")
    out: list[ModelKey] = []
    for p in parts:
        if p not in _MODEL_CHOICES:
            raise SystemExit(f"Unknown model key {p!r}. Use: {', '.join(_MODEL_CHOICES)}")
        out.append(cast(ModelKey, p))
    return out


def _print_summary(logger: logging.Logger, paths: dict[ModelKey, Path]) -> None:
    logger.info("")
    logger.info("=" * 60)
    logger.info("Download complete. Paths:")
    for key, path in paths.items():
        logger.info("  %s: %s", key, path)
    logger.info("")
    logger.info("Next steps:")
    logger.info("  Training (Phase 7): configs/train.yaml points at the codebert snapshot.")
    logger.info("  After training, inference uses outputs.model_dir (e.g. m1_code_detector_smoke).")
    logger.info("  Optional prose smoke model: configs/inference.yaml can point at smoke-detector path.")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
