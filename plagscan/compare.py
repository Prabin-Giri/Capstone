"""
Steps 4 & 5: Compare — Pairwise similarity scoring.

Compares fingerprint sets between all pairs of submissions
and computes Jaccard and containment similarity scores.

Supports:
  - Basic set-intersection scoring
  - IDF-weighted scoring (downweights common fingerprints)
  - Function-level matching (compares individual functions across submissions)
"""

import math
from itertools import combinations
from typing import Dict, List, Optional, Set

from .models import FingerprintResult, PairScore

# Default thresholds (tunable)
DEFAULT_JACCARD_THRESHOLD = 0.15
DEFAULT_CONTAINMENT_THRESHOLD = 0.30


# ── IDF weights ─────────────────────────────────────────────────────

def compute_idf_weights(
    all_fingerprints: List[FingerprintResult],
) -> Dict[int, float]:
    """
    Compute IDF (Inverse Document Frequency) weight for each fingerprint hash.

    IDF = log(N / df) where:
      - N = total number of submissions
      - df = number of submissions containing this fingerprint

    Higher weight = more unique fingerprint (more suspicious if shared).
    Lower weight = common fingerprint (likely boilerplate).

    Args:
        all_fingerprints: List of all submissions' fingerprint results.

    Returns:
        Dict mapping fingerprint hash -> IDF weight.
    """
    n = len(all_fingerprints)
    if n == 0:
        return {}

    # Count document frequency for each hash
    doc_freq: Dict[int, int] = {}
    for fp in all_fingerprints:
        for h in fp.fingerprints:
            doc_freq[h] = doc_freq.get(h, 0) + 1

    # Compute IDF weights
    idf: Dict[int, float] = {}
    for h, df in doc_freq.items():
        idf[h] = math.log(n / df) if df > 0 else 0.0

    return idf


# ── Scoring functions ───────────────────────────────────────────────

def compute_pair_score(
    fp_a: FingerprintResult,
    fp_b: FingerprintResult,
    idf_weights: Optional[Dict[int, float]] = None,
) -> PairScore:
    """
    Compute similarity scores between two submissions' fingerprints.

    If idf_weights is provided, uses IDF-weighted scoring:
      - Weighted Jaccard:      sum(idf[shared]) / sum(idf[union])
      - Weighted Containment:  sum(idf[shared]) / min(sum(idf[A]), sum(idf[B]))

    Otherwise uses simple set-intersection scoring:
      - Jaccard:      |A ∩ B| / |A ∪ B|
      - Containment:  |A ∩ B| / min(|A|, |B|)
    """
    set_a = fp_a.fingerprints
    set_b = fp_b.fingerprints

    intersection = set_a & set_b
    union = set_a | set_b

    shared = len(intersection)

    if idf_weights:
        # IDF-weighted scoring
        w_shared = sum(idf_weights.get(h, 1.0) for h in intersection)
        w_union = sum(idf_weights.get(h, 1.0) for h in union)
        w_a = sum(idf_weights.get(h, 1.0) for h in set_a)
        w_b = sum(idf_weights.get(h, 1.0) for h in set_b)
        w_min = min(w_a, w_b)

        jaccard = w_shared / w_union if w_union > 0 else 0.0
        containment = w_shared / w_min if w_min > 0 else 0.0
    else:
        # Simple set-intersection scoring
        union_size = len(union)
        min_size = min(len(set_a), len(set_b))

        jaccard = shared / union_size if union_size > 0 else 0.0
        containment = shared / min_size if min_size > 0 else 0.0

    return PairScore(
        sub_a=fp_a.submission_id,
        sub_b=fp_b.submission_id,
        jaccard=round(jaccard, 4),
        containment=round(containment, 4),
        shared_fingerprints=shared,
        total_fingerprints_a=len(set_a),
        total_fingerprints_b=len(set_b),
    )


# ── Function-level matching ─────────────────────────────────────────

