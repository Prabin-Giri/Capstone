from src.models.dataset import (
    LABEL_TO_ID,
    approximate_code_token_count,
    load_code_samples,
    normalize_label_value,
    summarize_code_samples,
)


def test_normalize_label_value_accepts_strings_and_ints() -> None:
    assert normalize_label_value("human") == "human"
    assert normalize_label_value("AI_GENERATED") == "ai"
    assert normalize_label_value(0) == "human"
    assert normalize_label_value(1) == "ai"


def test_approximate_code_token_count_is_nontrivial() -> None:
    code = "def add(a, b):\n    return a + b\n"
    assert approximate_code_token_count(code) >= 8


def test_load_code_samples_filters_short_rows(tmp_path) -> None:
    dataset_path = tmp_path / "samples.jsonl"
    dataset_path.write_text(
        '\n'.join(
            [
                '{"id":"1","code":"def add(a, b):\\n    return a + b\\n","label":"human","language":"python","source_dataset":"codenet"}',
                '{"id":"2","code":"class Main { public static void main(String[] args) { System.out.println(1); } }","label":"ai","language":"java","source_dataset":"multiaigcd","edit_type":"post_edit","is_paraphrased":"true"}',
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    samples = load_code_samples(dataset_path, min_tokens=20)
    assert len(samples) == 1
    assert samples[0].language == "java"
    assert samples[0].label == "ai"
    assert samples[0].edit_type == "post_edit"
    assert samples[0].is_paraphrased is True


def test_summarize_code_samples_counts_labels_and_languages(tmp_path) -> None:
    dataset_path = tmp_path / "samples.jsonl"
    dataset_path.write_text(
        '\n'.join(
            [
                '{"id":"1","code":"def add(a, b):\\n    return a + b\\n","label":"human","language":"python","source_dataset":"codenet"}',
                '{"id":"2","code":"public class Main { public static void main(String[] args) { System.out.println(1); } }","label":"ai","language":"java","source_dataset":"multiaigcd"}',
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    samples = load_code_samples(dataset_path, min_tokens=0)
    summary = summarize_code_samples(samples)
    assert summary.total_samples == 2
    assert summary.label_counts == {"human": 1, "ai": 1}
    assert summary.language_counts["python"] == 1
    assert summary.language_counts["java"] == 1
    assert set(LABEL_TO_ID) == {"human", "ai"}


def test_load_code_samples_preserves_optional_metadata(tmp_path) -> None:
    dataset_path = tmp_path / "samples.jsonl"
    dataset_path.write_text(
        '{"id":"7","code":"def solve(x):\\n    return x\\n","label":"ai","language":"python","source_dataset":"codemirage","problem_id":"p1","task_id":"t1","generator_model":"gpt-x","prompt_type":"paraphrased","edit_type":"rewrite","is_paraphrased":"yes","notes":"hybrid candidate"}\n',
        encoding="utf-8",
    )

    samples = load_code_samples(dataset_path, min_tokens=0)
    assert len(samples) == 1
    sample = samples[0]
    assert sample.problem_id == "p1"
    assert sample.task_id == "t1"
    assert sample.generator_model == "gpt-x"
    assert sample.prompt_type == "paraphrased"
    assert sample.edit_type == "rewrite"
    assert sample.is_paraphrased is True
    assert sample.notes == "hybrid candidate"
