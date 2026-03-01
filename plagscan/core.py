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
    PairScore,
    Report,
    Submission,
    TokenizedSubmission,
)
from .normalizer import normalize_submission, split_submission_into_functions
from .fingerprint import fingerprint_submission, DEFAULT_K, DEFAULT_W
from .compare import (
    compare_all, compute_idf_weights,
    DEFAULT_JACCARD_THRESHOLD, DEFAULT_CONTAINMENT_THRESHOLD,
)
from .evidence import generate_evidence
from .report import build_report
from .metrics import extract_metrics, compute_metric_similarity, SubmissionMetrics

# Secondary k-gram size for multi-granularity matching
SMALL_K = 10


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
            print(f"     {sub_id}: {len(fp.fingerprints)} fingerprints (k={k})")

    # ── Step 3a: Multi-granularity — second pass with smaller k ─────
    if verbose:
        print(f"  🔍 Generating fine-grained fingerprints (k={SMALL_K})...")

    for sub_id, ts in tokenized_map.items():
        small_fp = fingerprint_submission(ts, k=SMALL_K, w=w)
        # Merge small-k fingerprints into the main set
        original_count = len(fp_map[sub_id].fingerprints)
        fp_map[sub_id].fingerprints |= small_fp.fingerprints
        # Merge positions too
        for h, positions in small_fp.fp_positions.items():
            if h not in fp_map[sub_id].fp_positions:
                fp_map[sub_id].fp_positions[h] = positions
            else:
                fp_map[sub_id].fp_positions[h].extend(positions)
        if verbose:
            added = len(fp_map[sub_id].fingerprints) - original_count
            print(f"     {sub_id}: +{added} snippet fingerprints (total: {len(fp_map[sub_id].fingerprints)})")

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

    # ── Step 3.6: Function-level fingerprinting ─────────────────────
    if verbose:
        print("  🔧 Splitting into functions...")

    func_fp_map: Dict[str, List[FingerprintResult]] = {}
    for sub in submissions:
        func_tokenized_list = split_submission_into_functions(sub)
        func_fps = []
        for func_ts in func_tokenized_list:
            func_fp = fingerprint_submission(func_ts, k=k, w=w)
            # Suppress starter hashes from function fingerprints too
            if starter_code and starter_code.files:
                func_fp.fingerprints -= starter_hashes
            if func_fp.fingerprints:  # Only keep non-empty
                func_fps.append(func_fp)
        func_fp_map[sub.id] = func_fps
        if verbose:
            print(f"     {sub.id}: {len(func_fps)} functions detected")

    # ── Step 3.7: Compute IDF weights ───────────────────────────────
    if verbose:
        print("  📊 Computing IDF weights...")

    fp_list = list(fp_map.values())
    idf_weights = compute_idf_weights(fp_list)

    if verbose:
        # Show how many fingerprints are common (low IDF)
        common_count = sum(1 for w in idf_weights.values() if w < 0.5)
        print(f"     {len(idf_weights)} unique fingerprints, {common_count} are common (low weight)")

    # ── Steps 4-5: Compare & score ──────────────────────────────────
    if verbose:
        total_pairs = len(submissions) * (len(submissions) - 1) // 2
        print(f"  ⚖️  Comparing {total_pairs} pairs (with IDF + function-level)...")

    flagged_scores = compare_all(
        fp_list,
        jaccard_threshold=jaccard_threshold,
        containment_threshold=containment_threshold,
        idf_weights=idf_weights,
        func_fingerprints=func_fp_map,
    )

    # ── Step 4.5: Code metrics ──────────────────────────────────────
    if verbose:
        print("  📚 Extracting code metrics...")

    metrics_map: Dict[str, SubmissionMetrics] = {}
    for sub in submissions:
        sm = extract_metrics(sub)
        metrics_map[sub.id] = sm
        if verbose:
            print(f"     {sub.id}: {sm.total_functions} functions, {sm.total_lines} lines")

    # Compute metric similarity for flagged pairs and attach to scores
    for score in flagged_scores:
        if score.sub_a in metrics_map and score.sub_b in metrics_map:
            ms = compute_metric_similarity(
                metrics_map[score.sub_a],
                metrics_map[score.sub_b],
            )
            score.metric_similarity = ms

    # Also check: any unflagged pairs with very high metric similarity?
    # This catches structurally identical code that bypassed fingerprint matching.
    # Requires BOTH high metric similarity AND some fingerprint overlap to avoid
    # false positives on independent code that happens to have similar structure.
    flagged_pair_keys = {(s.sub_a, s.sub_b) for s in flagged_scores}
    from itertools import combinations as combs
    for sub_a, sub_b in combs(submissions, 2):
        pair_key = (sub_a.id, sub_b.id)
        if pair_key in flagged_pair_keys:
            continue
        if sub_a.id in metrics_map and sub_b.id in metrics_map:
            ms = compute_metric_similarity(
                metrics_map[sub_a.id], metrics_map[sub_b.id]
            )
            if ms >= 0.85:  # High structural similarity bypass threshold
                # Also verify there's some fingerprint overlap
                fp_a_set = fp_map.get(sub_a.id)
                fp_b_set = fp_map.get(sub_b.id)
                if fp_a_set and fp_b_set:
                    shared = fp_a_set.fingerprints & fp_b_set.fingerprints
                    min_fps = min(len(fp_a_set.fingerprints), len(fp_b_set.fingerprints))
                    overlap_ratio = len(shared) / min_fps if min_fps > 0 else 0
                    # Only flag if there's meaningful fingerprint overlap (not just noise)
                    if overlap_ratio >= 0.15:
                        if verbose:
                            print(f"     ⚠️  {sub_a.id} ↔ {sub_b.id}: metric similarity {ms:.1%} + {overlap_ratio:.1%} overlap (flagged)")
                        flagged_scores.append(
                            PairScore(
                                sub_a=sub_a.id, sub_b=sub_b.id,
                                jaccard=0.0, containment=0.0,
                                shared_fingerprints=len(shared),
                                total_fingerprints_a=len(fp_a_set.fingerprints),
                                total_fingerprints_b=len(fp_b_set.fingerprints),
                                metric_similarity=ms,
                            )
                        )

    # Re-sort by containment
    flagged_scores.sort(key=lambda s: s.containment, reverse=True)

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
