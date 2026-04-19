"""Write tiny balanced train/val/test JSONL for local smoke training (not real evaluation)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUT = PROJECT_ROOT / "data" / "processed"


def _py(i: int) -> str:
    lines = [f"def example_{i}(x):"]
    lines.extend([f"    v{j} = x + {j}" for j in range(24)])
    lines.append("    return v0")
    return "\n".join(lines)


def _java(i: int) -> str:
    lines = [f"class Smoke{i} {{"]
    lines.extend([f"  int k{j} = {j};" for j in range(24)])
    lines.append("}")
    return "\n".join(lines)


def main() -> None:
    rows: list[dict[str, str]] = []
    for i in range(80):
        label = "human" if i % 2 == 0 else "ai"
        lang = "python" if i % 4 < 2 else "java"
        code = _py(i) if lang == "python" else _java(i)
        rows.append(
            {
                "id": f"s{i}",
                "code": code,
                "label": label,
                "language": lang,
                "source_dataset": "synthetic_smoke",
            }
        )

    train, val, test = rows[:56], rows[56:68], rows[68:]
    OUT.mkdir(parents=True, exist_ok=True)
    for name, part in ("train", train), ("val", val), ("test", test):
        path = OUT / f"{name}.jsonl"
        path.write_text("\n".join(json.dumps(r) for r in part) + "\n", encoding="utf-8")
        print(f"Wrote {path} ({len(part)} rows)")


if __name__ == "__main__":
    main()
