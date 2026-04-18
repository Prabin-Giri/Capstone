# Offline AI Code Detector v2 Roadmap

This file captures concrete follow-up work after the Phase 10 v1 evaluation.

## 1. Build Better Matched AI Data

- Generate AI-written solutions for the same or closely matched problem IDs used in the human student corpus.
- Include multiple prompting styles: terse, rubric-guided, chain-of-thought-like, and "minimal explanation" prompts.
- Track generator model family and prompting metadata for auditability.
- Goal: reduce problem/topic mismatch between human and AI classes.

## 2. Comment-Retention Ablation

- Train/evaluate two variants of the full pipeline:
  - comments retained (current default)
  - comments removed
- Compare false-positive and false-negative movement by language and source dataset.
- Goal: quantify whether comment artifacts are inflating v1 performance.

## 3. Add Structural Features (Optional Layer)

- Prototype lightweight AST-derived features (tree depth, branch density, identifier declaration patterns).
- Keep them separate from the base encoder so they can be toggled and audited.
- Measure whether structural features improve robustness on edited AI samples.
- Goal: improve resilience beyond surface lexical cues.

## 4. Stress-Test Edited and Hybrid Submissions

- Build explicit evaluation slices for:
  - paraphrased AI code
  - partially rewritten AI code
  - mixed human+AI drafts
- Add targeted error analysis to understand which edits break the detector.
- Goal: avoid overfitting to "raw AI output" signatures only.

## 5. Compare Model Topologies

- Compare:
  - one joint Python+Java model (v1 baseline)
  - Python-only model
  - Java-only model
- If beneficial, test a shared encoder with language-specific prediction heads.
- Goal: determine whether language-specific specialization reduces error rates.

## 6. Monitoring and Calibration Hygiene

- Recalibrate periodically on fresh held-out validation data.
- Track threshold drift and abstain-rate drift over time.
- Add a recurring evaluation checklist for each term/semester refresh.
- Goal: keep the detector conservative and stable as real submissions evolve.
