"""Offline AI code detector — Phase 9 inference CLI.

Usage examples:
  python scripts/run_inference.py --file sample.py
  python scripts/run_inference.py --file Main.java
  python scripts/run_inference.py --text "def foo(): pass" --language python
  python scripts/run_inference.py --file sample.py --features
  python scripts/run_inference.py --file sample.py --output-format pretty

Safeguards:
  - rejects unsupported languages (only python and java)
  - warns if model checkpoint or calibration artifact is missing
  - warns on very short submissions
  - warns when code was truncated to fit the model's max sequence length
  - never presents output as proof of AI authorship
  - all language detection from file extension is explicit and overridable
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

from src.config import load_inference_config
from src.models.inference import (
    LIKELY_AI,
    LIKELY_HUMAN,
    UNCLEAR,
    _detect_language_from_extension,
    validate_inference_artifacts,
    run_single_inference,
)
from src.utils.logging_utils import configure_logging

# Languages the detector was trained on.
SUPPORTED_LANGUAGES = {"python", "java"}

# Minimum token-ish count below which a short-code warning is printed before
# inference even begins (complementary to the post-inference confidence note).
SHORT_CODE_WARN_THRESHOLD = 30


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Offline AI code detector. Scores a Python or Java code submission "
            "and returns a conservative human vs AI-written signal."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python scripts/run_inference.py --file sample.py\n"
            "  python scripts/run_inference.py --file Main.java\n"
            "  python scripts/run_inference.py --text 'def foo(): pass' --language python\n"
            "  python scripts/run_inference.py --file sample.py --features\n"
            "  python scripts/run_inference.py --file sample.py --output-format pretty\n"
        ),
    )
    parser.add_argument(
        "--config",
        default="configs/inference.yaml",
        help="Path to the inference YAML config (default: configs/inference.yaml).",
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--file",
        metavar="PATH",
        help="Path to a .py or .java source file to score.",
    )
    source.add_argument(
        "--text",
        metavar="CODE",
        help="Inline code string to score. Requires --language.",
    )
    parser.add_argument(
        "--language",
        metavar="LANG",
        choices=list(SUPPORTED_LANGUAGES),
        help=(
            "Override the detected language. Required when using --text. "
            "Choices: python, java."
        ),
    )
    parser.add_argument(
        "--features",
        action="store_true",
        default=False,
        help="Include lightweight code feature values in the output.",
    )
    parser.add_argument(
        "--output-format",
        choices=["json", "pretty"],
        default="pretty",
        help="Output format: 'pretty' (human-readable) or 'json' (machine-readable). Default: pretty.",
    )
    return parser.parse_args()


def _resolve_language(
    *,
    file_path: Path | None,
    explicit_language: str | None,
    logger: logging.Logger,
) -> str:
    """Determine the language to use, failing loudly on unsupported ones."""
    if explicit_language is not None:
        lang = explicit_language.strip().lower()
        if lang not in SUPPORTED_LANGUAGES:
            logger.error(
                "Unsupported language: %s. Supported: %s",
                lang,
                ", ".join(sorted(SUPPORTED_LANGUAGES)),
            )
            sys.exit(1)
        return lang

    if file_path is not None:
        detected = _detect_language_from_extension(file_path)
        if detected is not None:
            logger.info("Detected language from file extension: %s", detected)
            return detected
        logger.error(
            "Could not detect language from extension '%s'. "
            "Use --language to specify it explicitly.",
            file_path.suffix,
        )
        sys.exit(1)

    logger.error("--language is required when using --text.")
    sys.exit(1)


def _load_code(
    *,
    file_path: Path | None,
    text: str | None,
    logger: logging.Logger,
) -> str:
    if file_path is not None:
        if not file_path.exists():
            logger.error("File not found: %s", file_path)
            sys.exit(1)
        try:
            code = file_path.read_text(encoding="utf-8")
        except OSError as exc:
            logger.error("Could not read file %s: %s", file_path, exc)
            sys.exit(1)
        logger.info("Loaded %d characters from %s", len(code), file_path)
        return code
    # text is guaranteed non-None here by argparse mutual exclusion
    assert text is not None
    return text


def _print_pretty(result_dict: dict) -> None:
    """Print a human-readable inference report."""
    label = result_dict.get("label", UNCLEAR)
    lang = result_dict.get("language", "unknown")
    raw = result_dict.get("raw_score")
    cal = result_dict.get("calibrated_score")
    note = result_dict.get("confidence_note", "")
    thresholds = result_dict.get("thresholds", {})
    trunc_warning = result_dict.get("truncation_warning")
    features = result_dict.get("features")
    feature_notes = result_dict.get("feature_notes")

    label_display = {
        LIKELY_HUMAN: "✅  likely human",
        LIKELY_AI:    "⚠️   likely AI-written",
        UNCLEAR:      "🔍  unclear",
    }.get(label, label)

    print()
    print("=" * 60)
    print("  AI Code Detector — Offline Inference Report")
    print("=" * 60)
    print(f"  Language         : {lang}")
    print(f"  Result           : {label_display}")
    print()
    if raw is not None:
        print(f"  Raw score        : {raw:.4f}")
    else:
        print("  Raw score        : n/a")
    if cal is not None:
        print(f"  Calibrated score : {cal:.4f}")
    else:
        print("  Calibrated score : n/a (no calibration artifact loaded)")
    if thresholds:
        print(f"  Thresholds       : lower={thresholds.get('lower', '?'):.2f}  upper={thresholds.get('upper', '?'):.2f}")
    print()
    print("  Confidence note:")
    # Wrap the note at ~56 chars for readability
    for chunk in _wrap(note, 56):
        print(f"    {chunk}")
    if trunc_warning:
        print()
        print("  ⚠ Truncation warning:")
        for chunk in _wrap(trunc_warning, 56):
            print(f"    {chunk}")
    if features:
        print()
        print("  Code features:")
        for key, val in features.items():
            print(f"    {key:<36} {val:.4f}")
    if feature_notes:
        print()
        print("  Feature caveats:")
        for note_item in feature_notes:
            for chunk in _wrap(note_item, 56):
                print(f"    • {chunk}")
    print()
    print("  IMPORTANT: This output is a review signal only.")
    print("  Do not use it as proof of AI authorship.")
    print("=" * 60)
    print()


def _wrap(text: str, width: int) -> list[str]:
    """Very simple word-wrap for the pretty printer."""
    words = text.split()
    lines: list[str] = []
    current: list[str] = []
    length = 0
    for word in words:
        if length + len(word) + (1 if current else 0) > width:
            lines.append(" ".join(current))
            current = [word]
            length = len(word)
        else:
            current.append(word)
            length += len(word) + (1 if len(current) > 1 else 0)
    if current:
        lines.append(" ".join(current))
    return lines if lines else [""]


def main() -> None:
    args = _parse_args()
    configure_logging()
    logger = logging.getLogger("run_inference")

    # Load inference config
    config_path = PROJECT_ROOT / args.config
    if not config_path.exists():
        logger.error("Inference config not found: %s", config_path)
        sys.exit(1)
    config = load_inference_config(config_path)

    # Resolve input code
    file_path = Path(args.file) if args.file else None
    code = _load_code(file_path=file_path, text=args.text, logger=logger)

    # Resolve language
    language = _resolve_language(
        file_path=file_path,
        explicit_language=args.language,
        logger=logger,
    )

    # Guard: language must be in the allowlist from config
    allowlist = config.runtime.language_allowlist
    if allowlist is not None and language not in allowlist:
        logger.error(
            "Language '%s' is not in the configured allowlist %s. "
            "Update inference.yaml or use a supported language.",
            language,
            allowlist,
        )
        sys.exit(1)

    # Guard: warn on very short submitted code
    stripped = code.strip()
    if len(stripped.split()) < SHORT_CODE_WARN_THRESHOLD:
        logger.warning(
            "The submitted code is very short (%d words). "
            "Detection confidence will be reduced.",
            len(stripped.split()),
        )
        if not stripped:
            logger.error("Submitted code is empty. Aborting.")
            sys.exit(1)

    # Guard: validate model/calibration artifacts exist before importing torch
    try:
        validate_inference_artifacts(
            model_dir=config.runtime.model_dir,
            calibration_path=config.runtime.calibration_path,
        )
    except FileNotFoundError as exc:
        logger.error("%s", exc)
        sys.exit(1)

    logger.info(
        "Running inference: language=%s  model=%s  max_length=%d",
        language,
        config.runtime.model_dir,
        config.runtime.max_length,
    )

    # Run inference
    try:
        result = run_single_inference(
            code=code,
            language=language,
            model_dir=config.runtime.model_dir,
            calibration_path=config.runtime.calibration_path,
            lower_threshold=config.thresholds.lower,
            upper_threshold=config.thresholds.upper,
            max_length=config.runtime.max_length,
            min_tokens=config.runtime.min_tokens,
            local_files_only=config.runtime.local_files_only,
            include_features=args.features,
        )
    except FileNotFoundError as exc:
        logger.error("Artifact not found during inference: %s", exc)
        sys.exit(1)
    except ImportError as exc:
        logger.error("Missing dependency: %s", exc)
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        logger.error("Inference failed unexpectedly: %s", exc, exc_info=True)
        sys.exit(1)

    response = result.to_response_dict()

    if args.output_format == "json":
        print(json.dumps(response, indent=2))
    else:
        _print_pretty(response)


if __name__ == "__main__":
    main()
