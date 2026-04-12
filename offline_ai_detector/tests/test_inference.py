from src.models.inference import decide_score_band, format_inference_response


def test_inference_response_shape_is_stable() -> None:
    response = format_inference_response(
        language="python",
        raw_score=None,
        calibrated_score=None,
        label="unclear",
        confidence_note="Phase 1 scaffold only.",
    )
    assert response["language"] == "python"
    assert response["label"] == "unclear"


def test_decide_score_band_uses_abstain_region_conservatively() -> None:
    low = decide_score_band(score=0.20, lower=0.35, upper=0.65)
    middle = decide_score_band(score=0.50, lower=0.35, upper=0.65)
    high = decide_score_band(score=0.80, lower=0.35, upper=0.65)

    assert low.label == "likely human"
    assert middle.label == "unclear"
    assert high.label == "likely AI-written"


def test_decide_score_band_warns_on_short_samples() -> None:
    decision = decide_score_band(
        score=0.72,
        lower=0.35,
        upper=0.65,
        min_tokens=50,
        token_count=18,
        score_name="calibrated score",
    )
    assert decision.label == "likely AI-written"
    assert "reduced" in decision.confidence_note.lower()
