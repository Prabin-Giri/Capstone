from src.models.evaluation import compute_classification_metrics, compute_trainer_selection_metrics


def test_compute_classification_metrics_includes_per_language_breakdown() -> None:
    logits = [
        [2.5, 0.1],
        [0.1, 2.2],
        [2.0, 0.2],
        [0.2, 2.4],
    ]
    metrics = compute_classification_metrics(
        labels=[0, 1, 0, 1],
        logits=logits,
        languages=["python", "python", "java", "java"],
    )

    assert metrics["accuracy"] == 1.0
    assert metrics["confusion_matrix"] == [[2, 0], [0, 2]]
    assert set(metrics["per_language_metrics"]) == {"python", "java"}
    assert metrics["per_language_metrics"]["python"]["sample_count"] == 2


def test_trainer_selection_metrics_returns_core_scalars() -> None:
    metrics = compute_trainer_selection_metrics(
        (
            [[2.0, 0.1], [0.2, 1.8], [1.7, 0.3], [0.3, 1.9]],
            [0, 1, 0, 1],
        )
    )

    assert metrics["accuracy"] == 1.0
    assert metrics["f1"] == 1.0
    assert metrics["precision"] == 1.0
    assert metrics["recall"] == 1.0
