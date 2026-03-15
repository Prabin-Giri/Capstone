"""
Step 6: Evidence — Map shared fingerprints back to source code regions.

For each flagged pair, identifies which files and lines contain
the shared fingerprints, merges nearby hits into contiguous regions,
and extracts code snippets.
"""

from typing import Dict, List, Tuple

from .models import (
    FingerprintResult,
    MatchRegion,
    PairResult,
    PairScore,
    TokenizedSubmission,
    TokenLocation,
)

# How many context lines to include in snippets
SNIPPET_CONTEXT = 2
# Maximum gap (in lines) between hits to merge into one region
MERGE_GAP = 3


def _get_source_lines(
    tokenized: TokenizedSubmission,
) -> Dict[str, List[str]]:
    """
    Build a map of file_path -> list of source lines.
    We reconstruct this from token locations — find unique files,
    then we need the original text. Since we only have tokens,
    we'll build line references from what we have.
    """
    # We actually need the original file texts for snippets.
    # This is handled in generate_evidence by passing original submissions.
    return {}


def _collect_hit_lines(
    shared_hashes: set,
    fp: FingerprintResult,
    tokenized: TokenizedSubmission,
    k: int = 25,
) -> Dict[str, List[int]]:
    """
    For shared fingerprint hashes, collect which files and lines they map to.

    Returns:
        Dict of file_path -> sorted list of line numbers that contain hits.
    """
    file_lines: Dict[str, List[int]] = {}

    for h in shared_hashes:
        positions = fp.fp_positions.get(h, [])
        for token_idx in positions:
            # Each fingerprint covers tokens [token_idx, token_idx + k)
            for offset in range(min(k, len(tokenized.token_locations) - token_idx)):
                loc = tokenized.token_locations[token_idx + offset]
                if loc.start_line == 0:
                    continue  # Skip FILE_BOUNDARY markers
                if loc.file_path not in file_lines:
                    file_lines[loc.file_path] = []
                file_lines[loc.file_path].append(loc.start_line)

    # De-duplicate and sort
    for path in file_lines:
        file_lines[path] = sorted(set(file_lines[path]))

    return file_lines


def _merge_line_ranges(
    lines: List[int],
    merge_gap: int = MERGE_GAP,
) -> List[Tuple[int, int]]:
    """
    Merge a sorted list of line numbers into contiguous ranges.
    Lines within `merge_gap` of each other are merged.

    Returns:
        List of (start_line, end_line) tuples.
    """
    if not lines:
        return []

    ranges: List[Tuple[int, int]] = []
    start = lines[0]
    end = lines[0]

    for line in lines[1:]:
        if line <= end + merge_gap:
            end = line
        else:
            ranges.append((start, end))
            start = line
            end = line

    ranges.append((start, end))
    return ranges


def _extract_snippet(
    text: str,
    start_line: int,
    end_line: int,
    context: int = SNIPPET_CONTEXT,
) -> str:
    """Extract a code snippet with context lines."""
    lines = text.splitlines()
    total = len(lines)

    actual_start = max(0, start_line - 1 - context)
    actual_end = min(total, end_line + context)

    snippet_lines = []
    for i in range(actual_start, actual_end):
        prefix = ">" if start_line - 1 <= i < end_line else " "
        snippet_lines.append(f"{prefix} {i + 1:4d} | {lines[i]}")

    return "\n".join(snippet_lines)


def generate_evidence(
    score: PairScore,
    fp_a: FingerprintResult,
    fp_b: FingerprintResult,
    tokenized_a: TokenizedSubmission,
    tokenized_b: TokenizedSubmission,
    files_a: Dict[str, str],  # file_path -> full text
    files_b: Dict[str, str],
    k: int = 25,
) -> PairResult:
    """
    Generate evidence (matched regions) for a flagged pair.

    Args:
        score: The similarity scores for this pair.
        fp_a, fp_b: Fingerprint results for both submissions.
        tokenized_a, tokenized_b: Tokenized data for both.
        files_a, files_b: Maps of relative_path -> file text content.
        k: The k-gram size used during fingerprinting.

    Returns:
        PairResult with score and matched regions.
    """
    # Find shared fingerprint hashes
    shared = fp_a.fingerprints & fp_b.fingerprints

    if not shared:
        return PairResult(score=score, matched_regions=[])

    # Collect hit lines for each submission
    hits_a = _collect_hit_lines(shared, fp_a, tokenized_a, k)
    hits_b = _collect_hit_lines(shared, fp_b, tokenized_b, k)

    # Build match regions by pairing up file hits
    regions: List[MatchRegion] = []

    # For each file in A that has hits, find corresponding files in B
    for file_a, lines_a in hits_a.items():
        ranges_a = _merge_line_ranges(lines_a)
        text_a = files_a.get(file_a, "")

        for file_b, lines_b in hits_b.items():
            ranges_b = _merge_line_ranges(lines_b)
            text_b = files_b.get(file_b, "")

            # Create regions by pairing ranges (zip the largest ranges)
            for i, range_a in enumerate(ranges_a):
                if i < len(ranges_b):
                    range_b = ranges_b[i]
                else:
                    # More ranges in A than B — pair with last B range
                    range_b = ranges_b[-1] if ranges_b else (1, 1)

                snippet_a = _extract_snippet(text_a, range_a[0], range_a[1]) if text_a else ""
                snippet_b = _extract_snippet(text_b, range_b[0], range_b[1]) if text_b else ""

                regions.append(MatchRegion(
                    file_a=file_a,
                    lines_a=range_a,
                    snippet_a=snippet_a,
                    file_b=file_b,
                    lines_b=range_b,
                    snippet_b=snippet_b,
                ))

    return PairResult(score=score, matched_regions=regions)
