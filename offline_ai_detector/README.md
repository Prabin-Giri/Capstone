# Offline AI Code Detector

This subproject is the dedicated workspace for a standalone, fully offline detector aimed at Python and Java student code. It stays in its own folder so we do not collide with the existing app in the repo root.

## Phase 1 Status

Completed in this phase:
- created the code-detector project scaffold
- aligned the folder layout with the Python and Java code-only plan
- added config files for data, training, and inference
- added placeholder scripts and modules for each later phase
- added the new root context file `PROJECT_CONTEXT_AI_CODE_DETECTOR.md`

Assumptions made:
- the detector stays in `offline_ai_detector/` even though the target is code, because that is the safest way to avoid clashing with the existing repo
- Phase 1 is scaffold-only, so training, calibration, and dataset ingestion logic are intentionally deferred
- local CLI usage is the first interface, not a web API

Main risks still open:
- dataset formats may differ from the expected raw layout
- source-specific quirks could still become label shortcuts later
- problem-level leakage prevention will need careful validation before training

Validate before moving on:
- confirm the folder layout feels right for you
- confirm the dataset filenames and paths are acceptable
- confirm we should keep using `offline_ai_detector/` as the project folder name

## Phase 2 Status

Completed in this phase:
- defined the canonical unified schema for all dataset sources in [`src/data/schema.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/src/data/schema.py)
- added normalization for labels, language names, and nullable booleans
- made validation fail loudly with readable multi-error messages
- documented which fields are required, which are optional, and how nulls are handled

Assumptions made:
- exports should use JSONL or CSV rows with the same canonical fields
- `python`, `python3`, and similar aliases normalize to `python`
- `java`, `java 8`, `java 11`, and similar aliases normalize to `java`
- missing optional metadata should remain `null` rather than being fabricated

Main risks still open:
- source-specific loaders still need to map raw dataset columns into this schema
- near-duplicate handling is not implemented yet
- schema validation currently works at the row level, not full-dataset level

Validate before moving on:
- confirm the chosen field list is enough for all four datasets
- confirm `problem_id` and `task_id` are the right grouping anchors to preserve
- confirm we should keep boolean normalization for `is_paraphrased` as-is

## Phase 3 Status

Completed in this phase:
- implemented source-by-source inspection and normalization in [`src/data/loaders.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/src/data/loaders.py)
- added [`scripts/inspect_data.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/scripts/inspect_data.py) to inspect raw datasets and write per-source markdown reports
- added [`scripts/clean_datasets.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/scripts/clean_datasets.py) to save cleaned interim JSONL exports
- added warnings for inconsistent language labels, empty code rows, missing metadata, duplicate rates, and suspicious code-length patterns

Assumptions made:
- each raw dataset folder contains at least one supported tabular file format: CSV, TSV, JSONL, JSON, or Parquet
- cleaned interim exports should be written as `data/interim/{source}_clean.jsonl`
- label defaults are safe for CodeNet (`human`), MultiAIGCD (`ai`), and CodeMirage (`ai`) unless source metadata says otherwise

Main risks still open:
- official raw dataset layouts may still need source-specific parsing beyond tabular-file loading
- CodeMirage may include some non-AI rows depending on metadata conventions, so its label handling still needs inspection against the real files
- deduplication is currently reported, not enforced across sources yet

Validate before moving on:
- confirm the raw dataset download/extract layout actually matches the tabular-file assumptions
- inspect the per-source markdown reports after real downloads are placed in `data/raw/`
- confirm the alias mappings catch the real column names for each dataset

## Phase 4 Status

