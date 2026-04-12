"""Dataset-level constants and containers for the code detector."""

from __future__ import annotations

from dataclasses import dataclass


LABEL_TO_ID = {"human": 0, "ai": 1}
ID_TO_LABEL = {value: key for key, value in LABEL_TO_ID.items()}
SUPPORTED_LANGUAGES = ("python", "java")


@dataclass(slots=True)
class CodeSample:
    id: str
    code: str
    language: str
    label: str
    source_dataset: str
