"""
Core orchestrator — Runs the full plagiarism detection pipeline.

This is the main entry point that ties all modules together.
Pure function: no DB calls, no side effects beyond returning a Report.

Usage:
    from plagscan.core import run_detector
    report = run_detector(submissions, assignment_name="HW1")

    # With starter code suppression:
    report = run_detector(submissions, starter_code=starter_sub, assignment_name="HW1")
"""

from itertools import combinations
from typing import Dict, List, Optional

from .models import (
    FingerprintResult,
    PairResult,
    Report,
    Submission,
    TokenizedSubmission,
)
from .normalizer import normalize_submission
from .fingerprint import fingerprint_submission, DEFAULT_K, DEFAULT_W
from .compare import compare_all, DEFAULT_JACCARD_THRESHOLD, DEFAULT_CONTAINMENT_THRESHOLD
from .evidence import generate_evidence
from .report import build_report


def run_detector(
    submissions: List[Submission],
    assignment_name: str = "Unknown Assignment",
    starter_code: Optional[Submission] = None,
    k: int = DEFAULT_K,
    w: int = DEFAULT_W,
    jaccard_threshold: float = DEFAULT_JACCARD_THRESHOLD,
    containment_threshold: float = DEFAULT_CONTAINMENT_THRESHOLD,
    verbose: bool = False,
) -> Report:
    """
    Run the complete plagiarism detection pipeline.

    Args:
        submissions: List of loaded Submission objects.
        assignment_name: Name for the report header.
        starter_code: Optional Submission containing starter/template files.
            If provided, fingerprints from starter code will be subtracted
            from all submissions before comparison.
        k: K-gram size for fingerprinting.
        w: Winnowing window size.
        jaccard_threshold: Jaccard score threshold for flagging.
        containment_threshold: Containment score threshold for flagging.
        verbose: If True, print progress messages.

    Returns:
        A Report object with all results.
    """
    if verbose:
        print(f"  ⏳ Analyzing {len(submissions)} submissions...")

    # ── Step 2: Tokenize & normalize ────────────────────────────────
    if verbose:
        print("  📝 Tokenizing submissions...")

    tokenized_map: Dict[str, TokenizedSubmission] = {}
    for sub in submissions:
        ts = normalize_submission(sub)
        tokenized_map[sub.id] = ts
        if verbose:
            print(f"     {sub.id}: {len(ts.tokens)} tokens from {len(sub.files)} file(s)")

    # ── Step 3: Fingerprint ─────────────────────────────────────────
    if verbose:
        print("  🔍 Generating fingerprints...")

    fp_map: Dict[str, FingerprintResult] = {}
    for sub_id, ts in tokenized_map.items():
        fp = fingerprint_submission(ts, k=k, w=w)
        fp_map[sub_id] = fp
        if verbose:
            print(f"     {sub_id}: {len(fp.fingerprints)} fingerprints")

    # ── Step 3.5: Starter code suppression ──────────────────────────
    if starter_code and starter_code.files:
        if verbose:
            print("  🧹 Suppressing starter code fingerprints...")

        # Tokenize and fingerprint the starter code
        starter_tokenized = normalize_submission(starter_code)
        starter_fp = fingerprint_submission(starter_tokenized, k=k, w=w)
        starter_hashes = starter_fp.fingerprints

        if verbose:
            print(f"     Starter code: {len(starter_hashes)} fingerprints to suppress")

        # Subtract starter hashes from every submission
        for sub_id, fp in fp_map.items():
            original_count = len(fp.fingerprints)
            fp.fingerprints -= starter_hashes  # set difference
            # Also remove from fp_positions
            for h in starter_hashes:
                fp.fp_positions.pop(h, None)
            if verbose:
                removed = original_count - len(fp.fingerprints)
                print(f"     {sub_id}: {removed} starter fingerprints removed, {len(fp.fingerprints)} remaining")

    # ── Steps 4-5: Compare & score ──────────────────────────────────
    if verbose:
        total_pairs = len(submissions) * (len(submissions) - 1) // 2
        print(f"  ⚖️  Comparing {total_pairs} pairs...")

    fp_list = list(fp_map.values())
    flagged_scores = compare_all(
        fp_list,
        jaccard_threshold=jaccard_threshold,
        containment_threshold=containment_threshold,
    )

    if verbose:
        print(f"     {len(flagged_scores)} pairs exceed threshold")

    # ── Step 6: Generate evidence ───────────────────────────────────
    if verbose:
        print("  📋 Generating evidence for flagged pairs...")

    # Build file text maps for evidence generation
    file_texts: Dict[str, Dict[str, str]] = {}
    for sub in submissions:
        file_texts[sub.id] = {
            f.relative_path: f.text for f in sub.files
        }

    pair_results: List[PairResult] = []
    for score in flagged_scores:
        pr = generate_evidence(
            score=score,
            fp_a=fp_map[score.sub_a],
            fp_b=fp_map[score.sub_b],
            tokenized_a=tokenized_map[score.sub_a],
            tokenized_b=tokenized_map[score.sub_b],
            files_a=file_texts[score.sub_a],
            files_b=file_texts[score.sub_b],
            k=k,
        )
        pair_results.append(pr)

    # ── Step 7: Build report ────────────────────────────────────────
    total_pairs = len(submissions) * (len(submissions) - 1) // 2

    report = build_report(
        assignment_name=assignment_name,
        total_submissions=len(submissions),
        total_pairs_checked=total_pairs,
        pair_results=pair_results,
        jaccard_threshold=jaccard_threshold,
        containment_threshold=containment_threshold,
    )

    if verbose:
        print("  ✅ Analysis complete!")

    return report
