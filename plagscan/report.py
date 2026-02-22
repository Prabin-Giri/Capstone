"""
Step 7: Report — Generate JSON and CSV reports.

Produces:
  - report.json  (full structured report)
  - pairs.csv    (quick-view spreadsheet)
"""

import csv
import json
import os
from typing import Dict, List

from .models import PairResult, Report, ReportSummary


def build_report(
    assignment_name: str,
    total_submissions: int,
    total_pairs_checked: int,
    pair_results: List[PairResult],
    jaccard_threshold: float,
    containment_threshold: float,
) -> Report:
    """
    Build a Report object from pair results.

    Args:
        assignment_name: Name/identifier for the assignment.
        total_submissions: Number of submissions analyzed.
        total_pairs_checked: Total number of pairs compared.
        pair_results: List of PairResult (already filtered to flagged pairs).
        jaccard_threshold: The threshold used for Jaccard scoring.
        containment_threshold: The threshold used for containment scoring.

    Returns:
        A Report object ready for serialization.
    """
    summary = ReportSummary(
        total_submissions=total_submissions,
        total_pairs_checked=total_pairs_checked,
        suspicious_pairs=len(pair_results),
        threshold_jaccard=jaccard_threshold,
        threshold_containment=containment_threshold,
    )

    # Build per-submission view (top 5 most similar for each)
    per_submission: Dict[str, List[str]] = {}
    for pr in pair_results:
        a, b = pr.score.sub_a, pr.score.sub_b

        if a not in per_submission:
            per_submission[a] = []
        if len(per_submission[a]) < 5:
            per_submission[a].append(b)

        if b not in per_submission:
            per_submission[b] = []
        if len(per_submission[b]) < 5:
            per_submission[b].append(a)

    return Report(
        assignment_name=assignment_name,
        summary=summary,
        pairs=pair_results,
        per_submission=per_submission,
    )


def _pair_result_to_dict(pr: PairResult) -> dict:
    """Convert a PairResult to a JSON-serializable dict."""
    return {
        "sub_a": pr.score.sub_a,
        "sub_b": pr.score.sub_b,
        "jaccard": pr.score.jaccard,
        "containment": pr.score.containment,
        "shared_fingerprints": pr.score.shared_fingerprints,
        "total_fingerprints_a": pr.score.total_fingerprints_a,
        "total_fingerprints_b": pr.score.total_fingerprints_b,
        "matched_regions_count": len(pr.matched_regions),
        "matched_regions": [
            {
                "file_a": mr.file_a,
                "lines_a": list(mr.lines_a),
                "snippet_a": mr.snippet_a,
                "file_b": mr.file_b,
                "lines_b": list(mr.lines_b),
                "snippet_b": mr.snippet_b,
            }
            for mr in pr.matched_regions
        ],
    }


def write_report_json(report: Report, output_dir: str) -> str:
    """
    Write report.json to the output directory.

    Returns:
        Path to the written file.
    """
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, "report.json")

    data = {
        "assignment": report.assignment_name,
        "summary": {
            "total_submissions": report.summary.total_submissions,
            "total_pairs_checked": report.summary.total_pairs_checked,
            "suspicious_pairs": report.summary.suspicious_pairs,
            "threshold_jaccard": report.summary.threshold_jaccard,
            "threshold_containment": report.summary.threshold_containment,
        },
        "pairs": [_pair_result_to_dict(pr) for pr in report.pairs],
        "per_submission": report.per_submission,
    }

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return filepath


def write_pairs_csv(report: Report, output_dir: str) -> str:
    """
    Write pairs.csv for quick Excel viewing.

    Returns:
        Path to the written file.
    """
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, "pairs.csv")

    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            "Submission A", "Submission B",
            "Jaccard", "Containment",
            "Shared Fingerprints",
            "Fingerprints A", "Fingerprints B",
            "Matched Regions",
        ])

        for pr in report.pairs:
            writer.writerow([
                pr.score.sub_a,
                pr.score.sub_b,
                f"{pr.score.jaccard:.4f}",
                f"{pr.score.containment:.4f}",
                pr.score.shared_fingerprints,
                pr.score.total_fingerprints_a,
                pr.score.total_fingerprints_b,
                len(pr.matched_regions),
            ])

    return filepath


def print_summary(report: Report) -> None:
    """Print a human-readable summary to stdout."""
    s = report.summary
    print("\n" + "=" * 60)
    print(f"  PLAGIARISM REPORT: {report.assignment_name}")
    print("=" * 60)
    print(f"  Submissions analyzed:  {s.total_submissions}")
    print(f"  Pairs compared:        {s.total_pairs_checked}")
    print(f"  Suspicious pairs:      {s.suspicious_pairs}")
    print(f"  Thresholds:            Jaccard ≥ {s.threshold_jaccard}, Containment ≥ {s.threshold_containment}")
    print("-" * 60)

    if not report.pairs:
        print("  ✅ No suspicious pairs found!")
    else:
        print(f"\n  Top {min(10, len(report.pairs))} suspicious pairs:\n")
        for i, pr in enumerate(report.pairs[:10], 1):
            sc = pr.score
            flag = "🔴" if sc.containment >= 0.7 else "🟡" if sc.containment >= 0.4 else "🟢"
            print(f"  {flag} {i}. {sc.sub_a} ↔ {sc.sub_b}")
            print(f"       Jaccard: {sc.jaccard:.1%}  |  Containment: {sc.containment:.1%}  |  "
                  f"Shared: {sc.shared_fingerprints}  |  Regions: {len(pr.matched_regions)}")

    print("\n" + "=" * 60)
