"""Conservative code cleaning helpers.

Phase 4 purpose:
- normalize only the low-risk formatting issues we are confident about
- preserve indentation, punctuation, braces, identifiers, and most formatting
- flag broken or suspicious samples explicitly instead of silently rewriting them

Main failure risks this module is trying to prevent:
- aggressive cleaning that deletes authorship-style signals
- flattening whitespace in ways that alter Python structure
- dropping comments or identifiers before we know whether they matter
- inconsistent preprocessing between datasets that inflates downstream metrics
"""

from __future__ import annotations

from dataclasses import dataclass
import re


TOKEN_RE = re.compile(r"\S+")
CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


@dataclass(slots=True)
class CodeCleaningResult:
    cleaned_code: str
    token_count: int
    char_count: int
    line_count: int
    changed_line_endings: bool
    stripped_trailing_spaces: bool
    expanded_tabs: bool
    trimmed_terminal_blank_lines: bool
    had_null_bytes: bool
    had_suspicious_control_chars: bool
    is_empty_after_cleaning: bool
    is_broken: bool
    is_short_candidate: bool


def normalize_code_text(code: str) -> str:
    """Backward-compatible wrapper for default conservative cleaning.

    Kept for callers that only need the cleaned code text, but the richer
    `clean_code_sample(...)` API should be preferred for Phase 4+ logic.
    """

    return clean_code_sample(code).cleaned_code


def token_count(code: str) -> int:
    return len(TOKEN_RE.findall(code))


def clean_code_sample(
    code: str,
    *,
    normalize_line_endings: bool = True,
    strip_trailing_spaces: bool = True,
    expand_tabs: bool = False,
    tab_width: int = 4,
    trim_terminal_blank_lines: bool = True,
    preserve_comments: bool = True,
    min_tokens_warn: int = 50,
) -> CodeCleaningResult:
    """Clean code conservatively and report what changed.

    Important choices:
    - comments are preserved
    - indentation is preserved unless tabs are explicitly expanded
    - punctuation, braces, semicolons, and identifiers are preserved
    - internal blank lines are preserved

    What can go wrong:
    - aggressive cleaning can remove precisely the cues the detector needs
    - converting tabs by default could alter indentation-sensitive Python code
    - removing comments too early could hide meaningful authorship signals
    """

    if not preserve_comments:
        raise ValueError(
            "Phase 4 does not support comment stripping. Keeping comments is a deliberate conservative choice."
        )

    working = code if isinstance(code, str) else str(code)
    had_null_bytes = "\x00" in working
    had_suspicious_control_chars = bool(CONTROL_CHARS_RE.search(working.replace("\r", "").replace("\n", "").replace("\t", "")))

    changed_line_endings = False
    if normalize_line_endings and "\r" in working:
        changed_line_endings = True
        working = working.replace("\r\n", "\n").replace("\r", "\n")

    lines = working.split("\n")
    expanded_tabs_flag = False
    stripped_trailing_spaces_flag = False
    cleaned_lines: list[str] = []

    for line in lines:
        updated = line
        if expand_tabs and "\t" in updated:
            updated = updated.expandtabs(tab_width)
            expanded_tabs_flag = True
        if strip_trailing_spaces:
            trimmed = updated.rstrip(" \t")
            if trimmed != updated:
                stripped_trailing_spaces_flag = True
            updated = trimmed
        cleaned_lines.append(updated)

    trimmed_terminal_blank_lines_flag = False
    if trim_terminal_blank_lines and cleaned_lines:
        start = 0
        end = len(cleaned_lines)
        while start < end and cleaned_lines[start] == "":
            start += 1
            trimmed_terminal_blank_lines_flag = True
        while end > start and cleaned_lines[end - 1] == "":
            end -= 1
            trimmed_terminal_blank_lines_flag = True
        cleaned_lines = cleaned_lines[start:end]

    cleaned_code = "\n".join(cleaned_lines)
    cleaned_token_count = token_count(cleaned_code)
    cleaned_line_count = len(cleaned_code.splitlines()) if cleaned_code else 0
    is_empty_after_cleaning = not cleaned_code.strip()
    is_broken = had_null_bytes or had_suspicious_control_chars or is_empty_after_cleaning
    is_short_candidate = (not is_empty_after_cleaning) and cleaned_token_count < min_tokens_warn

    return CodeCleaningResult(
        cleaned_code=cleaned_code,
        token_count=cleaned_token_count,
        char_count=len(cleaned_code),
        line_count=cleaned_line_count,
        changed_line_endings=changed_line_endings,
        stripped_trailing_spaces=stripped_trailing_spaces_flag,
        expanded_tabs=expanded_tabs_flag,
        trimmed_terminal_blank_lines=trimmed_terminal_blank_lines_flag,
        had_null_bytes=had_null_bytes,
        had_suspicious_control_chars=had_suspicious_control_chars,
        is_empty_after_cleaning=is_empty_after_cleaning,
        is_broken=is_broken,
        is_short_candidate=is_short_candidate,
    )


def is_usable_code_sample(code: str, *, min_tokens: int = 50) -> bool:
    result = clean_code_sample(code, min_tokens_warn=min_tokens)
    if result.is_broken:
        return False
    return result.token_count >= min_tokens
