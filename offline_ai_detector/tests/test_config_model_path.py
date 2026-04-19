"""Tests for Hugging Face model path resolution in train config."""

from __future__ import annotations

from pathlib import Path

import pytest

from src.config import _resolve_model_identifier


def test_resolve_model_identifier_hub_id_passthrough() -> None:
    assert _resolve_model_identifier("microsoft/codebert-base") == "microsoft/codebert-base"


def test_resolve_model_identifier_unknown_relative_passthrough() -> None:
    # Use a path that is not present under DETECTOR_ROOT so resolution stays a passthrough string.
    assert _resolve_model_identifier("artifacts/models/pretrained/__missing_local_weights__") == (
        "artifacts/models/pretrained/__missing_local_weights__"
    )


def test_resolve_model_identifier_resolves_existing_relative_path(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr("src.config.DETECTOR_ROOT", tmp_path)
    rel = Path("artifacts/models/pretrained/microsoft-codebert-base")
    full = tmp_path / rel
    full.mkdir(parents=True)
    (full / "config.json").write_text("{}", encoding="utf-8")

    out = _resolve_model_identifier(str(rel))
    assert out == str(full.resolve())


def test_resolve_model_identifier_absolute_exists(tmp_path: Path) -> None:
    d = tmp_path / "m"
    d.mkdir()
    (d / "config.json").write_text("{}", encoding="utf-8")
    assert _resolve_model_identifier(str(d)) == str(d.resolve())


def test_load_train_config_resolves_model_name(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from src.config import load_train_config

    monkeypatch.setattr("src.config.DETECTOR_ROOT", tmp_path)
    rel = Path("artifacts/models/pretrained/microsoft-codebert-base")
    full = tmp_path / rel
    full.mkdir(parents=True)
    (full / "config.json").write_text("{}", encoding="utf-8")

    cfg_path = tmp_path / "train.yaml"
    cfg_path.write_text(
        f"""
project:
  name: t
  experiment_name: e
data:
  train_path: {tmp_path}/tr.jsonl
  validation_path: {tmp_path}/v.jsonl
  test_path: {tmp_path}/te.jsonl
  file_format: jsonl
model:
  model_name: {rel.as_posix()}
  local_files_only: true
calibration:
  enabled: false
thresholds:
  lower: 0.35
  upper: 0.65
outputs:
  model_dir: {tmp_path}/out
  report_dir: {tmp_path}/rep
  figures_dir: {tmp_path}/fig
""",
        encoding="utf-8",
    )
    for p in ("tr.jsonl", "v.jsonl", "te.jsonl"):
        (tmp_path / p).write_text("", encoding="utf-8")

    cfg = load_train_config(cfg_path)
    assert cfg.model.model_name == str(full.resolve())