def compute_function_level_score(
    funcs_a: List[FingerprintResult],
    funcs_b: List[FingerprintResult],
    sub_a_id: str,
    sub_b_id: str,
    idf_weights: Optional[Dict[int, float]] = None,
) -> PairScore:
    """
    Compare submissions at the function level.

    For each function in A, find the best-matching function in B.
    The overall score is the average of the best matches, weighted by
    function size (number of fingerprints).

    This catches plagiarism even when functions are reordered.
    """
    if not funcs_a or not funcs_b:
        return PairScore(
            sub_a=sub_a_id, sub_b=sub_b_id,
            jaccard=0.0, containment=0.0,
            shared_fingerprints=0,
            total_fingerprints_a=0,
            total_fingerprints_b=0,
        )

    # For each function in A, find the best containment match in B
    total_weight_a = 0.0
    weighted_containment_sum = 0.0
    total_shared = 0

    for fa in funcs_a:
        if not fa.fingerprints:
            continue

        best_containment = 0.0
        best_shared = 0

        for fb in funcs_b:
            if not fb.fingerprints:
                continue

            intersection = fa.fingerprints & fb.fingerprints
            shared = len(intersection)
            min_size = min(len(fa.fingerprints), len(fb.fingerprints))

            if idf_weights:
                w_shared = sum(idf_weights.get(h, 1.0) for h in intersection)
                w_min = min(
                    sum(idf_weights.get(h, 1.0) for h in fa.fingerprints),
                    sum(idf_weights.get(h, 1.0) for h in fb.fingerprints),
                )
                cont = w_shared / w_min if w_min > 0 else 0.0
            else:
                cont = shared / min_size if min_size > 0 else 0.0

            if cont > best_containment:
                best_containment = cont
                best_shared = shared

        func_weight = len(fa.fingerprints)
        total_weight_a += func_weight
        weighted_containment_sum += best_containment * func_weight
        total_shared += best_shared

    # Compute aggregated scores
    avg_containment = (weighted_containment_sum / total_weight_a
                       if total_weight_a > 0 else 0.0)

    # Also compute whole-set Jaccard for context
    all_a = set()
    all_b = set()
    for fa in funcs_a:
        all_a |= fa.fingerprints
    for fb in funcs_b:
        all_b |= fb.fingerprints

    union = all_a | all_b
    intersection = all_a & all_b

    if idf_weights:
        w_intersection = sum(idf_weights.get(h, 1.0) for h in intersection)
        w_union = sum(idf_weights.get(h, 1.0) for h in union)
        jaccard = w_intersection / w_union if w_union > 0 else 0.0
    else:
        jaccard = len(intersection) / len(union) if union else 0.0

    return PairScore(
        sub_a=sub_a_id,
        sub_b=sub_b_id,
        jaccard=round(jaccard, 4),
        containment=round(avg_containment, 4),
        shared_fingerprints=total_shared,
        total_fingerprints_a=len(all_a),
        total_fingerprints_b=len(all_b),
    )


# ── Main comparison entry point ─────────────────────────────────────

def compare_all(
    fingerprints: List[FingerprintResult],
    jaccard_threshold: float = DEFAULT_JACCARD_THRESHOLD,
    containment_threshold: float = DEFAULT_CONTAINMENT_THRESHOLD,
    idf_weights: Optional[Dict[int, float]] = None,
    func_fingerprints: Optional[Dict[str, List[FingerprintResult]]] = None,
) -> List[PairScore]:
    """
    Compare all pairs of submissions and return those exceeding thresholds.

    A pair is flagged if EITHER jaccard OR containment exceeds its threshold.

    When func_fingerprints is provided, the score is the MAX of:
      - Whole-file comparison score
      - Function-level comparison score (catches reordered code)

    Args:
        fingerprints: List of FingerprintResult for all submissions.
        jaccard_threshold: Minimum Jaccard score to flag a pair.
        containment_threshold: Minimum containment score to flag a pair.
        idf_weights: Optional IDF weight dict (enables IDF-weighted scoring).
        func_fingerprints: Optional dict of submission_id -> list of per-function
            FingerprintResults (enables function-level matching).

    Returns:
        List of PairScore objects, sorted by containment descending.
    """
    flagged: List[PairScore] = []

    for fp_a, fp_b in combinations(fingerprints, 2):
        # Whole-file score
        score = compute_pair_score(fp_a, fp_b, idf_weights)

        # Function-level score (if available)
        if func_fingerprints:
            funcs_a = func_fingerprints.get(fp_a.submission_id, [])
            funcs_b = func_fingerprints.get(fp_b.submission_id, [])

            if funcs_a and funcs_b:
                func_score = compute_function_level_score(
                    funcs_a, funcs_b,
                    fp_a.submission_id, fp_b.submission_id,
                    idf_weights,
                )

                # Take the MAX of whole-file and function-level scores
                if (func_score.containment > score.containment or
                        func_score.jaccard > score.jaccard):
                    score = PairScore(
                        sub_a=score.sub_a,
                        sub_b=score.sub_b,
                        jaccard=max(score.jaccard, func_score.jaccard),
                        containment=max(score.containment, func_score.containment),
                        shared_fingerprints=max(score.shared_fingerprints,
                                                func_score.shared_fingerprints),
                        total_fingerprints_a=score.total_fingerprints_a,
                        total_fingerprints_b=score.total_fingerprints_b,
                    )

        if (score.jaccard >= jaccard_threshold or
                score.containment >= containment_threshold):
            flagged.append(score)

    # Sort by containment (most suspicious first)
    flagged.sort(key=lambda s: s.containment, reverse=True)

    return flagged
