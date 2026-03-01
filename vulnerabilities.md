# Plagiarism Detection Vulnerabilities

Based on a review of the `plagscan` source code, here are the main vulnerabilities that a student could exploit to bypass detection:

### 1. The "Junk Code" Attack (Fingerprint Dilution)
**Vulnerability:** The Jaccard similarity is calculated as `intersection / union`. 
**Exploit:** A student can copy a function exactly, but then insert a massive amount of dead code, useless mathematical operations, or uncalled dummy functions. This artificially inflates the `union` (total fingerprints) without increasing the `intersection`, driving the Jaccard percentage below the `0.15` threshold.

### 2. The "Structure Shattering" Attack (Metrics Bypass)
**Vulnerability:** `metrics.py` relies on simple regex counting for loops, conditionals, assignments, and calls rather than building a true Abstract Syntax Tree (AST). It calculates a function-level similarity by comparing these counts (e.g., number of `if` statements).
**Exploit:** A student can rewrite the structural flow without changing the logic. 
- Replace `for` loops with `while` loops.
- Break a single function with 5 `if` statements into 5 separate helper functions with 1 `if` statement each. 
- Replace actual `if` checks with boolean array indexing or ternary operators.
This causes `cosine_similarity` in `compute_metric_similarity` to fail because the vectors no longer align.

### 3. The "Keyword Synonym" Attack
**Vulnerability:** The normalizer maps basic concepts like strings to `STR` and variables to `ID`, but it retains language keywords exactly as-is.
**Exploit:** Python is flexible. A student can replace standard keywords with functional equivalents:
- Replace `if/else` with dictionary mapping or `match/case` (if not tracked).
- Replace `print()` with `sys.stdout.write()`.
- Replace standard `import` with `__import__()`.
Because the tokens change from `['if', 'ID', ':', ...]` to something completely different, the k-grams (`k=25` by default) will break, dropping the fingerprint intersection to zero.

### 4. The "K-Gram Disruption" Attack
**Vulnerability:** The default k-gram size is `k=25`. This requires 25 consecutive normalized tokens to match exactly to form a single shared fingerprint.
**Exploit:** A student only needs to make one tiny structural change (like injecting a useless `x = 1` assignment which tokenizes to `ID = NUM`) every 20-24 tokens. By ensuring there is never a sequence of 25 unchanged tokens, they will yield **zero** shared fingerprints, completely bypassing the winnowing algorithm.
