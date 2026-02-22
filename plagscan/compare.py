"""
Steps 4 & 5: Compare — Pairwise similarity scoring.

Compares fingerprint sets between all pairs of submissions
and computes Jaccard and containment similarity scores.
"""

from itertools import combinations
from typing import List

from .models import FingerprintResult, PairScore

# Default thresholds (tunable)
DEFAULT_JACCARD_THRESHOLD = 0.15
DEFAULT_CONTAINMENT_THRESHOLD = 0.30


def compute_pair_score(
    fp_a: FingerprintResult,
    fp_b: FingerprintResult,
) -> PairScore:
    """
    Compute similarity scores between two submissions' fingerprints.

    Jaccard:      |A ∩ B| / |A ∪ B|
    Containment:  |A ∩ B| / min(|A|, |B|)
    """
    set_a = fp_a.fingerprints
    set_b = fp_b.fingerprints

    intersection = set_a & set_b
    union = set_a | set_b

    shared = len(intersection)
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


def compare_all(
    fingerprints: List[FingerprintResult],
    jaccard_threshold: float = DEFAULT_JACCARD_THRESHOLD,
    containment_threshold: float = DEFAULT_CONTAINMENT_THRESHOLD,
) -> List[PairScore]:
    """
    Compare all pairs of submissions and return those exceeding thresholds.

    A pair is flagged if EITHER jaccard OR containment exceeds its threshold.

    Args:
        fingerprints: List of FingerprintResult for all submissions.
        jaccard_threshold: Minimum Jaccard score to flag a pair.
        containment_threshold: Minimum containment score to flag a pair.

    Returns:
        List of PairScore objects, sorted by containment descending.
    """
    flagged: List[PairScore] = []

    for fp_a, fp_b in combinations(fingerprints, 2):
        score = compute_pair_score(fp_a, fp_b)

        if (score.jaccard >= jaccard_threshold or
                score.containment >= containment_threshold):
            flagged.append(score)

    # Sort by containment (most suspicious first)
    flagged.sort(key=lambda s: s.containment, reverse=True)

    return flagged
