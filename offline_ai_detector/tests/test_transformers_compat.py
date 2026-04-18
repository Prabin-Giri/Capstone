from transformers import TrainingArguments

from src.utils.transformers_compat import training_args_eval_strategy_epoch_kwarg


def test_eval_strategy_kwarg_matches_training_arguments() -> None:
    kw = training_args_eval_strategy_epoch_kwarg(TrainingArguments)
    assert len(kw) == 1
    key = next(iter(kw))
    assert key in ("eval_strategy", "evaluation_strategy")
    assert kw[key] == "epoch"
