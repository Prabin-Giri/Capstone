"""DistilBERT fine-tuning on Hugging Face datasets for human vs AI-generated code.

Phases covered: load/balance/split, comment stripping + tokenization, Trainer,
evaluation (F1 + confusion matrix), save, and a small predict() helper.

Target ~80% accuracy depends on the dataset and is not guaranteed.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import numpy as np
import torch
from sklearn.metrics import confusion_matrix, f1_score

from ..utils.transformers_compat import training_args_eval_strategy_epoch_kwarg
from sklearn.model_selection import train_test_split

logger = logging.getLogger(__name__)

MODEL_NAME_DEFAULT = "distilbert-base-uncased"
MAX_LENGTH = 512

# Primary (code-focused). Alternate is often prose; use --languages off if empty.
DEFAULT_DATASET_ID = "Ghizlane-Boukili/AI-Generated-Code-Detection"
ALT_DATASET_ID = "mafaqbhatti/ai-vs-human-content-detection-dataset-2026"


@dataclass(slots=True)
class PipelineConfig:
    dataset_id: str
    output_dir: Path
    languages: list[str] | None  # e.g. ["python", "java"]; None = no filter
    seed: int
    low_ram: bool
    learning_rate: float = 2e-5
    num_epochs: int = 3
    weight_decay: float = 0.01
    batch_size: int = 16
    gradient_accumulation_steps: int = 1
    train_ratio: float = 0.8
    strip_comments: bool = True


def strip_code_comments_heuristic(code: str, *, language: str | None = None) -> str:
    """Heuristic comment removal so tokenization focuses more on structure.

    Not a full lexer; may alter edge cases inside string literals.
    """

    _ = language  # reserved for future language-specific lexing
    text = re.sub(r"/\*[\s\S]*?\*/", " ", code)
    text = re.sub(r"//[^\n]*", " ", text)
    lines_out: list[str] = []
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("#"):
            continue
        if "#" in line:
            # Drop trailing Python-style inline comment (heuristic; breaks on '#' in strings)
            line = line.split("#", 1)[0].rstrip()
        lines_out.append(line)
    return "\n".join(lines_out)


def _pick_column(row: dict[str, Any], candidates: list[str]) -> str | None:
    keys = {k.lower(): k for k in row}
    for c in candidates:
        cl = c.lower()
        if cl in keys:
            return keys[cl]
    for k in row:
        kl = k.lower()
        for c in candidates:
            if kl == c.lower():
                return k
    return None


def _normalize_label(value: Any) -> int | None:
    """Return 0 = human, 1 = AI, or None if unknown."""

    if value is None:
        return None
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        v = int(value)
        if v in (0, 1):
            return v
        if v == -1:
            return None
    s = str(value).strip().lower()
    if s in ("human", "h", "0", "false", "no", "neg", "negative"):
        return 0
    if s in ("ai", "machine", "gpt", "1", "true", "yes", "pos", "positive", "generated"):
        return 1
    if "human" in s and "ai" not in s:
        return 0
    if "ai" in s or "gen" in s:
        return 1
    return None


def _normalize_language(value: Any) -> str:
    s = str(value).strip().lower()
    aliases = {
        "python": "python",
        "python3": "python",
        "py": "python",
        "java": "java",
        "java 11": "java",
        "java11": "java",
    }
    return aliases.get(s, s)


def _rows_from_hf_dataset(ds: Any) -> list[dict[str, Any]]:
    return [dict(ds[i]) for i in range(len(ds))]


def load_and_normalize_rows(
    dataset_id: str,
    *,
    languages: list[str] | None,
) -> list[dict[str, Any]]:
    from datasets import load_dataset

    try:
        raw = load_dataset(dataset_id, trust_remote_code=True)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to load {dataset_id!r}. Check the id, accept the dataset terms on Hugging Face, "
            f"and install: pip install datasets. Original error: {exc}"
        ) from exc

    if "train" in raw:
        split = raw["train"]
    else:
        first = list(raw.keys())[0]
        split = raw[first]
        logger.warning("No 'train' split; using %r (%d rows).", first, len(split))

    rows = _rows_from_hf_dataset(split)
    if not rows:
        raise RuntimeError("Dataset split is empty.")

    sample = rows[0]
    code_key = _pick_column(
        sample,
        ["Sample_Code", "code", "source_code", "snippet", "text", "content", "body"],
    )
    label_key = _pick_column(
        sample,
        ["Generated", "label", "is_ai", "ai_generated", "class", "target"],
    )
    lang_key = _pick_column(sample, ["Language", "language", "lang", "programming_language"])

    if code_key is None or label_key is None:
        raise RuntimeError(
            f"Could not infer code/label columns from {dataset_id}. "
            f"Columns: {list(sample.keys())}. Expected something like Sample_Code + Generated."
        )

    lang_filter = None
    if languages:
        lang_filter = {_normalize_language(x) for x in languages}

    out: list[dict[str, Any]] = []
    for row in rows:
        code = row.get(code_key)
        if code is None or (isinstance(code, str) and not code.strip()):
            continue
        lab = _normalize_label(row.get(label_key))
        if lab is None:
            continue
        lang_val = _normalize_language(row[lang_key]) if lang_key else None
        if lang_filter is not None:
            if lang_val is None:
                continue
            if lang_val not in lang_filter:
                continue
        out.append({"text": str(code), "label": lab, "language": lang_val})

    if not out:
        raise RuntimeError(
            "No rows left after filtering. Try --languages (or clear filter), "
            "or use a code dataset such as Ghizlane-Boukili/AI-Generated-Code-Detection."
        )

    logger.info(
        "Loaded %d rows (dataset=%s, lang_filter=%s).",
        len(out),
        dataset_id,
        languages,
    )
    return out


def balance_binary_rows(rows: list[dict[str, Any]], *, seed: int) -> list[dict[str, Any]]:
    import random

    rng = random.Random(seed)
    humans = [r for r in rows if r["label"] == 0]
    ais = [r for r in rows if r["label"] == 1]
    if not humans or not ais:
        raise RuntimeError("Need both classes to balance (human and AI).")
    n = min(len(humans), len(ais))
    rng.shuffle(humans)
    rng.shuffle(ais)
    balanced = humans[:n] + ais[:n]
    rng.shuffle(balanced)
    logger.info("Balanced to 50/50: %d per class (total %d).", n, len(balanced))
    return balanced


def train_validation_split(
    rows: list[dict[str, Any]],
    *,
    train_ratio: float,
    seed: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    texts = [r["text"] for r in rows]
    labels = [r["label"] for r in rows]
    x_train, x_val, y_train, y_val = train_test_split(
        texts,
        labels,
        train_size=train_ratio,
        random_state=seed,
        stratify=labels,
    )
    train_rows = [{"text": t, "label": y} for t, y in zip(x_train, y_train)]
    val_rows = [{"text": t, "label": y} for t, y in zip(x_val, y_val)]
    return train_rows, val_rows


def build_hf_dataset(train_rows: list[dict], val_rows: list[dict]) -> tuple[Any, Any]:
    from datasets import Dataset

    train_ds = Dataset.from_list(train_rows)
    val_ds = Dataset.from_list(val_rows)
    return train_ds, val_ds


def run_finetune(
    cfg: PipelineConfig,
) -> dict[str, Any]:
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        DataCollatorWithPadding,
        Trainer,
        TrainingArguments,
    )

    rows = load_and_normalize_rows(cfg.dataset_id, languages=cfg.languages)
    rows = balance_binary_rows(rows, seed=cfg.seed)
    train_rows, val_rows = train_validation_split(rows, train_ratio=cfg.train_ratio, seed=cfg.seed)

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME_DEFAULT)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME_DEFAULT,
        num_labels=2,
    )

    def preprocess_batch(examples: dict[str, list]) -> dict[str, Any]:
        texts = examples["text"]
        if cfg.strip_comments:
            texts = [strip_code_comments_heuristic(t) for t in texts]
        enc = tokenizer(
            texts,
            truncation=True,
            padding="max_length",
            max_length=MAX_LENGTH,
        )
        enc["labels"] = examples["label"]
        return enc

    train_ds, val_ds = build_hf_dataset(train_rows, val_rows)
    cols = train_ds.column_names
    train_tok = train_ds.map(preprocess_batch, batched=True, remove_columns=cols)
    val_tok = val_ds.map(preprocess_batch, batched=True, remove_columns=cols)

    bs = cfg.batch_size
    gas = cfg.gradient_accumulation_steps
    if cfg.low_ram:
        bs = min(bs, 4)
        gas = max(gas, 4)

    cfg.output_dir.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(cfg.output_dir),
        learning_rate=cfg.learning_rate,
        per_device_train_batch_size=bs,
        per_device_eval_batch_size=bs,
        gradient_accumulation_steps=gas,
        num_train_epochs=cfg.num_epochs,
        weight_decay=cfg.weight_decay,
        **training_args_eval_strategy_epoch_kwarg(TrainingArguments),
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_steps=25,
        seed=cfg.seed,
        report_to=[],
    )

    def compute_metrics(eval_pred: Any) -> dict[str, float]:
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        return {
            "f1": float(f1_score(labels, preds, average="binary")),
            "accuracy": float((preds == labels).mean()),
        }

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_tok,
        eval_dataset=val_tok,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
        compute_metrics=compute_metrics,
    )

    trainer.train()

    # Evaluation + confusion matrix on validation
    pred_out = trainer.predict(val_tok)
    logits = pred_out.predictions
    y_true = np.array(val_tok["labels"])
    y_pred = np.argmax(logits, axis=-1)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    f1 = f1_score(y_true, y_pred, average="binary")
    acc = (y_pred == y_true).mean()

    metrics = {
        "validation_accuracy": float(acc),
        "validation_f1": float(f1),
        "confusion_matrix": cm.tolist(),
        "labels_order": ["human (0)", "AI (1)"],
    }

    trainer.save_model(str(cfg.output_dir))
    tokenizer.save_pretrained(str(cfg.output_dir))

    report_path = cfg.output_dir / "evaluation_report.json"
    import json

    report_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    logger.info("Saved model + tokenizer to %s", cfg.output_dir)
    logger.info("Validation accuracy: %.4f  F1: %.4f", acc, f1)
    logger.info("Confusion matrix (rows=true, cols=pred):\n%s", cm)

    return metrics


def load_predictor(model_dir: str | Path) -> Callable[[str], float]:
    """Return predict(code) -> AI probability in [0, 100]."""

    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    path = Path(model_dir)
    tokenizer = AutoTokenizer.from_pretrained(str(path))
    model = AutoModelForSequenceClassification.from_pretrained(str(path))
    model.eval()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    def predict(code_string: str, *, strip_comments: bool = True) -> float:
        text = strip_code_comments_heuristic(code_string) if strip_comments else code_string
        enc = tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=MAX_LENGTH,
            return_tensors="pt",
        )
        enc = {k: v.to(device) for k, v in enc.items()}
        with torch.no_grad():
            logits = model(**enc).logits
        probs = torch.softmax(logits, dim=-1)[0]
        ai_prob = float(probs[1].item())
        return 100.0 * ai_prob

    return predict
