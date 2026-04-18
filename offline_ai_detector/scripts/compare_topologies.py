"""Compare evaluation summaries across model topologies.

Intended for NEXT_STEPS item #5:
- joint Python+Java model
- Python-only model
- Java-only model
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.utils.io import write_text


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare model topology evaluation summaries.")
    parser.add_argument(
        "--summary",
        action="append",
        required=True,
        help="Topology summary pair in the form topology_name=path/to/summary.json. Repeat this flag.",
    )
    parser.add_argument(
        "--output",
        default="artifacts/reports/topology_comparison_report.md",
        help="Output markdown report path.",
    )
    args = parser.parse_args()

    topology_payloads = _parse_topology_inputs(args.summary)
    report = build_topology_comparison_report(topology_payloads)
    output_path = PROJECT_ROOT / args.output
    write_text(output_path, report)
    print(f"Wrote topology comparison report to {output_path}")


def build_topology_comparison_report(topology_payloads: dict[str, dict[str, Any]]) -> str:
    lines = [
        "# Model Topology Comparison Report",
        "",
        "This report compares Phase 10 summaries across topology variants.",
        "",
        "## Overall comparison",
        "",
        "| Topology | Split | Samples | Accuracy | Precision | Recall | F1 | FPR | FNR |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for topology_name in sorted(topology_payloads):
        payload = topology_payloads[topology_name]
        overall = payload.get("overall_metrics", {})
        split_name = str(payload.get("split_name", "unknown"))
        lines.append(
            f"| `{topology_name}` | `{split_name}` | {int(overall.get('sample_count', 0))} | "
            f"{_fmt(overall.get('accuracy'))} | {_fmt(overall.get('precision'))} | {_fmt(overall.get('recall'))} | "
            f"{_fmt(overall.get('f1'))} | {_fmt(overall.get('false_positive_rate'))} | {_fmt(overall.get('false_negative_rate'))} |"
        )
    lines.append("")

    lines.extend(
        [
            "## Per-language F1",
            "",
            "| Topology | Python F1 | Java F1 |",
            "|---|---:|---:|",
        ]
    )
    for topology_name in sorted(topology_payloads):
        per_language = topology_payloads[topology_name].get("per_language_metrics", {})
        python_f1 = _fmt((per_language.get("python") or {}).get("f1"))
        java_f1 = _fmt((per_language.get("java") or {}).get("f1"))
        lines.append(f"| `{topology_name}` | {python_f1} | {java_f1} |")
    lines.append("")

    lines.extend(
        [
            "## Robustness slice F1",
            "",
            "| Topology | Paraphrased AI | Edited AI | Hybrid candidate | Raw AI baseline |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for topology_name in sorted(topology_payloads):
        slices = topology_payloads[topology_name].get("robustness_slice_metrics", {})
        lines.append(
            f"| `{topology_name}` | {_fmt((slices.get('paraphrased_ai') or {}).get('f1'))} | "
            f"{_fmt((slices.get('edited_ai') or {}).get('f1'))} | {_fmt((slices.get('hybrid_candidate') or {}).get('f1'))} | "
            f"{_fmt((slices.get('raw_ai_baseline') or {}).get('f1'))} |"
        )
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _parse_topology_inputs(items: list[str]) -> dict[str, dict[str, Any]]:
    parsed: dict[str, dict[str, Any]] = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"Expected topology input in name=path form, got: {item!r}")
        topology_name, path_text = item.split("=", 1)
        topology_name = topology_name.strip()
        path = (PROJECT_ROOT / path_text.strip()).resolve()
        if not topology_name:
            raise ValueError(f"Topology name is empty in input: {item!r}")
        if not path.exists():
            raise FileNotFoundError(f"Summary file not found for topology '{topology_name}': {path}")
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError(f"Expected JSON object in {path}")
        parsed[topology_name] = payload
    return parsed


def _fmt(value: Any) -> str:
    if value is None:
        return "n/a"
    return f"{float(value):.4f}"


if __name__ == "__main__":
    main()
