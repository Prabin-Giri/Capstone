"""Compatibility shims across transformers versions."""

from __future__ import annotations

import inspect
from typing import Any


def training_args_eval_strategy_epoch_kwarg(training_arguments_cls: type[Any]) -> dict[str, str]:
    """Return kwargs for per-epoch evaluation (TrainingArguments API differs by version)."""

    sig = inspect.signature(training_arguments_cls.__init__)
    if "eval_strategy" in sig.parameters:
        return {"eval_strategy": "epoch"}
    if "evaluation_strategy" in sig.parameters:
        return {"evaluation_strategy": "epoch"}
    return {}
