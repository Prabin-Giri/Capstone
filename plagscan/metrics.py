"""
Code Metrics — Structural fingerprinting for plagiarism detection.

Extracts per-function structural metrics that are independent of
variable names, comments, and formatting. Provides an additional
plagiarism signal beyond token-based fingerprinting.

Metrics extracted per function:
  - Loop count (for, while)
  - Conditional count (if, elif, else, switch/case)
  - Nesting depth (maximum indentation depth)
  - Variable assignments
  - Function/method calls
  - Return statements
  - Cyclomatic complexity (edges - nodes + 2)
"""

import re
import math
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field

from .models import Submission, SourceFile


# ── Metric data structures ──────────────────────────────────────────

@dataclass
class FunctionMetrics:
    """Structural metrics for a single function."""
    name: str
    file_path: str
    start_line: int
    end_line: int
    line_count: int = 0
    loop_count: int = 0         # for, while loops
    conditional_count: int = 0  # if, elif, else, switch, case
    max_nesting: int = 0        # deepest indentation level
    assignment_count: int = 0   # variable assignments
    call_count: int = 0         # function/method calls
    return_count: int = 0       # return statements
    param_count: int = 0        # function parameters
    operator_count: int = 0     # arithmetic/comparison operators
    cyclomatic_complexity: int = 1  # McCabe complexity


@dataclass
class SubmissionMetrics:
    """All metrics for a submission."""
    submission_id: str
    functions: List[FunctionMetrics] = field(default_factory=list)
    total_lines: int = 0
    total_functions: int = 0


# ── Metric extraction ───────────────────────────────────────────────

# Language-agnostic patterns for structural elements
_LOOP_PATTERN = re.compile(
    r'\b(for|while|do)\b', re.IGNORECASE
)
_CONDITIONAL_PATTERN = re.compile(
    r'\b(if|elif|else|switch|case)\b', re.IGNORECASE
)
_ASSIGNMENT_PATTERN = re.compile(
    r'(?<!=)=(?!=)'  # single = not preceded or followed by =
)
_CALL_PATTERN = re.compile(
    r'\b[a-zA-Z_]\w*\s*\('  # identifier followed by (
)
_RETURN_PATTERN = re.compile(
    r'\b(return)\b'
)
_OPERATOR_PATTERN = re.compile(
    r'[+\-*/%](?!=)|==|!=|<=|>=|<|>|&&|\|\||and\b|or\b|not\b'
)

# Patterns for function definitions
_PYTHON_FUNC = re.compile(r'^(\s*)def\s+(\w+)\s*\(([^)]*)\)')
_JS_FUNC = re.compile(
    r'(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\())'
)
_JAVA_FUNC = re.compile(
    r'(?:public|private|protected|static|\s)*\s+\w+\s+(\w+)\s*\(([^)]*)\)'
)

# Keywords that should NOT be counted as function calls
_CALL_EXCLUDE = {
    'if', 'elif', 'else', 'for', 'while', 'do', 'switch', 'case',
    'return', 'print', 'class', 'def', 'function', 'catch', 'import',
    'from', 'with', 'assert', 'raise', 'throw', 'typeof', 'instanceof',
    'new', 'delete', 'void', 'sizeof',
}


def _detect_lang(path: str) -> str:
    """Detect language from file path."""
    import os
    ext = os.path.splitext(path)[1].lower()
    lang_map = {
        '.py': 'python', '.java': 'java',
        '.js': 'javascript', '.jsx': 'javascript',
        '.ts': 'javascript', '.tsx': 'javascript',
        '.c': 'cpp', '.cpp': 'cpp', '.h': 'cpp',
        '.cs': 'java', '.go': 'cpp', '.rs': 'cpp',
    }
    return lang_map.get(ext, 'generic')


def _compute_nesting(text: str, lang: str) -> int:
    """Compute maximum nesting depth from indentation or braces."""
    if lang == 'python':
        max_indent = 0
        for line in text.splitlines():
            stripped = line.lstrip()
            if stripped and not stripped.startswith('#'):
                indent = len(line) - len(stripped)
                # Approximate nesting level (4 spaces per level)
                level = indent // 4
                max_indent = max(max_indent, level)
        return max_indent
    else:
        # Brace-based: count max brace depth
        max_depth = 0
        depth = 0
        in_string = False
        string_char = None
        for char in text:
            if in_string:
                if char == string_char and (not text or True):
                    in_string = False
            elif char in ('"', "'", '`'):
                in_string = True
                string_char = char
            elif char == '{':
                depth += 1
                max_depth = max(max_depth, depth)
            elif char == '}':
                depth = max(0, depth - 1)
        return max_depth


