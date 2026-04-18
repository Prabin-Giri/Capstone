"""One-time setup script: download a pretrained AI/human text classifier and
save it as a local checkpoint so offline_ai_detector/scripts/run_inference.py
can use it without any external API calls.

Model used: Hello-SimpleAI/chatgpt-detector-roberta
- Free, no API key
- Binary classifier: LABEL_0 = human, LABEL_1 = AI-generated
- Downloads ~480 MB of weights once, then runs 100% offline

Run this ONCE on the server after setting up the venv:

    cd /home/ubuntu/Capstone/offline_ai_detector
    source .venv/bin/activate
    python scripts/download_pretrained.py

After it completes, run_inference.py will work immediately.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.utils.logging_utils import configure_logging

MODEL_HUB_NAME = "Hello-SimpleAI/chatgpt-detector-roberta"

# Must match the model_dir in configs/inference.yaml
CHECKPOINT_DIR = PROJECT_ROOT / "artifacts" / "models" / "m1_code_detector_smoke"

# A minimal calibration stub so run_inference.py does not error on load.
# We set calibration_path: null in inference.yaml, but write one here anyway
# in case someone re-enables it later.
CALIBRATION_STUB = {
    "method": "temperature_scaling",
    "parameters": {"temperature": 1.0},
    "validation_metrics_raw": {},
    "validation_metrics_calibrated": {},
    "threshold_recommendation": {"lower": 0.35, "upper": 0.65, "risk_target": 0.05},
    "threshold_sweep": [],
    "calibration_diagnostics": {
        "raw_brier": None,
        "calibrated_brier": None,
        "raw_ece": None,
        "calibrated_ece": None,
    },
}


def main() -> None:
    configure_logging()
    logger = logging.getLogger("download_pretrained")

    try:
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
    except ImportError:
        logger.error(
            "transformers is not installed. Run: pip install transformers torch"
        )
        sys.exit(1)

    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Saving checkpoint to: %s", CHECKPOINT_DIR)
    logger.info("Downloading tokenizer from HuggingFace: %s", MODEL_HUB_NAME)
    logger.info("(First run downloads ~480 MB — this will take a few minutes)")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_HUB_NAME)
    tokenizer.save_pretrained(str(CHECKPOINT_DIR))
    logger.info("Tokenizer saved.")

    logger.info("Downloading model weights from HuggingFace: %s", MODEL_HUB_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_HUB_NAME)
    model.save_pretrained(str(CHECKPOINT_DIR))
    logger.info("Model weights saved.")

    # Write calibration stub (temperature = 1.0 = identity transform)
    calib_path = CHECKPOINT_DIR / "calibration.json"
    calib_path.write_text(json.dumps(CALIBRATION_STUB, indent=2), encoding="utf-8")
    logger.info("Calibration stub written to: %s", calib_path)

    # Verify the config.json exists (what validate_inference_artifacts checks)
    config_file = CHECKPOINT_DIR / "config.json"
    if config_file.exists():
        logger.info("config.json present — checkpoint is valid.")
    else:
        logger.error(
            "config.json was NOT created. This is unexpected. "
            "Try manually running model.save_pretrained() in a Python shell."
        )
        sys.exit(1)

    logger.info("")
    logger.info("=" * 60)
    logger.info("Download complete. The detector is ready to use.")
    logger.info("Test it with:")
    logger.info(
        "  python scripts/run_inference.py "
        '--text "def foo(): return 1" --language python'
    )
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
