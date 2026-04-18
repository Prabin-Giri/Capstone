from src.experiments.distilbert_hf_pipeline import (
    balance_binary_rows,
    strip_code_comments_heuristic,
)


def test_strip_removes_block_and_line_comments() -> None:
    code = """
    /* block */
    int x = 1; // line
    """
    out = strip_code_comments_heuristic(code)
    assert "block" not in out.lower()
    assert "//" not in out


def test_strip_python_hash_comment() -> None:
    code = "x = 1  # inline\n# full line\ny = 2"
    out = strip_code_comments_heuristic(code)
    assert "inline" not in out
    assert "full line" not in out
    assert "x = 1" in out
    assert "y = 2" in out


def test_balance_binary_rows() -> None:
    rows = [{"text": f"c{i}", "label": i % 2} for i in range(10)]
    rows += [{"text": f"h{i}", "label": 0} for i in range(3)]
    balanced = balance_binary_rows(rows, seed=0)
    assert len(balanced) == 10
    n0 = sum(1 for r in balanced if r["label"] == 0)
    n1 = sum(1 for r in balanced if r["label"] == 1)
    assert n0 == n1 == 5
