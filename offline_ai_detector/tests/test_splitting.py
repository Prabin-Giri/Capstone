from src.data.splitting import (
    choose_group_key,
    compute_scaled_bucket_targets,
    split_records_by_bucket,
)


def test_splitting_prefers_problem_id_when_available() -> None:
    key = choose_group_key({"problem_id": "abc-123", "code": "print('hi')"})
    assert key == "problem::abc-123"


def test_splitting_falls_back_to_code_hash() -> None:
    key = choose_group_key({"code": "print('hi')"})
    assert key.startswith("codehash::")


def test_compute_scaled_bucket_targets_scales_down_proportionally() -> None:
    plans, scale = compute_scaled_bucket_targets(
        {"python_human": 100, "python_ai": 50},
        {"python_human": 100, "python_ai": 100},
    )
    assert scale == 0.5
    assert plans["python_human"].target_count == 50
    assert plans["python_ai"].target_count == 50


def test_split_records_keeps_problem_groups_together_and_supplemental_out_of_train() -> None:
    records = [
        {"id": "1", "code": "print('a')", "label": "human", "language": "python", "source_dataset": "codenet", "problem_id": "p1"},
        {"id": "2", "code": "print('b')", "label": "human", "language": "python", "source_dataset": "codenet", "problem_id": "p1"},
        {"id": "3", "code": "print('c')", "label": "human", "language": "python", "source_dataset": "codenet", "problem_id": "p2"},
        {"id": "4", "code": "print('d')", "label": "human", "language": "python", "source_dataset": "aigcodeset", "problem_id": "p3"},
    ]

    split_map = split_records_by_bucket(
        records,
        train_ratio=0.70,
        validation_ratio=0.15,
        test_ratio=0.15,
        random_seed=42,
        supplemental_eval_sources=["aigcodeset"],
    )

    train_problem_ids = {record.get("problem_id") for record in split_map["train"]}
    validation_problem_ids = {record.get("problem_id") for record in split_map["validation"]}
    test_problem_ids = {record.get("problem_id") for record in split_map["test"]}

    assert "p1" not in validation_problem_ids
    assert "p1" not in test_problem_ids
    assert not any(record["source_dataset"] == "aigcodeset" for record in split_map["train"])
