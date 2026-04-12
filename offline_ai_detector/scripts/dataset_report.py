"""Generate the pre-training dataset report and fail on unsafe conditions."""

from __future__ import annotations

import argparse
from collections import Counter
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import load_data_config
from src.data.dedup import code_text_hash
from src.data.splitting import choose_group_key, summarize_splits
from src.utils.io import read_jsonl, write_text


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate dataset report and validate split safety.")
    parser.add_argument("--config", default="configs/data.yaml", help="Path to the data YAML config.")
    args = parser.parse_args()

    config = load_data_config(PROJECT_ROOT / args.config)
    split_map = {
        "train": read_jsonl(config.outputs.train_path),
        "validation": read_jsonl(config.outputs.validation_path),
        "test": read_jsonl(config.outputs.test_path),
    }
    summary = summarize_splits(split_map)
    validation_errors = validate_split_health(split_map, max_imbalance_pct=config.merge.max_imbalance_pct)
    report = render_dataset_report(summary, split_map, validation_errors)
    write_text(config.outputs.report_path, report)

    if validation_errors:
        raise SystemExit("Dataset report validation failed:\n" + "\n".join(f"- {error}" for error in validation_errors))


def validate_split_health(split_map: dict[str, list[dict]], *, max_imbalance_pct: float) -> list[str]:
    errors: list[str] = []
    combined = split_map["train"] + split_map["validation"] + split_map["test"]
    if not combined:
        return ["no split records were found"]

    label_counts = Counter(record["label"] for record in combined)
    language_counts = Counter(record["language"] for record in combined)
    if _imbalance_pct(label_counts) > max_imbalance_pct:
        errors.append(f"class imbalance exceeds {max_imbalance_pct:.1f}%")
    if _imbalance_pct(language_counts) > max_imbalance_pct:
        errors.append(f"language imbalance exceeds {max_imbalance_pct:.1f}%")

    split_hashes = {
        split_name: {code_text_hash(record["code"]) for record in records}
        for split_name, records in split_map.items()
    }
    split_groups = {
        split_name: {choose_group_key(record) for record in records}
        for split_name, records in split_map.items()
    }
    if split_hashes["train"] & split_hashes["validation"]:
        errors.append("duplicates detected across train and validation splits")
    if split_hashes["train"] & split_hashes["test"]:
        errors.append("duplicates detected across train and test splits")
    if split_hashes["validation"] & split_hashes["test"]:
        errors.append("duplicates detected across validation and test splits")
    if split_groups["train"] & split_groups["validation"]:
        errors.append("group leakage detected across train and validation splits")
    if split_groups["train"] & split_groups["test"]:
        errors.append("group leakage detected across train and test splits")
    if split_groups["validation"] & split_groups["test"]:
        errors.append("group leakage detected across validation and test splits")
    return errors


def render_dataset_report(summary: dict[str, dict], split_map: dict[str, list[dict]], validation_errors: list[str]) -> str:
    combined = split_map["train"] + split_map["validation"] + split_map["test"]
    combined_source_counts = Counter(record["source_dataset"] for record in combined)
    combined_problem_counts = Counter(record.get("problem_id") for record in combined if record.get("problem_id"))
    combined_hashes = [code_text_hash(record["code"]) for record in combined]
    duplicate_rate = (len(combined_hashes) - len(set(combined_hashes))) / len(combined_hashes) if combined_hashes else 0.0
    combined_avg_token_length = (
        sum(len(str(record["code"]).split()) for record in combined) / len(combined)
        if combined
        else 0.0
    )

    split_sections = []
    for split_name, split_summary in summary.items():
        split_sections.append(
            f"""## {split_name.title()} Split

- Total samples: {split_summary['total_samples']}
- Language counts: {split_summary['language_counts']}
- Label counts: {split_summary['label_counts']}
- Average token length: {split_summary['average_token_length']:.2f}
- Source dataset counts: {split_summary['source_dataset_counts']}
"""
        )

    issues = "\n".join(f"- {error}" for error in validation_errors) or "- none"
    return f"""# Dataset Report

- Total samples: {len(combined)}
- Samples per language: {dict(Counter(record['language'] for record in combined))}
- Samples per label: {dict(Counter(record['label'] for record in combined))}
- Average code length (tokens): {combined_avg_token_length:.2f}
- Distinct problem_ids: {len(combined_problem_counts)}
- Duplicate rate: {duplicate_rate:.4f}
- Source dataset proportions: {dict(combined_source_counts)}

## Validation Checks

{issues}

## Problem ID Distribution

- Top problem IDs: {combined_problem_counts.most_common(10)}

{chr(10).join(split_sections)}
"""


def _imbalance_pct(counts: Counter[str]) -> float:
    if not counts:
        return 0.0
    values = list(counts.values())
    if len(values) <= 1:
        return 0.0
    return ((max(values) - min(values)) / max(values)) * 100.0


if __name__ == "__main__":
    main()