def _extract_function_metrics(
    func_text: str,
    func_name: str,
    file_path: str,
    start_line: int,
    end_line: int,
    lang: str,
) -> FunctionMetrics:
    """Extract structural metrics from a single function's text."""

    lines = func_text.splitlines()
    line_count = len([l for l in lines if l.strip()])  # non-empty lines

    # Remove string literals and comments for accurate counting
    cleaned = re.sub(r'"(?:[^"\\]|\\.)*"', '""', func_text)
    cleaned = re.sub(r"'(?:[^'\\]|\\.)*'", "''", cleaned)
    cleaned = re.sub(r'#.*$', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'//.*$', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'/\*[\s\S]*?\*/', '', cleaned)

    loops = len(_LOOP_PATTERN.findall(cleaned))
    conditionals = len(_CONDITIONAL_PATTERN.findall(cleaned))
    assignments = len(_ASSIGNMENT_PATTERN.findall(cleaned))
    returns = len(_RETURN_PATTERN.findall(cleaned))
    operators = len(_OPERATOR_PATTERN.findall(cleaned))

    # Count function calls (exclude control flow keywords)
    calls = 0
    for m in _CALL_PATTERN.finditer(cleaned):
        name = m.group().rstrip('(').strip()
        if name.lower() not in _CALL_EXCLUDE:
            calls += 1

    nesting = _compute_nesting(func_text, lang)

    # Count parameters
    params = 0
    param_match = _PYTHON_FUNC.match(func_text.lstrip()) if lang == 'python' else None
    if param_match and param_match.group(3):
        param_str = param_match.group(3).strip()
        if param_str and param_str != 'self':
            params = len([p for p in param_str.split(',')
                         if p.strip() and p.strip() != 'self'])

    # Cyclomatic complexity = 1 + branches
    # Each if, elif, for, while, case, and, or adds 1
    and_or_count = len(re.findall(r'\b(and|or|&&|\|\|)\b', cleaned))
    cyclomatic = 1 + loops + conditionals + and_or_count

    return FunctionMetrics(
        name=func_name,
        file_path=file_path,
        start_line=start_line,
        end_line=end_line,
        line_count=line_count,
        loop_count=loops,
        conditional_count=conditionals,
        max_nesting=nesting,
        assignment_count=assignments,
        call_count=calls,
        return_count=returns,
        param_count=params,
        operator_count=operators,
        cyclomatic_complexity=cyclomatic,
    )


# ── Submission-level extraction ─────────────────────────────────────

def extract_metrics(submission: Submission) -> SubmissionMetrics:
    """
    Extract structural metrics from all functions in a submission.
    """
    from .normalizer import _detect_language, _remove_comments, _split_text_into_functions

    all_funcs: List[FunctionMetrics] = []
    total_lines = 0

    sorted_files = sorted(submission.files, key=lambda f: f.relative_path)

    for source_file in sorted_files:
        lang = _detect_language(source_file.relative_path)
        cleaned = _remove_comments(source_file.text, lang)
        total_lines += len(source_file.text.splitlines())

        func_blocks = _split_text_into_functions(cleaned, lang)

        for idx, (func_text, start_line, end_line) in enumerate(func_blocks):
            # Try to extract function name
            func_name = f"func_{idx}"
            if lang == 'python':
                m = _PYTHON_FUNC.match(func_text.lstrip())
                if m:
                    func_name = m.group(2)
            elif lang == 'javascript':
                m = _JS_FUNC.search(func_text)
                if m:
                    func_name = m.group(1) or m.group(2) or func_name

            fm = _extract_function_metrics(
                func_text, func_name,
                source_file.relative_path,
                start_line, end_line, lang,
            )
            all_funcs.append(fm)

    return SubmissionMetrics(
        submission_id=submission.id,
        functions=all_funcs,
        total_lines=total_lines,
        total_functions=len(all_funcs),
    )


# ── Metric-based similarity ────────────────────────────────────────

def _metric_vector(fm: FunctionMetrics) -> Tuple[int, ...]:
    """Convert function metrics to a comparable vector."""
    return (
        fm.loop_count,
        fm.conditional_count,
        fm.max_nesting,
        fm.assignment_count,
        fm.call_count,
        fm.return_count,
        fm.operator_count,
        fm.cyclomatic_complexity,
    )


def _cosine_similarity(v1: Tuple[int, ...], v2: Tuple[int, ...]) -> float:
    """Compute cosine similarity between two metric vectors."""
    dot = sum(a * b for a, b in zip(v1, v2))
    mag1 = math.sqrt(sum(a * a for a in v1))
    mag2 = math.sqrt(sum(b * b for b in v2))
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot / (mag1 * mag2)


def _euclidean_similarity(v1: Tuple[int, ...], v2: Tuple[int, ...]) -> float:
    """Compute normalized similarity based on Euclidean distance."""
    dist = math.sqrt(sum((a - b) ** 2 for a, b in zip(v1, v2)))
    # Normalize: similarity = 1 / (1 + distance)
    return 1.0 / (1.0 + dist)


def compute_metric_similarity(
    metrics_a: SubmissionMetrics,
    metrics_b: SubmissionMetrics,
) -> float:
    """
    Compute structural similarity between two submissions based on code metrics.

    For each function in A, find the best-matching function in B by comparing
    metric vectors. Returns the average of the best cosine similarities,
    weighted by function size (line count).

    Returns:
        A similarity score between 0.0 and 1.0.
    """
    if not metrics_a.functions or not metrics_b.functions:
        return 0.0

    total_weight = 0.0
    weighted_sim = 0.0

    for fa in metrics_a.functions:
        vec_a = _metric_vector(fa)

        # Skip trivial functions (very few lines or no structure)
        if sum(vec_a) == 0:
            continue

        best_sim = 0.0
        for fb in metrics_b.functions:
            vec_b = _metric_vector(fb)
            if sum(vec_b) == 0:
                continue

            sim = _cosine_similarity(vec_a, vec_b)
            best_sim = max(best_sim, sim)

        weight = max(fa.line_count, 1)
        total_weight += weight
        weighted_sim += best_sim * weight

    if total_weight == 0:
        return 0.0

    return round(weighted_sim / total_weight, 4)
