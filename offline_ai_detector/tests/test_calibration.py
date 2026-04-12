import json

import numpy as np

from src.models.calibration import (
    CalibrationArtifact,
    apply_calibration,
    apply_platt_scaling,
    apply_temperature_scaling,
    brier_score,
    compute_band_metrics,
    compute_threshold_sweep,
    expected_calibration_error,
    fit_calibrator,
    logit_margin,
    save_calibration_artifact,
    suggest_threshold_band,
)


def test_logit_margin_uses_binary_difference() -> None:
    logits = np.asarray([[2.0, 0.5], [0.1, 1.8]])
    margins = logit_margin(logits)
    assert np.allclose(margins, np.asarray([-1.5, 1.7]))


def test_temperature_scaling_preserves_probability_shape() -> None:
    logits = np.asarray([[2.0, 0.5], [0.1, 1.8]])
    scores = apply_temperature_scaling(logits, temperature=1.5)
    assert scores.shape == (2,)
    assert np.all((scores >= 0.0) & (scores <= 1.0))


def test_platt_scaling_preserves_probability_shape() -> None:
    logits = np.asarray([[2.0, 0.5], [0.1, 1.8]])
    scores = apply_platt_scaling(logits, coef=1.2, intercept=-0.3)
    assert scores.shape == (2,)
    assert np.all((scores >= 0.0) & (scores <= 1.0))


def test_fit_calibrator_returns_threshold_recommendation() -> None:
    logits = np.asarray(
        [
            [3.0, 0.1],
            [2.5, 0.2],
            [0.2, 2.2],
            [0.1, 2.7],
            [1.8, 0.5],
            [0.4, 1.7],
        ]
    )
    labels = np.asarray([0, 0, 1, 1, 0, 1])

    artifact = fit_calibrator(
        logits=logits,
        labels=labels,
        method="platt_scaling",
        ece_bins=5,
        risk_target=0.10,
        report_top_k_thresholds=3,
    )

    assert artifact.method == "platt_scaling"
    assert "coef" in artifact.parameters
    assert 0.0 <= artifact.threshold_recommendation["lower"] <= 1.0
    assert 0.0 <= artifact.threshold_recommendation["upper"] <= 1.0
    assert len(artifact.threshold_sweep) == 3


def test_apply_calibration_accepts_saved_artifact_shape(tmp_path) -> None:
    calibration_path = tmp_path / "calibration.json"
    artifact = CalibrationArtifact(
        method="platt_scaling",
        parameters={"coef": 1.0, "intercept": 0.0},
        validation_metrics_raw={},
        validation_metrics_calibrated={},
        threshold_recommendation={"lower": 0.35, "upper": 0.65, "risk_target": 0.05},
        threshold_sweep=[],
        calibration_diagnostics={},
    )
    save_calibration_artifact(calibration_path, artifact)
    payload = json.loads(calibration_path.read_text(encoding="utf-8"))
    scores = apply_calibration(np.asarray([[2.0, 0.5], [0.1, 1.8]]), payload)
    assert scores.shape == (2,)


def test_threshold_band_and_calibration_metrics_are_reasonable() -> None:
    scores = np.asarray([0.1, 0.2, 0.45, 0.8, 0.9])
    labels = np.asarray([0, 0, 1, 1, 1])

    recommendation = suggest_threshold_band(scores, labels, risk_target=0.2)
    band_metrics = compute_band_metrics(
        scores,
        labels,
        lower=recommendation["lower"],
        upper=recommendation["upper"],
    )
    sweep = compute_threshold_sweep(scores, labels, limit=4)

    assert 0.0 <= recommendation["lower"] <= recommendation["upper"] <= 1.0
    assert 0.0 <= band_metrics["abstain_rate"] <= 1.0
    assert len(sweep) == 4


def test_brier_and_ece_metrics_are_non_negative() -> None:
    labels = np.asarray([0, 0, 1, 1])
    scores = np.asarray([0.1, 0.3, 0.7, 0.9])
    assert brier_score(labels, scores) >= 0.0
    assert expected_calibration_error(labels, scores, bins=4) >= 0.0
