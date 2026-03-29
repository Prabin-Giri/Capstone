/**
 * Normalize and compare program output to expected output.
 * Used for data-only tests (stdin -> run -> compare stdout).
 */

/**
 * Normalize a string for comparison: trim, normalize line endings, optional collapse spaces.
 * @param {string} s
 * @param {{ trimLines?: boolean, ignoreTrailingNewline?: boolean }} [opts]
 */
function normalize(s, opts = {}) {
    if (s == null) return '';
    let out = String(s);
    return out.trim();
}

/**
 * Compare actual vs expected. Returns exact match and optional partial (e.g. ran but wrong).
 * @param {string} actual - Raw stdout from run
 * @param {string} expected - Expected output from test case
 * @param {{ trimLines?: boolean, compareMode?: 'exact'|'lines_unordered' }} [opts]
 *   - exact: full string match (default)
 *   - lines_unordered: sort lines then compare (ignores order of lines)
 * @returns {{ match: boolean, actualNormalized: string, expectedNormalized: string }}
 */
function compare(actual, expected, opts = {}) {
    let actualNormalized = normalize(actual, { trimLines: true, ignoreTrailingNewline: true });
    let expectedNormalized = normalize(expected, { trimLines: true, ignoreTrailingNewline: true });
    const mode = (opts.compareMode || 'exact').toLowerCase();
    if (mode === 'lines_unordered') {
        actualNormalized = actualNormalized.split('\n').filter(Boolean).sort().join('\n');
        expectedNormalized = expectedNormalized.split('\n').filter(Boolean).sort().join('\n');
    }
    const match = actualNormalized === expectedNormalized;
    return { match, actualNormalized, expectedNormalized };
}

/**
 * Compute points for one test: full points if match, optional partial if allowPartial and ran (no crash/timeout).
 * @param {{ match: boolean }} compareResult
 * @param {number} maxPoints
 * @param {boolean} ranOk - No timeout, exit code 0 (or we can allow non-zero and still give partial)
 * @param {boolean} [allowPartial]
 * @param {number} [partialPercent] - 0-100
 * @returns {number} points earned
 */
function pointsForTest(compareResult, maxPoints, ranOk, allowPartial, partialPercent = 0) {
    if (compareResult.match) return maxPoints;
    if (allowPartial && ranOk && partialPercent > 0) {
        return Math.round((maxPoints * partialPercent) / 100);
    }
    return 0;
}

module.exports = { normalize, compare, pointsForTest };