Completed in this phase:
- expanded [`src/data/cleaning.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/src/data/cleaning.py) into a conservative, auditable cleaning module with row-level cleaning results
- integrated cleaning options into the data config and Phase 3 scripts so interim exports are cleaned consistently
- made loaders drop empty or clearly broken samples while keeping merely short samples flagged for later filtering
- added tests for indentation preservation, comment preservation, optional tab expansion, and broken-sample detection

Assumptions made:
- line-ending normalization and trailing-space cleanup are safe default operations
- tabs should be preserved by default because expanding them can change Python indentation meaning
- comments should be preserved in v1 cleaning rather than stripped preemptively
- short code should be warned about now and filtered later, rather than silently dropped during source cleaning

Main risks still open:
- some raw sources may still contain binary-ish or malformed rows that need source-specific handling
- comment artifacts can still inflate performance later if AI sources contain obvious prompt-style comments
- token-count warnings are currently advisory, not enforced as a hard dataset filter yet

Validate before moving on:
- confirm you want to keep tabs preserved by default
- confirm the short-code behavior should remain "warn now, filter later"
- inspect the cleaned interim exports once real datasets are loaded to make sure formatting was preserved as intended

## Phase 5 Status

Completed in this phase:
- implemented exact-duplicate handling and conflicting-duplicate drops in [`src/data/dedup.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/src/data/dedup.py)
- added balanced bucket targeting, source-aware sampling, and leakage-safe split logic in [`src/data/splitting.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/src/data/splitting.py)
- replaced [`scripts/build_dataset.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/scripts/build_dataset.py) with real merge and target-scaling behavior
- added [`scripts/split_dataset.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/scripts/split_dataset.py) and [`scripts/dataset_report.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/scripts/dataset_report.py)
- extended the data config with merge targets, split ratios, and processed output paths

Assumptions made:
- exact duplicate code across conflicting labels should be dropped entirely rather than guessed
- AIGCodeSet should stay supplemental and be reserved for validation/test only
- when target bucket sizes cannot be met, all buckets should be scaled down proportionally instead of silently skewing one language or class
- group-safe sampling is preferable to exact row-count matching when those goals conflict

Main risks still open:
- fallback grouping still uses code hashes when `problem_id` or `task_id` is missing, so richer similarity clustering is still deferred
- source balancing is thoughtful but still heuristic, especially if one AI source is much smaller than the other
- the dataset scripts still need the actual cleaned interim files present to run end to end

Validate before moving on:
- confirm you want conflicting exact duplicates dropped instead of retained for manual review
- confirm AIGCodeSet should remain validation/test-only for now
- inspect the first generated dataset report before starting any training run

## Phase 6 Status

