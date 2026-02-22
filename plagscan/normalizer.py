"""
Step 2: Normalizer — Tokenize and normalize source code.

Regex-based tokenizer that:
  - Removes comments (best-effort, per language family)
  - Splits code into tokens
  - Normalizes identifiers/numbers/strings to generic placeholders
  - Preserves keywords and operators
  - Tracks token -> original source location mapping
"""

import re
from typing import Dict, List, Set, Tuple

from .models import SourceFile, Submission, TokenLocation, TokenizedSubmission

# ── Language-specific keyword sets ──────────────────────────────────

PYTHON_KEYWORDS: Set[str] = {
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
    'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from',
    'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not',
    'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
    'True', 'False', 'None', 'print',
}

JS_KEYWORDS: Set[str] = {
    'async', 'await', 'break', 'case', 'catch', 'class', 'const',
    'continue', 'debugger', 'default', 'delete', 'do', 'else', 'export',
    'extends', 'finally', 'for', 'function', 'if', 'import', 'in',
    'instanceof', 'let', 'new', 'of', 'return', 'super', 'switch',
    'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with',
    'yield', 'true', 'false', 'null', 'undefined', 'console',
}

JAVA_KEYWORDS: Set[str] = {
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch',
    'char', 'class', 'continue', 'default', 'do', 'double', 'else',
    'enum', 'extends', 'final', 'finally', 'float', 'for', 'if',
    'implements', 'import', 'instanceof', 'int', 'interface', 'long',
    'native', 'new', 'package', 'private', 'protected', 'public',
    'return', 'short', 'static', 'strictfp', 'super', 'switch',
    'synchronized', 'this', 'throw', 'throws', 'transient', 'try',
    'void', 'volatile', 'while', 'true', 'false', 'null',
    'System', 'String',
}

CPP_KEYWORDS: Set[str] = {
    'auto', 'break', 'case', 'char', 'class', 'const', 'continue',
    'default', 'delete', 'do', 'double', 'else', 'enum', 'extern',
    'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long',
    'namespace', 'new', 'operator', 'private', 'protected', 'public',
    'register', 'return', 'short', 'signed', 'sizeof', 'static',
    'struct', 'switch', 'template', 'this', 'throw', 'try', 'typedef',
    'union', 'unsigned', 'virtual', 'void', 'volatile', 'while',
    'bool', 'true', 'false', 'nullptr', 'using', 'include',
    'cout', 'cin', 'endl', 'string', 'vector', 'map', 'set',
}

# Combined set of all keywords (for language-agnostic mode)
ALL_KEYWORDS: Set[str] = PYTHON_KEYWORDS | JS_KEYWORDS | JAVA_KEYWORDS | CPP_KEYWORDS

# ── Language detection ──────────────────────────────────────────────

LANG_MAP: Dict[str, str] = {
    '.py': 'python',
    '.java': 'java',
    '.js': 'javascript', '.jsx': 'javascript',
    '.ts': 'javascript', '.tsx': 'javascript',
    '.c': 'cpp', '.cpp': 'cpp', '.h': 'cpp',
    '.cs': 'java',       # C# is close enough to Java for tokenization
    '.php': 'javascript', # PHP is close enough for basic tokenization
    '.html': 'html',
    '.css': 'css',
    '.rb': 'python',      # Ruby is close enough for basic tokenization
    '.go': 'cpp',
    '.rs': 'cpp',
    '.swift': 'java',
    '.kt': 'java',
}


def _detect_language(file_path: str) -> str:
    """Detect language family from file extension."""
    import os
    ext = os.path.splitext(file_path)[1].lower()
    return LANG_MAP.get(ext, 'generic')


# ── Comment removal ─────────────────────────────────────────────────

def _remove_comments(text: str, lang: str) -> str:
    """Remove comments from source code (best-effort)."""
    if lang == 'python':
        # Remove # comments and triple-quoted strings used as docstrings
        text = re.sub(r'#.*$', '', text, flags=re.MULTILINE)
        text = re.sub(r'"""[\s\S]*?"""', '', text)
        text = re.sub(r"'''[\s\S]*?'''", '', text)
    elif lang in ('javascript', 'java', 'cpp'):
        # Remove // and /* */ comments
        text = re.sub(r'//.*$', '', text, flags=re.MULTILINE)
        text = re.sub(r'/\*[\s\S]*?\*/', '', text)
    elif lang == 'html':
        text = re.sub(r'<!--[\s\S]*?-->', '', text)
    elif lang == 'css':
        text = re.sub(r'/\*[\s\S]*?\*/', '', text)
    else:
        # Generic: remove both # and // and /* */
        text = re.sub(r'#.*$', '', text, flags=re.MULTILINE)
        text = re.sub(r'//.*$', '', text, flags=re.MULTILINE)
        text = re.sub(r'/\*[\s\S]*?\*/', '', text)
    return text


