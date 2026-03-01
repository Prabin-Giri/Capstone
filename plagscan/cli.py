#!/usr/bin/env python3
"""
CLI entry point for PlagScan — standalone plagiarism detection tool.

Usage:
    python -m plagscan run --assignment ./submissions --out ./out
    python -m plagscan run --assignment ./submissions --out ./out --name "HW1" -v
    python -m plagscan run --assignment ./submissions --starter ./starter --out ./out
"""

import argparse
import sys
import os

# Add parent directory to path so we can import plagscan
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from plagscan.loader import load_submissions
from plagscan.models import Submission
from plagscan.core import run_detector
from plagscan.report import write_report_json, write_pairs_csv, print_summary
from plagscan.fingerprint import DEFAULT_K, DEFAULT_W
from plagscan.compare import DEFAULT_JACCARD_THRESHOLD, DEFAULT_CONTAINMENT_THRESHOLD


def main():
    parser = argparse.ArgumentParser(
        prog="plagscan",
        description="PlagScan — Local code plagiarism detection tool",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # ── "run" command ───────────────────────────────────────────────
    run_parser = subparsers.add_parser("run", help="Run plagiarism detection")

    run_parser.add_argument(
        "--assignment", "-a",
        required=True,
        help="Path to the submissions directory (each subdirectory = one student)",
    )
    run_parser.add_argument(
        "--out", "-o",
        default="./out",
        help="Output directory for reports (default: ./out)",
    )
    run_parser.add_argument(
        "--name", "-n",
        default=None,
        help="Assignment name for the report header (default: directory name)",
    )
    run_parser.add_argument(
        "--k-gram", "-k",
        type=int,
        default=DEFAULT_K,
        help=f"K-gram size for fingerprinting (default: {DEFAULT_K})",
    )
    run_parser.add_argument(
        "--window", "-w",
        type=int,
        default=DEFAULT_W,
        help=f"Winnowing window size (default: {DEFAULT_W})",
    )
    run_parser.add_argument(
        "--jaccard-threshold",
        type=float,
        default=DEFAULT_JACCARD_THRESHOLD,
        help=f"Jaccard similarity threshold (default: {DEFAULT_JACCARD_THRESHOLD})",
    )
    run_parser.add_argument(
        "--containment-threshold",
        type=float,
        default=DEFAULT_CONTAINMENT_THRESHOLD,
        help=f"Containment similarity threshold (default: {DEFAULT_CONTAINMENT_THRESHOLD})",
    )
    run_parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show progress messages",
    )
    run_parser.add_argument(
        "--starter", "-s",
        default=None,
        help="Path to starter/template code directory. Fingerprints from these files "
             "will be subtracted from all submissions before comparison.",
    )

    args = parser.parse_args()

    if args.command != "run":
        parser.print_help()
        sys.exit(1)

    # ── Execute pipeline ────────────────────────────────────────────
    assignment_name = args.name or os.path.basename(os.path.abspath(args.assignment))

    try:
        # Step 1: Load
        print(f"\n🔍 PlagScan — Analyzing: {assignment_name}")
        print(f"   Source:  {os.path.abspath(args.assignment)}")
        print(f"   Output:  {os.path.abspath(args.out)}\n")

        submissions = load_submissions(args.assignment)
        if len(submissions) < 2:
            print(f"⚠️  Only {len(submissions)} submission(s) found. Need at least 2 to compare.")
            sys.exit(0)

        # Load starter code if provided
        starter_code = None
        if args.starter:
            if os.path.isdir(args.starter):
                # Load as a pseudo-submission
                starter_subs = load_submissions(args.starter)
                if starter_subs:
                    starter_code = starter_subs[0]
                else:
                    # Treat the directory itself as the submission folder
                    from plagscan.loader import _collect_source_files
                    from plagscan.models import SourceFile
                    files = _collect_source_files(args.starter)
                    if files:
                        starter_code = Submission(id="__starter__", files=files)
                if starter_code:
                    print(f"   Starter: {os.path.abspath(args.starter)} ({len(starter_code.files)} file(s))\n")
                else:
                    print(f"   ⚠️  No source files found in starter directory: {args.starter}\n")
            else:
                print(f"   ⚠️  Starter path is not a directory: {args.starter}\n")

        # Steps 2-7: Run detector
        report = run_detector(
            submissions=submissions,
            assignment_name=assignment_name,
            starter_code=starter_code,
            k=args.k_gram,
            w=args.window,
            jaccard_threshold=args.jaccard_threshold,
            containment_threshold=args.containment_threshold,
            verbose=args.verbose,
        )

        # Write outputs
        json_path = write_report_json(report, args.out)
        csv_path = write_pairs_csv(report, args.out)

        # Print summary to console
        print_summary(report)

        print(f"\n📄 Reports written:")
        print(f"   → {json_path}")
        print(f"   → {csv_path}")

    except FileNotFoundError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
