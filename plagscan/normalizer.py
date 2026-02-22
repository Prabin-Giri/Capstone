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
        # Protect string literals first, then remove comments
        # This prevents "http://url" from being treated as a // comment
        protected = []
        def _protect_string(m):
            protected.append(m.group())
            return f'__STR_{len(protected) - 1}__'
        # Protect double-quoted, single-quoted, and backtick strings
        text = re.sub(r'"(?:[^"\\]|\\.)*"', _protect_string, text)
        text = re.sub(r"'(?:[^'\\]|\\.)*'", _protect_string, text)
        text = re.sub(r'`(?:[^`\\]|\\.)*`', _protect_string, text)
        # Now safely remove comments
        text = re.sub(r'//.*$', '', text, flags=re.MULTILINE)
        text = re.sub(r'/\*[\s\S]*?\*/', '', text)
        # Restore protected strings
        for i, s in enumerate(protected):
            text = text.replace(f'__STR_{i}__', s)
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


# ── Function-level splitting ────────────────────────────────────────

# Patterns that indicate the start of a function/method definition
_FUNC_PATTERNS = {
    'python': re.compile(
        r'^(\s*)(def|class)\s+\w+', re.MULTILINE
    ),
    'javascript': re.compile(
        r'(?:^|\s)(?:(?:async\s+)?function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(|class\s+\w+)',
        re.MULTILINE
    ),
    'java': re.compile(
        r'(?:public|private|protected|static|\s)+\s+\w+\s+\w+\s*\(|class\s+\w+',
        re.MULTILINE
    ),
    'cpp': re.compile(
        r'(?:\w+\s+)+\w+\s*\([^)]*\)\s*\{|class\s+\w+',
        re.MULTILINE
    ),
}


def _split_text_into_functions(text: str, lang: str) -> List[Tuple[str, int, int]]:
    """
    Split source text into function/class blocks.

    Returns:
        List of (function_text, start_line, end_line) tuples.
        If no functions detected, returns the entire text as one block.
    """
    lines = text.splitlines(True)  # keep line endings
    if not lines:
        return [(text, 1, 1)]

    # For Python, use indentation-based splitting
    if lang == 'python':
        return _split_python_functions(lines)

    # For brace-based languages, use brace counting
    if lang in ('javascript', 'java', 'cpp'):
        return _split_brace_functions(lines, lang)

    # Fallback: return entire text as one block
    return [(text, 1, len(lines))]


def _split_python_functions(lines: List[str]) -> List[Tuple[str, int, int]]:
    """
    Split Python code into functions/classes using indentation.
    Also captures top-level code (imports, if __name__ blocks, etc.)
    """
    func_pattern = re.compile(r'^(def|class)\s+\w+')
    functions: List[Tuple[str, int, int]] = []

    func_start = None
    func_lines: List[str] = []
    # Collect top-level code before the first function
    top_level_lines: List[str] = []
    top_level_start = 0

    for i, line in enumerate(lines):
        stripped = line.lstrip()

        # Check if this line starts a new top-level function/class
        if func_pattern.match(stripped) and (len(line) - len(stripped) == 0 or
                                              (len(line) - len(stripped) <= 4)):
            # Save top-level code before first function
            if func_start is None and top_level_lines:
                # Only add if there's meaningful content (not just blank lines)
                content = ''.join(top_level_lines).strip()
                if content:
                    functions.append((
                        ''.join(top_level_lines),
                        top_level_start + 1,
                        top_level_start + len(top_level_lines),
                    ))

            # Save previous function if exists
            if func_start is not None and func_lines:
                functions.append((
                    ''.join(func_lines),
                    func_start + 1,  # 1-indexed
                    func_start + len(func_lines),
                ))

            func_start = i
            func_lines = [line]
        elif func_start is not None:
            func_lines.append(line)
        else:
            # Top-level code before first function
            top_level_lines.append(line)

    # Save last function
    if func_start is not None and func_lines:
        functions.append((
            ''.join(func_lines),
            func_start + 1,
            func_start + len(func_lines),
        ))

    if not functions:
        return [(''.join(lines), 1, len(lines))]

    return functions


def _split_brace_functions(
    lines: List[str], lang: str,
) -> List[Tuple[str, int, int]]:
    """
    Split brace-based languages into functions by tracking { } nesting.
    """
    pattern = _FUNC_PATTERNS.get(lang)
    if not pattern:
        return [(''.join(lines), 1, len(lines))]

    full_text = ''.join(lines)
    functions: List[Tuple[str, int, int]] = []

    # Find function starts
    for match in pattern.finditer(full_text):
        start_pos = match.start()

        # Find the opening brace
        brace_pos = full_text.find('{', match.end())
        if brace_pos == -1:
            continue

        # Count braces to find the end
        depth = 1
        pos = brace_pos + 1
        while pos < len(full_text) and depth > 0:
            if full_text[pos] == '{':
                depth += 1
            elif full_text[pos] == '}':
                depth -= 1
            pos += 1

        func_text = full_text[start_pos:pos]
        start_line = full_text[:start_pos].count('\n') + 1
        end_line = full_text[:pos].count('\n') + 1

        functions.append((func_text, start_line, end_line))

    if not functions:
        return [(''.join(lines), 1, len(lines))]

    return functions


def split_submission_into_functions(
    submission: Submission,
) -> List[TokenizedSubmission]:
    """
    Split a submission into individual function-level token streams.

    Each function in each file becomes its own TokenizedSubmission.
    The submission_id is formatted as "original_id::filename::func_N".

    Returns:
        List of TokenizedSubmission, one per function found.
        Returns at least one (the whole file) if no functions detected.
    """
    function_submissions: List[TokenizedSubmission] = []

    sorted_files = sorted(submission.files, key=lambda f: f.relative_path)

    for source_file in sorted_files:
        lang = _detect_language(source_file.relative_path)
        cleaned = _remove_comments(source_file.text, lang)

        func_blocks = _split_text_into_functions(cleaned, lang)

        for idx, (func_text, start_line, end_line) in enumerate(func_blocks):
            raw_tokens, locations = _tokenize_and_locate(
                func_text, source_file.relative_path
            )

            # Adjust line numbers to be relative to the original file
            adjusted_locations = []
            for loc in locations:
                adjusted_locations.append(TokenLocation(
                    file_path=loc.file_path,
                    start_line=loc.start_line + start_line - 1,
                    end_line=loc.end_line + start_line - 1,
                ))

            # Normalize tokens
            normalized = [
                _normalize_token(tok, ALL_KEYWORDS)
                for tok in raw_tokens
            ]

            if normalized:  # Only add non-empty functions
                func_id = f"{submission.id}::{source_file.relative_path}::func_{idx}"
                function_submissions.append(TokenizedSubmission(
                    submission_id=func_id,
                    tokens=normalized,
                    token_locations=adjusted_locations,
                ))

    return function_submissions

