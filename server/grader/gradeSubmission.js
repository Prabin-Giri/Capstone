const path = require('path');
const fs = require('fs');
const { query, run, saveDb } = require('../db');
const { runCode } = require('./runCode');
const { compare, pointsForTest } = require('./outputCompare');
const config = require('./config');

/**
 * Compute late penalty percentage from submitted_at vs due_date.
 * Assignment can have: late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap.
 */
function computeLatePenaltyPercent(assignment, submittedAt) {
    const enabled = assignment.late_penalty_enabled === 1 || assignment.late_penalty_enabled === true;
    if (!enabled) return 0;
    const due = new Date(assignment.due_date);
    const submitted = new Date(submittedAt);
    if (submitted <= due) return 0;
    const type = (assignment.late_penalty_type || 'per_day').toLowerCase();
    const value = Number(assignment.late_penalty_value) || config.defaultLatePenaltyPercentPerDay;
    const cap = Number(assignment.late_penalty_cap) || config.defaultLatePenaltyCapPercent;

    let percent = 0;
    if (type === 'per_day') {
        const daysLate = (submitted - due) / (24 * 60 * 60 * 1000);
        percent = Math.min(cap, daysLate * value);
    } else if (type === 'per_hour') {
        const hoursLate = (submitted - due) / (60 * 60 * 1000);
        percent = Math.min(cap, hoursLate * value);
    } else if (type === 'fixed') {
        percent = Math.min(cap, value);
    }
    return percent;
}

/**
 * Run auto-grader for a submission: load submission + assignment + test cases,
 * run code in Docker per test, sum points, apply late penalty, write grade/feedback.
 * @param {number} submissionId
 * @param {{ publicOnly?: boolean }} [opts] - If true, only run public tests (e.g. for student "run public tests")
 * @returns {Promise<{ grade: number, feedback: string, results: Array, rawScore: number, maxPossible: number, latePenaltyPercent: number }>}
 */
