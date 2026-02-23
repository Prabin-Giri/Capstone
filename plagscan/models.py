"""
Phase 0 — Data models and core interfaces.

All data structures used across the pipeline are defined here.
No database or UI dependencies — pure Python dataclasses.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple


# ── Step 1: Loader output ──────────────────────────────────────────

@dataclass
class SourceFile:
    """A single source file from a submission."""
    relative_path: str   # e.g. "main.py" or "src/utils.js"
    text: str            # full file content


@dataclass
class Submission:
    """One student's submission (may contain multiple files)."""
    id: str                     # e.g. "s001" or student ID
    files: List[SourceFile] = field(default_factory=list)


# ── Step 2: Normalizer output ──────────────────────────────────────

@dataclass
class TokenLocation:
    """Maps a token back to its original source location."""
    file_path: str
    start_line: int
    end_line: int


@dataclass
class TokenizedSubmission:
    """Result of tokenizing + normalizing a submission."""
    submission_id: str
    tokens: List[str]                        # normalized token stream
    token_locations: List[TokenLocation]     # parallel list: where each token came from


# ── Step 3: Fingerprint output ─────────────────────────────────────

@dataclass
class FingerprintResult:
    """Winnowing fingerprints for one submission."""
    submission_id: str
    fingerprints: Set[int]                           # set of selected hashes
    fp_positions: Dict[int, List[int]] = field(default_factory=dict)
    # hash -> list of token indices where this fingerprint starts


# ── Step 5: Similarity scoring ─────────────────────────────────────

@dataclass
class PairScore:
    """Similarity scores for a pair of submissions."""
    sub_a: str
    sub_b: str
    jaccard: float           # |A∩B| / |A∪B|
    containment: float       # |A∩B| / min(|A|, |B|)
    shared_fingerprints: int
    total_fingerprints_a: int
    total_fingerprints_b: int
    metric_similarity: float = 0.0  # structural similarity (0-1)


# ── Step 6: Evidence ───────────────────────────────────────────────

@dataclass
class MatchRegion:
    """A contiguous matched region between two submissions."""
    file_a: str
    lines_a: Tuple[int, int]    # (start_line, end_line)
    snippet_a: str

    file_b: str
    lines_b: Tuple[int, int]
    snippet_b: str


@dataclass
class PairResult:
    """Full comparison result for a pair of submissions."""
    score: PairScore
    matched_regions: List[MatchRegion] = field(default_factory=list)


# ── Step 7: Report ─────────────────────────────────────────────────

@dataclass
class ReportSummary:
    """High-level summary for the report."""
    total_submissions: int
    total_pairs_checked: int
    suspicious_pairs: int
    threshold_jaccard: float
    threshold_containment: float


@dataclass
class Report:
    """The full plagiarism detection report."""
    assignment_name: str
    summary: ReportSummary
    pairs: List[PairResult]                        # sorted by score desc
    per_submission: Dict[str, List[str]] = field(default_factory=dict)
    # submission_id -> top 5 most similar submission IDs (optional)
