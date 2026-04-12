"""Normalize each dataset source and save cleaned interim JSONL files."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import load_data_config
from src.data.loaders import clean_dataset_source, render_report_markdown
from src.utils.logging_utils import configure_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean raw datasets into interim JSONL files.")
    parser.add_argument("--config", default="configs/data.yaml", help="Path to the data YAML config.")
    args = parser.parse_args()

    configure_logging()
    logger = logging.getLogger("clean_datasets")
    config = load_data_config(PROJECT_ROOT / args.config)

    config.outputs.interim_dir.mkdir(parents=True, exist_ok=True)
    config.outputs.source_report_dir.mkdir(parents=True, exist_ok=True)

    for name, source in config.datasets.items():
        if not source.enabled:
            logger.info("Skipping disabled dataset source: %s", name)
            continue

        output_path = config.outputs.interim_dir / f"{name}_clean.jsonl"
        result = clean_dataset_source(
            name,
            root_dir=source.root_dir,
            allowed_languages=config.filters.languages,
            output_path=output_path,
            min_tokens_warn=config.filters.min_tokens,
            cleaning_options={
                "normalize_line_endings": config.cleaning.normalize_line_endings,
                "strip_trailing_spaces": config.cleaning.strip_trailing_spaces,
                "expand_tabs": config.cleaning.expand_tabs,
                "tab_width": config.cleaning.tab_width,
                "trim_terminal_blank_lines": config.cleaning.trim_terminal_blank_lines,
                "preserve_comments": config.cleaning.preserve_comments,
            },
        )
        report_path = config.outputs.source_report_dir / f"{name}_inspection.md"
        report_path.write_text(render_report_markdown(result.report), encoding="utf-8")
        logger.info("%s: wrote %d cleaned rows to %s", name, len(result.frame), output_path)


if __name__ == "__main__":
    main()
