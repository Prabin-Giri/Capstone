from src.data.schema import normalize_record, validate_and_normalize_record, validate_record


def test_schema_requires_core_fields() -> None:
    errors = validate_record({"id": "one", "language": "python", "label": "human"})
    fields = {error.field for error in errors}
    assert "code" in fields
    assert "source_dataset" in fields


def test_schema_accepts_minimal_valid_record() -> None:
    errors = validate_record(
        {
            "id": "one",
            "code": "print('hello')",
            "language": "python",
            "label": "human",
            "source_dataset": "codenet",
        }
    )
    assert not errors


def test_schema_normalizes_aliases_and_optional_nulls() -> None:
    record = normalize_record(
        {
            "id": "sample-1",
            "code": "print('hello')",
            "language": "Python 3",
            "label": "AI_GENERATED",
            "source_dataset": "multiaigcd",
            "is_paraphrased": "yes",
        }
    )
    assert record.language == "python"
    assert record.label == "ai"
    assert record.is_paraphrased is True
    assert record.problem_id is None
    assert record.task_id is None


def test_schema_rejects_unsupported_language() -> None:
    errors = validate_record(
        {
            "id": "one",
            "code": "console.log('hi')",
            "language": "javascript",
            "label": "human",
            "source_dataset": "custom",
        }
    )
    assert any(error.field == "language" for error in errors)


def test_schema_rejects_bad_boolean_value() -> None:
    errors = validate_record(
        {
            "id": "one",
            "code": "print('hi')",
            "language": "python",
            "label": "human",
            "source_dataset": "codenet",
            "is_paraphrased": "maybe",
        }
    )
    assert any(error.field == "is_paraphrased" for error in errors)


def test_validate_and_normalize_record_raises_with_all_errors() -> None:
    try:
        validate_and_normalize_record({"language": "ruby"})
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("Expected schema validation to raise")

    assert "id" in message
    assert "code" in message
    assert "label" in message
