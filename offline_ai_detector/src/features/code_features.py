"""Lightweight code-aware auxiliary features.

Phase 6 purpose:
- compute interpretable, low-cost code features that can support reporting,
  later ablations, or a future ensemble layer
- keep the feature logic separate from the main classifier so it does not
  silently become the detector itself

Main failure risks this module is trying to prevent:
- shortcut learning from brittle formatting or source-specific conventions
- over-engineering into AST-heavy or expensive analysis before the baseline works
- pretending these features are causal proof instead of weak auxiliary signals
"""

from __future__ import annotations

from dataclasses import dataclass
import math
import re
from typing import Iterable

from ..data.cleaning import normalize_code_text


TOKEN_RE = re.compile(r"[A-Za-z_]\w*|==|!=|<=|>=|->|&&|\|\||[{}()\[\].,;:+\-*/%<>=!&|^~]")
IDENTIFIER_RE = re.compile(r"[A-Za-z_]\w*")
PYTHON_KEYWORDS = {
    "and", "as", "assert", "break", "class", "continue", "def", "del", "elif", "else", "except",
    "False", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "None",
    "nonlocal", "not", "or", "pass", "raise", "return", "True", "try", "while", "with", "yield",
}
JAVA_KEYWORDS = {
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
    "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
    "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
    "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
    "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
    "volatile", "while", "true", "false", "null",
}
PUNCTUATION_OPERATOR_CHARS = set("{}()[];:.,+-*/%<>=!&|^~")


@dataclass(slots=True)
class CodeFeatureVector:
    line_count: float
    non_empty_line_count: float
    blank_line_ratio: float
    character_count: float
    token_count: float
    average_line_length: float
    indentation_mean: float
    indentation_max: float
    indentation_std: float
    comment_line_ratio: float
    identifier_repetition_ratio: float
    punctuation_operator_density: float
    keyword_density: float
    ast_parse_success: float
    ast_node_count: float
    ast_tree_depth: float
    ast_branching_node_count: float
    ast_function_like_count: float

    def to_dict(self) -> dict[str, float]:
        return {
            "line_count": self.line_count,
            "non_empty_line_count": self.non_empty_line_count,
            "blank_line_ratio": self.blank_line_ratio,
            "character_count": self.character_count,
            "token_count": self.token_count,
            "average_line_length": self.average_line_length,
            "indentation_mean": self.indentation_mean,
            "indentation_max": self.indentation_max,
            "indentation_std": self.indentation_std,
            "comment_line_ratio": self.comment_line_ratio,
            "identifier_repetition_ratio": self.identifier_repetition_ratio,
            "punctuation_operator_density": self.punctuation_operator_density,
            "keyword_density": self.keyword_density,
            "ast_parse_success": self.ast_parse_success,
            "ast_node_count": self.ast_node_count,
            "ast_tree_depth": self.ast_tree_depth,
            "ast_branching_node_count": self.ast_branching_node_count,
            "ast_function_like_count": self.ast_function_like_count,
        }


