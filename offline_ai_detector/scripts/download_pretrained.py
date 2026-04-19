"""Backward-compatible entry point: downloads the optional prose smoke classifier.

Prefer scripts/download_hf_models.py for new setups (codebert + optional smoke).

This wrapper only fetches Hello-SimpleAI/chatgpt-detector-roberta into
artifacts/models/pretrained/hello-simpleai-chatgpt-detector-roberta
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.utils.hf_pretrained import download_pretrained_snapshot
from src.utils.logging_utils import configure_logging


def main() -> None:
    configure_logging()
    logger = logging.getLogger("download_pretrained")
    logger.warning(
        "download_pretrained.py is deprecated; use: python scripts/download_hf_models.py --models smoke-detector"
    )
    download_pretrained_snapshot("smoke-detector", logger=logger)
    logger.info("Done. Snapshot path: artifacts/models/pretrained/hello-simpleai-chatgpt-detector-roberta")


if __name__ == "__main__":
    main()
