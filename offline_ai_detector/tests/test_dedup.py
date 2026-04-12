from src.data.dedup import deduplicate_records


def test_deduplicate_records_prefers_higher_priority_source() -> None:
    records = [
        {
            "id": "a",
            "code": "print('x')",
            "label": "ai",
            "language": "python",
            "source_dataset": "codemirage",
        },
        {
            "id": "b",
            "code": "print('x')",
            "label": "ai",
            "language": "python",
            "source_dataset": "multiaigcd",
        },
    ]

    deduped, summary = deduplicate_records(records, source_priority=["multiaigcd", "codemirage"])
    assert len(deduped) == 1
    assert deduped[0]["source_dataset"] == "multiaigcd"
    assert summary.dropped_exact_duplicates == 1


def test_deduplicate_records_drops_conflicting_labels() -> None:
    records = [
        {
            "id": "a",
            "code": "print('x')",
            "label": "human",
            "language": "python",
            "source_dataset": "codenet",
        },
        {
            "id": "b",
            "code": "print('x')",
            "label": "ai",
            "language": "python",
            "source_dataset": "multiaigcd",
        },
    ]

    deduped, summary = deduplicate_records(records, source_priority=["codenet", "multiaigcd"])
    assert deduped == []
    assert summary.conflicting_hashes == 1
