"""
Step 3: Fingerprinting — Winnowing algorithm for selecting representative hashes.

Takes a normalized token stream and produces a set of fingerprint hashes
using k-gram hashing and the winnowing selection algorithm.
"""

from typing import Dict, List, Set, Tuple
import hashlib

from .models import FingerprintResult, TokenizedSubmission

# Default parameters (tunable)
DEFAULT_K = 25    # k-gram size (number of tokens per gram)
DEFAULT_W = 4     # winnowing window size


def _hash_kgram(tokens: List[str], start: int, k: int) -> int:
    """
    Hash a k-gram of tokens starting at position `start`.
    Uses a deterministic hash (MD5-based) to ensure reproducible results
    across Python runs (unlike Python's built-in hash() which is randomized).
    """
    gram = '\x00'.join(tokens[start:start + k])
    return int(hashlib.md5(gram.encode('utf-8')).hexdigest()[:16], 16)


def _build_kgram_hashes(
    tokens: List[str],
    k: int,
) -> List[Tuple[int, int]]:
    """
    Build all k-gram hashes from the token stream.

    Returns:
        List of (hash_value, token_start_index) pairs.
    """
    if len(tokens) < k:
        # If fewer tokens than k, hash whatever we have
        if len(tokens) > 0:
            gram = '\x00'.join(tokens)
            return [(int(hashlib.md5(gram.encode('utf-8')).hexdigest()[:16], 16), 0)]
        return []

    return [
        (_hash_kgram(tokens, i, k), i)
        for i in range(len(tokens) - k + 1)
    ]


def _winnow(
    hash_list: List[Tuple[int, int]],
    w: int,
) -> List[Tuple[int, int]]:
    """
    Apply the winnowing algorithm to select fingerprints.

    For each window of `w` consecutive hashes, select the minimum hash.
    If there's a tie, select the rightmost occurrence.

    Returns:
        De-duplicated list of (hash_value, token_index) selected as fingerprints.
    """
    if not hash_list:
        return []

    if len(hash_list) <= w:
        # Window covers everything — pick the minimum
        min_val = min(hash_list, key=lambda x: x[0])
        return [min_val]

    selected: List[Tuple[int, int]] = []
    prev_idx = -1

    for window_start in range(len(hash_list) - w + 1):
        window = hash_list[window_start:window_start + w]

        # Find the minimum hash in the window (rightmost if tie)
        min_hash = min(window, key=lambda x: x[0])
        # For ties, pick the rightmost
        for item in reversed(window):
            if item[0] == min_hash[0]:
                min_hash = item
                break

        # Only add if this is a new selection (avoid duplicates)
        if min_hash[1] != prev_idx:
            selected.append(min_hash)
            prev_idx = min_hash[1]

    return selected


def fingerprint_submission(
    tokenized: TokenizedSubmission,
    k: int = DEFAULT_K,
    w: int = DEFAULT_W,
) -> FingerprintResult:
    """
    Generate winnowing fingerprints for a tokenized submission.

    Args:
        tokenized: The normalized token stream from the normalizer.
        k: K-gram size (number of tokens per gram).
        w: Winnowing window size.

    Returns:
        FingerprintResult with the set of fingerprint hashes
        and their positions in the token stream.
    """
    # Build all k-gram hashes
    kgram_hashes = _build_kgram_hashes(tokenized.tokens, k)

    # Apply winnowing to select fingerprints
    selected = _winnow(kgram_hashes, w)

    # Build the result
    fingerprints: Set[int] = set()
    fp_positions: Dict[int, List[int]] = {}

    for hash_val, token_idx in selected:
        fingerprints.add(hash_val)
        if hash_val not in fp_positions:
            fp_positions[hash_val] = []
        fp_positions[hash_val].append(token_idx)

    return FingerprintResult(
        submission_id=tokenized.submission_id,
        fingerprints=fingerprints,
        fp_positions=fp_positions,
    )
