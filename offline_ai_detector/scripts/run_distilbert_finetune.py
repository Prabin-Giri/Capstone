"""Fine-tune DistilBERT on a Hugging Face human vs AI code dataset (local or Colab).

Train:
  cd offline_ai_detector
  pip install -r requirements.txt
  python scripts/run_distilbert_finetune.py --output-dir ./ai-code-detector

Low RAM:
  python scripts/run_distilbert_finetune.py --low-ram --output-dir ./ai-code-detector

Predict:
  python scripts/run_distilbert_finetune.py --predict --model-dir ./ai-code-detector --code "def f(): return 1"
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.experiments.distilbert_hf_pipeline import (
    ALT_DATASET_ID,
    DEFAULT_DATASET_ID,
    PipelineConfig,
    load_predictor,
    run_finetune,
)
from src.utils.logging_utils import configure_logging


def _parse_langs(raw: str | None) -> list[str] | None:
    if not raw or raw.strip().lower() in ("", "none", "all"):
        return None
    return [x.strip().lower() for x in raw.split(",") if x.strip()]


def main() -> None:
    configure_logging()
    p = argparse.ArgumentParser(description="DistilBERT human vs AI code fine-tuning.")
    p.add_argument(
        "--predict",
        action="store_true",
        help="Score a single code string with a saved model (use --model-dir and --code).",
    )
    p.add_argument("--model-dir", type=str, help="Saved checkpoint directory (predict mode).")
    p.add_argument("--code", type=str, help="Code snippet (predict mode).")
    p.add_argument("--no-strip-comments", action="store_true", help="Skip comment stripping.")

    p.add_argument(
        "--dataset",
        default=DEFAULT_DATASET_ID,
        help=f"HF dataset id. Default: {DEFAULT_DATASET_ID}. Alt: {ALT_DATASET_ID}",
    )
    p.add_argument(
        "--output-dir",
        default="ai-code-detector",
        help="Where to save the model (train mode). Relative to current working directory.",
    )
    p.add_argument(
        "--languages",
        default="python,java",
        help='Comma-separated languages to keep, or "none" for all. Default: python,java.',
    )
    p.add_argument("--seed", type=int, default=42)
    p.add_argument(
        "--low-ram",
        action="store_true",
        help="Batch size 4 and gradient_accumulation_steps=4.",
    )
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--batch-size", type=int, default=16)

    args = p.parse_args()

    if args.predict:
        if not args.model_dir or args.code is None:
            p.error("--predict requires --model-dir and --code")
        predict = load_predictor(args.model_dir)
        prob = predict(args.code, strip_comments=not args.no_strip_comments)
        print(f"AI-likelihood: {prob:.2f}%")
        return

    out = Path(args.output_dir).resolve()
    cfg = PipelineConfig(
        dataset_id=args.dataset,
        output_dir=out,
        languages=_parse_langs(args.languages),
        seed=args.seed,
        low_ram=args.low_ram,
        num_epochs=args.epochs,
        batch_size=args.batch_size,
        strip_comments=not args.no_strip_comments,
    )
    metrics = run_finetune(cfg)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
