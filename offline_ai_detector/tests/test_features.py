from src.features.code_features import extract_code_features, feature_risk_notes


def test_extract_code_features_preserves_basic_python_signals() -> None:
    code = "# comment\nif True:\n    total = total + 1\n\n    print(total)\n"
    features = extract_code_features(code, language="python")

    assert features["line_count"] == 5.0
    assert features["blank_line_ratio"] > 0.0
    assert features["comment_line_ratio"] > 0.0
    assert features["indentation_max"] >= 4.0
    assert features["keyword_density"] > 0.0


def test_extract_code_features_handles_java_comments_and_identifiers() -> None:
    code = "/* block */\npublic class Main {\n    int total = total + 1;\n}\n"
    features = extract_code_features(code, language="java")

    assert features["comment_line_ratio"] > 0.0
    assert features["identifier_repetition_ratio"] > 0.0
    assert features["punctuation_operator_density"] > 0.0


def test_feature_risk_notes_warn_for_short_and_comment_heavy_code() -> None:
    notes = feature_risk_notes(
        {
            "token_count": 20.0,
            "comment_line_ratio": 0.5,
            "blank_line_ratio": 0.4,
            "indentation_max": 28.0,
            "identifier_repetition_ratio": 0.7,
        }
    )

    assert any("short code samples" in note for note in notes)
    assert any("comment density" in note for note in notes)


def test_extract_code_features_can_include_structural_signals() -> None:
    code = "def add(a, b):\n    return a + b\n"
    features = extract_code_features(code, language="python", include_structural=True)

    assert features["ast_parse_success"] == 1.0
    assert features["ast_node_count"] > 0.0
    assert features["ast_tree_depth"] >= 1.0
    assert features["ast_function_like_count"] >= 1.0
