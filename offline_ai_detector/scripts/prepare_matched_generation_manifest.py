"""Build a manifest for matched AI-code generation experiments.

This supports NEXT_STEPS item #1 by creating a reproducible list of
problem_id/language anchors from human submissions. The manifest can be used to
generate AI solutions for the same problems with controlled prompt styles.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.models.dataset import approximate_code_token_count
from src.utils.io import read_jsonl, write_jsonl


DEFAULT_PROMPT_STYLES = [
    "terse",
    "rubric_guided",
    "stepwise_reasoning_style",
    "minimal_explanation",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare a matched problem-generation manifest.")
    parser.add_argument(
        "--inputs",
        nargs="+",
        default=[
            "data/processed/train.jsonl",
            "data/processed/val.jsonl",
            "data/processed/test.jsonl",
        ],
        help="Processed dataset files to scan for human problem anchors.",
    )
    parser.add_argument(
        "--output",
        default="data/interim/matched_generation_manifest.jsonl",
        help="Where to write the generation manifest JSONL.",
    )
    parser.add_argument(
        "--max-problems-per-language",
        type=int,
        default=2000,
        help="Maximum number of unique problems per language to include.",
    )
    parser.add_argument(
        "--min-token-count",
        type=int,
        default=50,
        help="Minimum token-ish count for reference human snippets.",
    )
    args = parser.parse_args()

    manifest_rows = build_generation_manifest(
        input_paths=[PROJECT_ROOT / item for item in args.inputs],
        max_problems_per_language=max(args.max_problems_per_language, 1),
        min_token_count=max(args.min_token_count, 1),
    )
    output_path = PROJECT_ROOT / args.output
    write_jsonl(output_path, manifest_rows)
    print(f"Wrote {len(manifest_rows)} manifest rows to {output_path}")


def build_generation_manifest(
    *,
    input_paths: list[Path],
    max_problems_per_language: int,
    min_token_count: int,
) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for path in input_paths:
        if not path.exists():
            continue
        for row in read_jsonl(path):
            label = str(row.get("label", "")).strip().lower()
            language = str(row.get("language", "")).strip().lower()
            problem_id = _optional_str(row.get("problem_id"))
            code = str(row.get("code", "") or "")
            if label != "human":
                continue
            if language not in {"python", "java"}:
                continue
            if not problem_id:
                continue
            token_count = approximate_code_token_count(code)
            if token_count < min_token_count:
                continue
            grouped[(language, problem_id)].append(row)

    rows: list[dict[str, Any]] = []
    per_language_count = {"python": 0, "java": 0}
    for language, problem_id in sorted(grouped):
        if per_language_count[language] >= max_problems_per_language:
            continue
        samples = grouped[(language, problem_id)]
        reference = sorted(
            samples,
            key=lambda row: approximate_code_token_count(str(row.get("code", "") or "")),
            reverse=True,
        )[0]
        rows.append(
            {
                "manifest_id": f"{language}:{problem_id}",
                "language": language,
                "problem_id": problem_id,
                "reference_sample_id": str(reference.get("id", "")),
                "reference_source_dataset": str(reference.get("source_dataset", "")),
                "reference_token_count": approximate_code_token_count(str(reference.get("code", "") or "")),
                "prompt_styles": DEFAULT_PROMPT_STYLES,
                "generation_target_count": 4,
                "notes": "Generate AI solutions for the same problem_id to reduce task mismatch.",
            }
        )
        per_language_count[language] += 1
    return rows


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


if __name__ == "__main__":
    main()