def extract_code_features(
    code: str,
    *,
    language: str | None = None,
    tab_width: int = 4,
    include_structural: bool = False,
) -> dict[str, float]:
    """Extract lightweight code-aware features.

    Important design choice:
    - this function does not alter syntax or normalize identifiers
    - it operates on conservatively cleaned code only
    - outputs are intentionally simple enough to inspect and debug
    """

    normalized = normalize_code_text(code)
    lines = normalized.splitlines() if normalized else []
    non_empty_lines = [line for line in lines if line.strip()]
    line_count = len(lines)
    non_empty_line_count = len(non_empty_lines)

    token_list = TOKEN_RE.findall(normalized)
    identifier_tokens = _identifier_tokens(normalized, language=language)
    indentation_levels = [_indentation_width(line, tab_width=tab_width) for line in non_empty_lines]
    comment_line_count = _comment_line_count(lines, language=language)
    punctuation_chars = sum(1 for char in normalized if char in PUNCTUATION_OPERATOR_CHARS)
    keyword_count = _keyword_count(token_list, language=language)
    structural_features = _structural_features(normalized, language=language) if include_structural else {
        "ast_parse_success": 0.0,
        "ast_node_count": 0.0,
        "ast_tree_depth": 0.0,
        "ast_branching_node_count": 0.0,
        "ast_function_like_count": 0.0,
    }

    feature_vector = CodeFeatureVector(
        line_count=float(line_count),
        non_empty_line_count=float(non_empty_line_count),
        blank_line_ratio=float((line_count - non_empty_line_count) / max(1, line_count)),
        character_count=float(len(normalized)),
        token_count=float(len(token_list)),
        average_line_length=float(sum(len(line) for line in lines) / max(1, line_count)),
        indentation_mean=float(sum(indentation_levels) / max(1, len(indentation_levels))) if indentation_levels else 0.0,
        indentation_max=float(max(indentation_levels)) if indentation_levels else 0.0,
        indentation_std=float(_stddev(indentation_levels)),
        comment_line_ratio=float(comment_line_count / max(1, line_count)),
        identifier_repetition_ratio=float(_identifier_repetition_ratio(identifier_tokens)),
        punctuation_operator_density=float(punctuation_chars / max(1, len(normalized))),
        keyword_density=float(keyword_count / max(1, len(token_list))),
        ast_parse_success=structural_features["ast_parse_success"],
        ast_node_count=structural_features["ast_node_count"],
        ast_tree_depth=structural_features["ast_tree_depth"],
        ast_branching_node_count=structural_features["ast_branching_node_count"],
        ast_function_like_count=structural_features["ast_function_like_count"],
    )
    return feature_vector.to_dict()


def feature_risk_notes(features: dict[str, float]) -> list[str]:
    """Explain where feature values may be misleading.

    These notes are intentionally phrased as caveats, not conclusions. The goal
    is to remind future users that these signals are domain-sensitive.
    """

    notes: list[str] = []
    if features["token_count"] < 50:
        notes.append("short code samples make feature-based interpretation less reliable")
    if features["comment_line_ratio"] > 0.30:
        notes.append("high comment density may reflect dataset conventions rather than authorship style")
    if features["blank_line_ratio"] > 0.35:
        notes.append("blank-line ratio can vary by IDE formatting or assignment style")
    if features["indentation_max"] > 24:
        notes.append("deep indentation may reflect problem structure rather than generation source")
    if features["identifier_repetition_ratio"] > 0.60:
        notes.append("identifier repetition can become a shortcut on templated assignments")
    if features.get("ast_parse_success", 0.0) == 0.0 and features.get("ast_node_count", 0.0) == 0.0:
        notes.append("AST structural features were unavailable or parsing failed for this sample")
    return notes


def _identifier_tokens(code: str, *, language: str | None) -> list[str]:
    keywords = _language_keywords(language)
    return [
        token
        for token in IDENTIFIER_RE.findall(code)
        if token not in keywords
    ]


def _identifier_repetition_ratio(identifiers: Iterable[str]) -> float:
    identifier_list = list(identifiers)
    if not identifier_list:
        return 0.0
    unique_count = len(set(identifier_list))
    return (len(identifier_list) - unique_count) / len(identifier_list)


def _language_keywords(language: str | None) -> set[str]:
    normalized = (language or "").strip().lower()
    if normalized == "python":
        return {keyword.lower() for keyword in PYTHON_KEYWORDS}
    if normalized == "java":
        return {keyword.lower() for keyword in JAVA_KEYWORDS}
    return {keyword.lower() for keyword in (PYTHON_KEYWORDS | JAVA_KEYWORDS)}


def _keyword_count(tokens: Iterable[str], *, language: str | None) -> int:
    keywords = _language_keywords(language)
    return sum(1 for token in tokens if token.lower() in keywords)


def _indentation_width(line: str, *, tab_width: int) -> int:
    width = 0
    for char in line:
        if char == " ":
            width += 1
        elif char == "\t":
            width += tab_width
        else:
            break
    return width


