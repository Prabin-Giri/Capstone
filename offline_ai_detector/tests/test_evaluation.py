from types import SimpleNamespace

from src.models.evaluation import (
    build_phase10_evaluation_report,
    build_prediction_rows,
    compute_classification_metrics,
    compute_group_metrics,
    compute_length_bucket_metrics,
    compute_robustness_slice_metrics,
    compute_trainer_selection_metrics,
)


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


def test_phase10_report_helpers_cover_sources_lengths_and_examples() -> None:
    samples = [
        SimpleNamespace(
            id="py_human_fp",
            code="print('x')\n" * 60,
            language="python",
            label="human",
            source_dataset="codenet",
        ),
        SimpleNamespace(
            id="py_ai_tp",
            code="def solve(x):\n    return x + 1\n" * 40,
            language="python",
            label="ai",
            source_dataset="multiaigcd",
            edit_type="paraphrased rewrite",
            is_paraphrased=True,
            prompt_type="paraphrased",
            notes=None,
            problem_id="p1",
            task_id="t1",
            generator_model="model-a",
        ),
        SimpleNamespace(
            id="java_human_tn",
            code="public class Main { public static void main(String[] args) { } }\n" * 20,
            language="java",
            label="human",
            source_dataset="codenet",
            edit_type=None,
            is_paraphrased=None,
            prompt_type=None,
            notes=None,
            problem_id="p2",
            task_id="t2",
            generator_model=None,
        ),
        SimpleNamespace(
            id="java_ai_fn",
            code="class Main { static int f(int x){ return x + 1; } }\n" * 50,
            language="java",
            label="ai",
            source_dataset="codemirage",
            edit_type="human_edit",
            is_paraphrased=False,
            prompt_type="mixed",
            notes="hybrid sample",
            problem_id="p3",
            task_id="t3",
            generator_model="model-b",
        ),
    ]
    logits = [
        [0.1, 2.0],  # false positive
        [0.1, 2.2],  # true positive
        [2.0, 0.1],  # true negative
        [2.1, 0.2],  # false negative
    ]
    rows = build_prediction_rows(samples=samples, logits=logits)

    source_metrics = compute_group_metrics(rows, "source_dataset")
    assert set(source_metrics) == {"codenet", "codemirage", "multiaigcd"}
    assert source_metrics["codenet"]["sample_count"] == 2

    length_metrics = compute_length_bucket_metrics(rows)
    assert any(bucket in length_metrics for bucket in {"80-159", "160-319", "320-639"})
    robustness_metrics = compute_robustness_slice_metrics(rows)
    assert "paraphrased_ai" in robustness_metrics
    assert "edited_ai" in robustness_metrics
    assert "hybrid_candidate" in robustness_metrics

    metrics = compute_classification_metrics(
        labels=[0, 1, 0, 1],
        logits=logits,
        languages=["python", "python", "java", "java"],
    )
    report_text, summary = build_phase10_evaluation_report(
        split_name="test",
        metrics=metrics,
        prediction_rows=rows,
        max_error_examples=3,
    )

    assert "# Phase 10 Evaluation Report" in report_text
    assert "Performance by source dataset" in report_text
    assert "Performance by code length bucket" in report_text
    assert "False-positive examples" in report_text
    assert "False-negative examples" in report_text
    assert summary["overall_metrics"]["sample_count"] == 4
    assert "robustness_slice_metrics" in summary
    assert len(summary["false_positive_examples"]) == 1
    assert len(summary["false_negative_examples"]) == 1