async function gradeSubmission(submissionId, opts = {}) {
    const submissions = await query('SELECT * FROM submissions WHERE id = ?', [submissionId]);
    if (submissions.length === 0) throw new Error('Submission not found');
    const submission = submissions[0];

    const assignments = await query('SELECT * FROM assignments WHERE id = ?', [submission.assignment_id]);
    if (assignments.length === 0) throw new Error('Assignment not found');
    const assignment = assignments[0];

    let testCases = await query('SELECT * FROM test_cases WHERE assignment_id = ? ORDER BY id', [assignment.id]);
    if (opts.publicOnly) testCases = testCases.filter(tc => tc.is_public === 1 || tc.is_public === true);

    if (testCases.length === 0) {
        const feedback = 'No test cases defined for this assignment.';
        await updateSubmissionGrade(submissionId, { grade: null, feedback, status: 'graded' });
        return { grade: null, feedback, results: [], rawScore: 0, maxPossible: 0, latePenaltyPercent: 0 };
    }

    const uploadsDir = path.join(__dirname, '../uploads');
    const sourcePath = path.join(uploadsDir, submission.file_path);
    if (!fs.existsSync(sourcePath)) {
        const feedback = `Submission file not found: ${submission.file_path}`;
        await updateSubmissionGrade(submissionId, { correctness_score: 0, grade: 0, feedback, status: 'graded' });
        return { grade: 0, feedback, results: [], rawScore: 0, maxPossible: 0, latePenaltyPercent: 0 };
    }

    const language = assignment.language || 'python';
    const allowPartial = assignment.allow_partial === 1 || assignment.allow_partial === true;
    const partialPct = Number(assignment.partial_pct) || config.defaultPartialCreditPercent;

    const results = [];
    let earned = 0;
    const maxPossible = testCases.reduce((s, tc) => s + (Number(tc.points) || 0), 0);

    const javaMainClass = assignment.java_main_class && String(assignment.java_main_class).trim() ? String(assignment.java_main_class).trim() : null;
    const runMode = (assignment.run_mode || 'program').toLowerCase();
    const isFunctionMode = runMode === 'function';

    for (const tc of testCases) {
        const points = Number(tc.points) || 0;
        const input = tc.input != null ? String(tc.input) : '';
        const expected = tc.expected_output != null ? String(tc.expected_output) : '';
        const inputType = (tc.input_type || 'stdin').toLowerCase();
        const useInputFile = !isFunctionMode && (inputType === 'file' || inputType === 'file_and_stdin') && tc.input_filename;
        const stdinOverride = tc.stdin != null && String(tc.stdin).trim() !== '' ? String(tc.stdin) : null;
        const outputFilename = !isFunctionMode && tc.output_filename && String(tc.output_filename).trim() ? String(tc.output_filename).trim() : null;
        const outputFilename2 = !isFunctionMode && tc.output_filename_2 && String(tc.output_filename_2).trim() ? String(tc.output_filename_2).trim() : null;
        const expected2 = tc.expected_output_2 != null ? String(tc.expected_output_2) : null;
        const compareMode = (tc.compare_mode || 'exact').toLowerCase();
        const isRunOnly = compareMode === 'run_only';

        let runArgs = [];
        if (!isFunctionMode && tc.run_args != null && String(tc.run_args).trim() !== '') {
            try {
                const raw = String(tc.run_args).trim();
                if (raw.startsWith('[')) {
                    runArgs = JSON.parse(raw);
                } else {
                    runArgs = raw.split(',').map(s => s.trim()).filter(Boolean);
                }
            } catch (_) {
                runArgs = [];
            }
        }

        const effectiveStdin = useInputFile ? (stdinOverride || '') : input;
        const runOpts = {
            sourceFilePath: sourcePath,
            language,
            stdin: effectiveStdin,
            timeoutMs: config.runTimeoutMs,
            runMode: isFunctionMode ? 'function' : 'program',
        };
        if (!isFunctionMode) {
            runOpts.runArgs = runArgs.length ? runArgs : undefined;
            runOpts.javaMainClass = javaMainClass || undefined;
        }
        if (useInputFile) {
            runOpts.inputFile = { filename: tc.input_filename, content: input };
        }
        if (outputFilename) {
            runOpts.outputFileName = outputFilename;
        }
        if (outputFilename2) {
            runOpts.outputFileName2 = outputFilename2;
        }

        let runResult;
        try {
            runResult = await runCode(runOpts);
        } catch (err) {
            results.push({
                testId: tc.id,
                is_public: tc.is_public === 1 || tc.is_public === true,
                passed: false,
                points: 0,
                maxPoints: points,
                actual: '',
                expected: expected.slice(0, 200),
                error: err.message || 'Run failed',
            });
            continue;
        }

        const actualOutput = runResult.outputFileContent != null ? runResult.outputFileContent : runResult.stdout;
        const ranOk = !runResult.timedOut && runResult.exitCode === 0;

        let allMatch;
        if (isRunOnly) {
            allMatch = ranOk;
        } else {
            const compareResult = compare(actualOutput, expected, { compareMode });
            let secondMatch = true;
            if (outputFilename2 && expected2 != null) {
                const actual2 = runResult.outputFileContent2 != null ? runResult.outputFileContent2 : '';
                const compareResult2 = compare(actual2, expected2, { compareMode });
                secondMatch = compareResult2.match;
            }
            allMatch = compareResult.match && secondMatch;
        }
        const pts = isRunOnly ? (ranOk ? points : 0) : pointsForTest({ match: allMatch }, points, ranOk, allowPartial, partialPct);

        results.push({
            testId: tc.id,
            is_public: tc.is_public === 1 || tc.is_public === true,
            passed: allMatch,
            points: pts,
            maxPoints: points,
            actual: actualOutput.slice(0, 500),
            expected: expected.slice(0, 500),
            timedOut: runResult.timedOut,
            exitCode: runResult.exitCode,
        });
        earned += pts;
    }

    const stylePossible = Number(assignment.style_points_possible) || 0;
    const efficiencyPossible = Number(assignment.efficiency_points_possible) || 0;
    const totalPossible = maxPossible + stylePossible + efficiencyPossible;
    const stylePts = submission.style_points != null ? Number(submission.style_points) : 0;
    const efficiencyPts = submission.efficiency_points != null ? Number(submission.efficiency_points) : 0;
    const deductionPts = submission.deduction_points != null ? Number(submission.deduction_points) : 0;
    const rubricTotal = earned + stylePts + efficiencyPts - deductionPts;
    const rawScore = totalPossible > 0 ? (rubricTotal / totalPossible) * 100 : (maxPossible > 0 ? (earned / maxPossible) * 100 : 0);
    const latePenaltyPercent = computeLatePenaltyPercent(assignment, submission.submitted_at);
    const finalGrade = latePenaltyPercent > 0
        ? Math.max(0, rawScore * (1 - latePenaltyPercent / 100))
        : rawScore;

    const feedbackLines = [
        `Correctness: ${earned}/${maxPossible}.`,
        ...(totalPossible > maxPossible ? [`Rubric total: ${rubricTotal}/${totalPossible} (Style + Efficiency - Deductions).`] : []),
        ...(latePenaltyPercent > 0 ? [`Late penalty: ${latePenaltyPercent.toFixed(1)}%. Final: ${finalGrade.toFixed(1)}%.`] : []),
        '---',
        JSON.stringify(results),
    ];
    const feedback = feedbackLines.join('\n');

    if (!opts.publicOnly) {
        await updateSubmissionGrade(submissionId, {
            correctness_score: earned,
            grade: Math.round(finalGrade * 100) / 100,
            feedback,
            status: 'graded',
        });
        await saveDb();
    }

    return {
        grade: Math.round(finalGrade * 100) / 100,
        feedback,
        results,
        rawScore,
        maxPossible,
        latePenaltyPercent,
    };
}

async function updateSubmissionGrade(submissionId, opts) {
    const { correctness_score, grade, feedback, status } = opts;
    const updates = ["feedback = ?", "status = ?", "updated_at = CURRENT_TIMESTAMP"];
    const params = [feedback ?? '', status ?? 'graded'];
    if (correctness_score !== undefined) {
        updates.push('correctness_score = ?');
        params.push(correctness_score);
    }
    if (grade !== undefined) {
        updates.push('grade = ?');
        params.push(grade);
    }
    params.push(submissionId);
    await run(`UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`, params);
}

module.exports = { gradeSubmission, computeLatePenaltyPercent };