# ── Tokenization ────────────────────────────────────────────────────

# Regex to split code into tokens:
#   - Quoted strings (single/double/backtick)
#   - Numbers (int/float/hex)
#   - Identifiers (words)
#   - Operators and punctuation
_TOKEN_PATTERN = re.compile(
    r'(?:'
    r'"(?:[^"\\]|\\.)*"'          # double-quoted string
    r"|'(?:[^'\\]|\\.)*'"         # single-quoted string
    r'|`(?:[^`\\]|\\.)*`'         # backtick template literal
    r'|0[xX][0-9a-fA-F]+'        # hex number
    r'|\d+\.?\d*(?:[eE][+-]?\d+)?' # decimal number
    r'|[a-zA-Z_]\w*'             # identifier/keyword
    r'|[+\-*/%=<>!&|^~?:;,.{}()\[\]]'  # operators/punctuation
    r')'
)


def _tokenize_and_locate(
    text: str,
    file_path: str,
) -> Tuple[List[str], List[TokenLocation]]:
    """
    Tokenize source text and return both raw tokens and their locations.

    Returns:
        (raw_tokens, locations) — parallel lists.
    """
    raw_tokens: List[str] = []
    locations: List[TokenLocation] = []

    for line_num, line in enumerate(text.splitlines(), start=1):
        for match in _TOKEN_PATTERN.finditer(line):
            token = match.group()
            raw_tokens.append(token)
            locations.append(TokenLocation(
                file_path=file_path,
                start_line=line_num,
                end_line=line_num,
            ))

    return raw_tokens, locations


# ── Normalization ───────────────────────────────────────────────────

def _normalize_token(token: str, keywords: Set[str]) -> str:
    """
    Normalize a single token:
      - Keywords/operators stay as-is
      - String literals  -> STR
      - Numbers          -> NUM
      - Identifiers      -> ID
    """
    # String literal
    if token and token[0] in ('"', "'", '`'):
        return 'STR'

    # Number
    if token and (token[0].isdigit() or
                  (token.startswith('0x') or token.startswith('0X'))):
        return 'NUM'

    # Keyword — keep as-is
    if token in keywords:
        return token

    # Single-char operator/punctuation — keep as-is
    if len(token) == 1 and not token.isalnum() and token != '_':
        return token

    # Identifier — normalize
    if token and (token[0].isalpha() or token[0] == '_'):
        return 'ID'

    return token


# ── Public API ──────────────────────────────────────────────────────

def normalize_submission(submission: Submission) -> TokenizedSubmission:
    """
    Tokenize and normalize all files in a submission.

    Files are processed in sorted order (by relative_path) for determinism.
    A FILE_BOUNDARY marker is inserted between files.

    Returns:
        TokenizedSubmission with normalized tokens and location mappings.
    """
    all_tokens: List[str] = []
    all_locations: List[TokenLocation] = []

    # Sort files by path for deterministic ordering
    sorted_files = sorted(submission.files, key=lambda f: f.relative_path)

    for i, source_file in enumerate(sorted_files):
        # Insert boundary marker between files
        if i > 0:
            all_tokens.append('FILE_BOUNDARY')
            all_locations.append(TokenLocation(
                file_path=source_file.relative_path,
                start_line=0,
                end_line=0,
            ))

        lang = _detect_language(source_file.relative_path)
        cleaned = _remove_comments(source_file.text, lang)
        raw_tokens, locations = _tokenize_and_locate(
            cleaned, source_file.relative_path
        )

        # Normalize each token
        for token, loc in zip(raw_tokens, locations):
            normalized = _normalize_token(token, ALL_KEYWORDS)
            all_tokens.append(normalized)
            all_locations.append(loc)

    return TokenizedSubmission(
        submission_id=submission.id,
        tokens=all_tokens,
        token_locations=all_locations,
    )
