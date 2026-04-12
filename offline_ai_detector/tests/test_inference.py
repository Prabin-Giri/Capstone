from src.models.inference import format_inference_response


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
