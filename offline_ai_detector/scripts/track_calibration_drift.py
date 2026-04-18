"""Track calibration and threshold drift between two detector runs."""

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
    parser = argparse.ArgumentParser(description="Track calibration drift between two calibration artifacts.")
    parser.add_argument("--baseline-calibration", required=True, help="Path to the baseline calibration JSON.")
    parser.add_argument("--candidate-calibration", required=True, help="Path to the newer calibration JSON.")
    parser.add_argument("--baseline-summary", help="Optional baseline Phase 10 summary JSON.")
    parser.add_argument("--candidate-summary", help="Optional newer Phase 10 summary JSON.")
    parser.add_argument(
        "--output",
        default="artifacts/reports/calibration_drift_report.md",
        help="Output markdown report path.",
    )
    args = parser.parse_args()

    baseline_calibration = _read_json(PROJECT_ROOT / args.baseline_calibration)
    candidate_calibration = _read_json(PROJECT_ROOT / args.candidate_calibration)
    baseline_summary = _read_json(PROJECT_ROOT / args.baseline_summary) if args.baseline_summary else None
    candidate_summary = _read_json(PROJECT_ROOT / args.candidate_summary) if args.candidate_summary else None

    report = build_calibration_drift_report(
        baseline_calibration=baseline_calibration,
        candidate_calibration=candidate_calibration,
        baseline_summary=baseline_summary,
        candidate_summary=candidate_summary,
        baseline_label=args.baseline_calibration,
        candidate_label=args.candidate_calibration,
    )
    output_path = PROJECT_ROOT / args.output
    write_text(output_path, report)
    print(f"Wrote calibration drift report to {output_path}")


def build_calibration_drift_report(
    *,
    baseline_calibration: dict[str, Any],
    candidate_calibration: dict[str, Any],
    baseline_summary: dict[str, Any] | None,
    candidate_summary: dict[str, Any] | None,
    baseline_label: str,
    candidate_label: str,
) -> str:
    baseline_diag = baseline_calibration.get("calibration_diagnostics", {})
    candidate_diag = candidate_calibration.get("calibration_diagnostics", {})
    baseline_thresholds = baseline_calibration.get("threshold_recommendation", {})
    candidate_thresholds = candidate_calibration.get("threshold_recommendation", {})

    lines = [
        "# Calibration Drift Report",
        "",
        f"- Baseline calibration: `{baseline_label}`",
        f"- Candidate calibration: `{candidate_label}`",
        "",
        "## Threshold drift",
        "",
        "| Threshold | Baseline | Candidate | Delta |",
        "|---|---:|---:|---:|",
    ]
    for key in ("lower", "upper"):
        baseline_value = _as_float(baseline_thresholds.get(key))
        candidate_value = _as_float(candidate_thresholds.get(key))
        lines.append(
            f"| `{key}` | {baseline_value:.4f} | {candidate_value:.4f} | {candidate_value - baseline_value:+.4f} |"
        )
    lines.append("")

    lines.extend(
        [
            "## Calibration diagnostics drift",
            "",
            "| Metric | Baseline | Candidate | Delta |",
            "|---|---:|---:|---:|",
        ]
    )
    for key in ("raw_brier", "calibrated_brier", "raw_ece", "calibrated_ece"):
        baseline_value = _as_float(baseline_diag.get(key))
        candidate_value = _as_float(candidate_diag.get(key))
        lines.append(
            f"| `{key}` | {baseline_value:.6f} | {candidate_value:.6f} | {candidate_value - baseline_value:+.6f} |"
        )
    lines.append("")

    if baseline_summary is not None and candidate_summary is not None:
        lines.extend(
            _render_summary_drift(
                baseline_summary=baseline_summary,
                candidate_summary=candidate_summary,
            )
        )

    lines.extend(
        [
            "## Checklist",
            "",
            "- Revisit threshold bands if `lower` or `upper` moved materially (>0.03).",
            "- Investigate distribution shift if calibrated ECE worsened.",
            "- Re-run edited/paraphrased robustness slices before promoting the candidate model.",
            "",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def _render_summary_drift(*, baseline_summary: dict[str, Any], candidate_summary: dict[str, Any]) -> list[str]:
    baseline_overall = baseline_summary.get("overall_metrics", {})
    candidate_overall = candidate_summary.get("overall_metrics", {})
    lines = [
        "## Evaluation summary drift",
        "",
        "| Metric | Baseline | Candidate | Delta |",
        "|---|---:|---:|---:|",
    ]
    for key in ("accuracy", "precision", "recall", "f1", "false_positive_rate", "false_negative_rate"):
        base_value = _as_float(baseline_overall.get(key))
        cand_value = _as_float(candidate_overall.get(key))
        lines.append(
            f"| `{key}` | {base_value:.4f} | {cand_value:.4f} | {cand_value - base_value:+.4f} |"
        )
    lines.append("")
    return lines


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"JSON file not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return payload


def _as_float(value: Any) -> float:
    if value is None:
        return 0.0
    return float(value)


if __name__ == "__main__":
    main()
