from src.data.cleaning import clean_code_sample, is_usable_code_sample, normalize_code_text


def test_normalize_code_text_only_cleans_line_endings_and_trailing_space() -> None:
    raw = "def f():  \r\n    return 1\t \r\n"
    assert normalize_code_text(raw) == "def f():\n    return 1"


def test_clean_code_sample_preserves_indentation_and_comments_by_default() -> None:
    raw = "\n# student comment\r\nif True:\r\n\tprint('x')  \r\n"
    result = clean_code_sample(raw)

    assert result.cleaned_code == "# student comment\nif True:\n\tprint('x')"
    assert "\tprint('x')" in result.cleaned_code
    assert "# student comment" in result.cleaned_code
    assert result.expanded_tabs is False
    assert result.stripped_trailing_spaces is True


def test_clean_code_sample_can_expand_tabs_when_explicitly_requested() -> None:
    result = clean_code_sample("\tprint('x')", expand_tabs=True, tab_width=4)
    assert result.cleaned_code == "    print('x')"
    assert result.expanded_tabs is True


def test_clean_code_sample_flags_broken_null_byte_samples() -> None:
    result = clean_code_sample("print('x')\x00")
    assert result.is_broken is True


def test_is_usable_code_sample_respects_minimum_token_rule() -> None:
    assert is_usable_code_sample("x = 1", min_tokens=5) is False
