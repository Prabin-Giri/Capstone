from pathlib import Path

from src.data.loaders import clean_dataset_source, inspect_dataset_source


def test_clean_dataset_source_applies_default_label_and_language_filter(tmp_path: Path) -> None:
    root = tmp_path / "codenet"
    root.mkdir()
    (root / "codenet.csv").write_text(
        "submission_id,source_code,lang,problem_id,status\n"
        "1,print('hi'),Python,p1,accepted\n"
        "2,console.log('hi'),JavaScript,p2,accepted\n"
        "3,public class Main {},Java,p3,accepted\n",
        encoding="utf-8",
    )

    result = clean_dataset_source(
        "codenet",
        root_dir=root,
        allowed_languages=["python", "java"],
        output_path=tmp_path / "codenet_clean.jsonl",
    )

    assert len(result.frame) == 2
    assert set(result.frame["language"]) == {"python", "java"}
    assert set(result.frame["label"]) == {"human"}
    assert result.report.total_rows == 3
    assert result.report.kept_rows == 2


def test_inspect_dataset_source_reports_missing_generator_metadata_for_ai_source(tmp_path: Path) -> None:
    root = tmp_path / "multiaigcd"
    root.mkdir()
    (root / "multiaigcd.csv").write_text(
        "id,code,language,problem_id\n"
        "1,print('a'),python,p1\n"
        "2,public class Main {},java,p2\n",
        encoding="utf-8",
    )

    report = inspect_dataset_source("multiaigcd", root, ["python", "java"])
    assert report.kept_rows == 2
    assert any("generator_model metadata is missing" in warning for warning in report.warnings)


def test_clean_dataset_source_reports_short_code_without_dropping_it(tmp_path: Path) -> None:
    root = tmp_path / "multiaigcd"
    root.mkdir()
    (root / "multiaigcd.csv").write_text(
        "id,code,language,generator_model\n"
        "1,print('a'),python,gpt-local\n",
        encoding="utf-8",
    )

    result = clean_dataset_source(
        "multiaigcd",
        root_dir=root,
        allowed_languages=["python", "java"],
        output_path=tmp_path / "multiaigcd_clean.jsonl",
        min_tokens_warn=50,
    )

    assert result.report.kept_rows == 1
    assert any("below the 50-token guideline" in warning for warning in result.report.warnings)
