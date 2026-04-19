"""Download Hugging Face weights into artifacts for fully local training and inference.

Uses transformers + PyTorch only (no Inference API). One-time Hub download, then
set local_files_only in YAML configs.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

from ..paths import MODELS_DIR

PRETRAINED_ROOT = MODELS_DIR / "pretrained"

ModelKey = Literal["codebert", "smoke-detector"]

_SPECS: dict[ModelKey, dict[str, str]] = {
    "codebert": {
        "hub_id": "microsoft/codebert-base",
        "dirname": "microsoft-codebert-base",
    },
    "smoke-detector": {
        "hub_id": "Hello-SimpleAI/chatgpt-detector-roberta",
        "dirname": "hello-simpleai-chatgpt-detector-roberta",
    },
}


def pretrained_dir_for(key: ModelKey) -> Path:
    """Return the directory where a pretrained snapshot is stored."""

    return PRETRAINED_ROOT / _SPECS[key]["dirname"]


def hub_id_for(key: ModelKey) -> str:
    return _SPECS[key]["hub_id"]


def download_pretrained_snapshot(
    key: ModelKey,
    *,
    logger: logging.Logger | None = None,
) -> Path:
    """Download tokenizer + weights from the Hub and save under artifacts/models/pretrained/."""

    log = logger or logging.getLogger("hf_pretrained")
    try:
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
    except ImportError as exc:
        raise ImportError(
            "transformers and torch are required. Install: pip install -r requirements.txt"
        ) from exc

    spec = _SPECS[key]
    hub_id = spec["hub_id"]
    out_dir = PRETRAINED_ROOT / spec["dirname"]
    out_dir.mkdir(parents=True, exist_ok=True)

    log.info("Downloading tokenizer: %s", hub_id)
    tokenizer = AutoTokenizer.from_pretrained(hub_id)
    tokenizer.save_pretrained(str(out_dir))

    log.info("Downloading model weights: %s", hub_id)
    if key == "codebert":
        model = AutoModelForSequenceClassification.from_pretrained(hub_id, num_labels=2)
    else:
        model = AutoModelForSequenceClassification.from_pretrained(hub_id)
    model.save_pretrained(str(out_dir))

    cfg = out_dir / "config.json"
    if not cfg.is_file():
        raise RuntimeError(f"Expected config.json after save_pretrained; missing under {out_dir}")

    log.info("Saved pretrained snapshot to %s", out_dir)
    return out_dir


def download_all_pretrained(
    *,
    logger: logging.Logger | None = None,
) -> dict[ModelKey, Path]:
    """Download both Phase 7 baseline weights and the optional prose smoke classifier."""

    paths: dict[ModelKey, Path] = {}
    for key in _SPECS:
        paths[key] = download_pretrained_snapshot(key, logger=logger)
    return paths