Completed in this phase:
- expanded [`src/features/code_features.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/src/features/code_features.py) into a real lightweight feature extractor
- added support for interpretable auxiliary features such as line count, token-ish count, indentation statistics, comment-line ratio, identifier repetition ratio, punctuation/operator density, keyword density, and blank-line ratio
- added feature risk notes so later reporting can surface where these signals may be misleading
- added focused feature tests in [`tests/test_features.py`](/Users/prabingiri/Documents/Capstone/offline_ai_detector/tests/test_features.py)

Assumptions made:
- features should remain optional and separate from the classifier path
- approximate lexical heuristics are acceptable for v1 auxiliary signals
- comment detection should stay lightweight and line-oriented instead of trying to fully parse strings or ASTs

Main risks still open:
- comment density can still reflect source quirks rather than authorship
- indentation and blank-line features can drift with IDE formatting habits
- keyword and identifier repetition features are informative but still brittle on templated assignments

Validate before moving on:
- confirm you want these features kept purely auxiliary for now
- inspect feature values on a few real Python and Java samples once datasets are available
- confirm we should avoid AST-heavy features until after the baseline model is working

## What Each Folder Is For

- `configs/` stores reproducible YAML configs for data paths, training defaults, and inference defaults.
- `data/raw/` is where manually downloaded datasets land untouched.
- `data/interim/` holds cleaned per-source exports before they are merged.
- `data/processed/` holds merged and split datasets ready for training.
- `artifacts/models/` stores local checkpoints and tokenizer files.
- `artifacts/reports/` stores dataset reports, evaluation summaries, and threshold notes.
- `artifacts/reports/source_inspection/` stores per-source Phase 3 inspection reports before any merge happens.
- `artifacts/figures/` stores plots such as split balance charts or threshold sweeps.
- `scripts/` contains CLI entry points so each phase can be run end to end from the terminal.
- `src/data/` contains dataset contracts, loading, cleaning, deduplication, and split logic.
- `src/features/` contains lightweight code-aware auxiliary features kept separate from the main model.
- `src/models/` contains dataset wrappers, model definitions, training, evaluation, calibration, and inference helpers.
- `src/utils/` contains small shared helpers such as logging and reproducibility tools.
- `tests/` covers the failure-prone core utilities first.

## Planned Structure

```text
offline_ai_detector/
├── README.md
├── requirements.txt
├── .gitignore
├── configs/
│   ├── train.yaml
│   ├── data.yaml
│   └── inference.yaml
├── data/
│   ├── raw/
│   ├── interim/
│   └── processed/
├── artifacts/
│   ├── models/
│   ├── reports/
│   └── figures/
├── scripts/
│   ├── inspect_data.py
│   ├── clean_datasets.py
│   ├── build_dataset.py
│   ├── split_dataset.py
│   ├── dataset_report.py
│   ├── train_model.py
│   ├── evaluate_model.py
│   ├── calibrate_model.py
│   └── run_inference.py
├── src/
│   ├── __init__.py
│   ├── paths.py
│   ├── config.py
│   ├── data/
│   │   ├── loaders.py
│   │   ├── schema.py
│   │   ├── cleaning.py
│   │   ├── splitting.py
│   │   └── dedup.py
│   ├── features/
│   │   └── code_features.py
│   ├── models/
│   │   ├── dataset.py
│   │   ├── classifier.py
│   │   ├── training.py
│   │   ├── evaluation.py
│   │   ├── calibration.py
│   │   └── inference.py
│   └── utils/
│       ├── logging_utils.py
│       └── seed.py
└── tests/
    ├── test_loaders.py
    ├── test_schema.py
    ├── test_cleaning.py
    ├── test_dedup.py
    ├── test_features.py
    ├── test_splitting.py
    └── test_inference.py
```

## Scope Reminder

- offline only
- Python and Java only
- student code only
- small-phase progress
- M1-friendly defaults
- conservative claims and conservative engineering

## Unified Dataset Schema

All sources should normalize into the same row shape before any merging:

- `id`
- `code`
- `label`
- `language`
- `source_dataset`
- `source_split`
- `problem_id`
- `task_id`
- `generator_model`
- `prompt_type`
- `edit_type`
- `is_paraphrased`
- `difficulty`
- `notes`

Required fields:

- `id`
- `code`
- `label`
- `language`
- `source_dataset`

Optional fields:

- `source_split`
- `problem_id`
- `task_id`
- `generator_model`
- `prompt_type`
- `edit_type`
- `is_paraphrased`
- `difficulty`
- `notes`

Null handling:

- unavailable optional values stay `null`
- optional metadata is never fabricated just to make rows look complete
- required fields must be present and non-empty after normalization

Validation failure behavior:

- unsupported `language` values fail validation
- unsupported `label` values fail validation
- empty required fields fail validation
- malformed boolean-like values for `is_paraphrased` fail validation
- `validate_and_normalize_record(...)` raises one readable error containing all row issues

Leakage guidance:

- `problem_id` matters because many solutions to the same task are near-duplicates, so losing it makes split leakage much more likely
- metadata such as `source_dataset`, `generator_model`, `prompt_type`, `edit_type`, and `is_paraphrased` must not be fed directly to the model if the goal is authorship-style detection
- row-level schema normalization is the first guardrail against silent dataset shortcuts

## Lightweight Code Features

Current auxiliary features include:

- `line_count`
- `non_empty_line_count`
- `blank_line_ratio`
- `character_count`
- `token_count`
- `average_line_length`
- `indentation_mean`
- `indentation_max`
- `indentation_std`
- `comment_line_ratio`
- `identifier_repetition_ratio`
- `punctuation_operator_density`
- `keyword_density`

These are intentionally:

- interpretable
- cheap to compute
- optional
- kept separate from the main classifier

Feature-specific failure modes:

- line count can become a shortcut if one dataset is consistently longer
- comment density may reflect dataset source conventions rather than authorship
- indentation and blank-line features can vary with editors or style guides
- identifier repetition can look informative while mostly measuring assignment templates
- keyword density can drift by problem type instead of AI vs human style

## Conservative Cleaning Rules

The current cleaning behavior is intentionally narrow:

- normalize line endings to `\n`
- strip trailing spaces and trailing tabs at line ends
- preserve indentation by default
- preserve comments
- preserve punctuation, braces, semicolons, and identifiers
- preserve internal blank lines
- trim only terminal blank lines at the start or end of a sample
- drop clearly broken samples such as empty rows or rows containing null-byte/control-character corruption

What can go wrong:

- removing comments too early may hide useful authorship cues
- keeping comments can also create shortcuts if AI code contains distinctive explanatory comments
- converting tabs automatically can change indentation-sensitive Python code
- inconsistent truncation or normalization across sources can fake good metrics later

## Setup

```bash
cd offline_ai_detector
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Next Phase

Phase 7 should train the first small baseline model for M1, with per-language metrics and conservative checkpointing defaults.