def _comment_line_count(lines: list[str], *, language: str | None) -> int:
    normalized_language = (language or "").strip().lower()
    comment_lines = 0
    in_block_comment = False

    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped:
            continue

        if normalized_language == "python":
            if stripped.startswith("#"):
                comment_lines += 1
            continue

        if in_block_comment:
            comment_lines += 1
            if "*/" in stripped:
                in_block_comment = False
            continue

        if stripped.startswith("//"):
            comment_lines += 1
            continue
        if stripped.startswith("/*"):
            comment_lines += 1
            if "*/" not in stripped:
                in_block_comment = True
            continue

    return comment_lines


def _stddev(values: list[int]) -> float:
    if len(values) <= 1:
        return 0.0
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return math.sqrt(variance)


def _structural_features(code: str, *, language: str | None) -> dict[str, float]:
    normalized_language = (language or "").strip().lower()
    if normalized_language == "python":
        return _python_structural_features(code)
    if normalized_language == "java":
        return _java_structural_features(code)
    return {
        "ast_parse_success": 0.0,
        "ast_node_count": 0.0,
        "ast_tree_depth": 0.0,
        "ast_branching_node_count": 0.0,
        "ast_function_like_count": 0.0,
    }


def _python_structural_features(code: str) -> dict[str, float]:
    try:
        import ast
    except ImportError:
        return _empty_structural_features()

    try:
        tree = ast.parse(code)
    except SyntaxError:
        return _empty_structural_features()

    node_count = 0
    max_depth = 0
    branching_nodes = 0
    function_like = 0

    def walk(node: ast.AST, depth: int) -> None:
        nonlocal node_count, max_depth, branching_nodes, function_like
        node_count += 1
        max_depth = max(max_depth, depth)
        children = list(ast.iter_child_nodes(node))
        if len(children) > 1:
            branching_nodes += 1
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            function_like += 1
        for child in children:
            walk(child, depth + 1)

    walk(tree, 0)
    return {
        "ast_parse_success": 1.0,
        "ast_node_count": float(node_count),
        "ast_tree_depth": float(max_depth),
        "ast_branching_node_count": float(branching_nodes),
        "ast_function_like_count": float(function_like),
    }


def _java_structural_features(code: str) -> dict[str, float]:
    try:
        import javalang
    except ImportError:
        return _empty_structural_features()

    try:
        tree = javalang.parse.parse(code)
    except (javalang.parser.JavaSyntaxError, IndexError, TypeError, AttributeError):
        return _empty_structural_features()

    node_count = 0
    max_depth = 0
    branching_nodes = 0
    function_like = 0

    method_type = getattr(javalang.tree, "MethodDeclaration", None)
    ctor_type = getattr(javalang.tree, "ConstructorDeclaration", None)
    callable_types = tuple(
        item for item in (method_type, ctor_type) if item is not None
    )

    for path, node in tree:
        node_count += 1
        max_depth = max(max_depth, len(path))
        child_count = _java_child_node_count(node)
        if child_count > 1:
            branching_nodes += 1
        if callable_types and isinstance(node, callable_types):
            function_like += 1

    return {
        "ast_parse_success": 1.0,
        "ast_node_count": float(node_count),
        "ast_tree_depth": float(max_depth),
        "ast_branching_node_count": float(branching_nodes),
        "ast_function_like_count": float(function_like),
    }


def _java_child_node_count(node: object) -> int:
    children = getattr(node, "children", None)
    if not children:
        return 0
    count = 0
    stack = list(children) if isinstance(children, (list, tuple)) else [children]
    while stack:
        current = stack.pop()
        if current is None:
            continue
        if isinstance(current, (list, tuple)):
            stack.extend(current)
            continue
        if hasattr(current, "children"):
            count += 1
    return count


def _empty_structural_features() -> dict[str, float]:
    return {
        "ast_parse_success": 0.0,
        "ast_node_count": 0.0,
        "ast_tree_depth": 0.0,
        "ast_branching_node_count": 0.0,
        "ast_function_like_count": 0.0,
    }
