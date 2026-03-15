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

    const uploadsDir = path.join(__dirname, '../uploads');

    // --- Custom Grader File Logic ---
    if (assignment.test_case_file_path) {
        const graderPath = path.join(uploadsDir, assignment.test_case_file_path);
        if (fs.existsSync(graderPath)) {
            const result = await gradeWithCustomFile(submission, assignment, graderPath, opts);
            await updateSubmissionGrade(submissionId, {
                grade: result.grade,
                feedback: result.feedback,
                status: 'graded'
            });
            await saveDb();
            return result;
        }
    }

    let testCases = await query('SELECT * FROM test_cases WHERE assignment_id = ? ORDER BY id', [assignment.id]);
    if (opts.publicOnly) testCases = testCases.filter(tc => tc.is_public === 1 || tc.is_public === true);

    if (testCases.length === 0) {
        const feedback = 'No test cases defined for this assignment.';
        await updateSubmissionGrade(submissionId, { grade: null, feedback, status: 'graded' });
        return { grade: null, feedback, results: [], rawScore: 0, maxPossible: 0, latePenaltyPercent: 0 };
    }

    // Resolve source path (handle JSON array and multi-file submissions)
    let sourcePath = path.join(uploadsDir, submission.file_path);
    try {
        const filesData = JSON.parse(submission.file_path);
        if (Array.isArray(filesData) && filesData.length > 0) {
            if (filesData.length === 1) {
                // Single-file submission: just use that file directly
                sourcePath = path.join(uploadsDir, filesData[0].path);
            } else {
                // Multi-file submission: copy all files into a temp directory so imports work
                const os = require('os');
                const workDirForFiles = fs.mkdtempSync(path.join(os.tmpdir(), 'student-multi-'));
                filesData.forEach(f => {
                    const src = path.join(uploadsDir, f.path);
                    const dest = path.join(workDirForFiles, f.name);
                    if (fs.existsSync(src)) {
                        fs.copyFileSync(src, dest);
                    }
                });
                sourcePath = workDirForFiles;
            }
        }
    } catch (e) {
        // Not JSON, fall back to legacy single-path behavior
    }

    if (!fs.existsSync(sourcePath)) {
        const feedback = `Submission file not found: ${submission.file_path}`;
        await updateSubmissionGrade(submissionId, { grade: 0, feedback, status: 'graded' });
        return { grade: 0, feedback, results: [], rawScore: 0, maxPossible: 0, latePenaltyPercent: 0 };
    }

    const language = assignment.language || 'python';
    const allowPartial = assignment.allow_partial === 1 || assignment.allow_partial === true;
    const partialPct = Number(assignment.partial_pct) || config.defaultPartialCreditPercent;

    const results = [];
    let earned = 0;
    // Treat missing/zero points as 1 so each test contributes at least 1 point
    const maxPossible = testCases.reduce((s, tc) => {
        const raw = Number(tc.points);
        const pts = raw > 0 ? raw : 1;
        return s + pts;
    }, 0);

    const javaMainClass = assignment.java_main_class && String(assignment.java_main_class).trim() ? String(assignment.java_main_class).trim() : null;
    const runMode = (assignment.run_mode || 'program').toLowerCase();
    const isFunctionMode = runMode === 'function';

    for (const tc of testCases) {
        const rawPoints = Number(tc.points);
        const points = rawPoints > 0 ? rawPoints : 1;
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

        const actualOutput = (runResult.outputFileContent != null ? runResult.outputFileContent : runResult.stdout) ?? '';
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
    const criteriaTotal = earned + stylePts + efficiencyPts - deductionPts;
    const rawScore = totalPossible > 0 ? (criteriaTotal / totalPossible) * 100 : (maxPossible > 0 ? (earned / maxPossible) * 100 : 0);
    const latePenaltyPercent = computeLatePenaltyPercent(assignment, submission.submitted_at);
    const finalGrade = latePenaltyPercent > 0
        ? Math.max(0, rawScore * (1 - latePenaltyPercent / 100))
        : rawScore;

    const feedbackLines = [
        `Correctness: ${earned}/${maxPossible}.`,
        ...(totalPossible > maxPossible ? [`Total: ${criteriaTotal}/${totalPossible} (Style + Efficiency - Deductions).`] : []),
        ...(latePenaltyPercent > 0 ? [`Late penalty: ${latePenaltyPercent.toFixed(1)}%. Final: ${finalGrade.toFixed(1)}%.`] : []),
        '---',
        JSON.stringify(results),
    ];
    const feedback = feedbackLines.join('\n');

        if (!opts.publicOnly) {
        await updateSubmissionGrade(submissionId, {
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
    const { grade, feedback, status } = opts;
    const updates = ["feedback = ?", "status = ?", "updated_at = CURRENT_TIMESTAMP"];
    const params = [feedback ?? '', status ?? 'graded'];
    if (grade !== undefined) {
        updates.push('grade = ?');
        const num = grade != null ? Number(grade) : null;
        params.push(num != null && Number.isFinite(num) ? Math.round(num * 100) / 100 : num);
    }
    params.push(submissionId);
    await run(`UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`, params);
}

/**
 * Run a custom grader script against a student submission.
 * Expects the script to output JSON to stdout.
 */
async function gradeWithCustomFile(submission, assignment, graderPath, opts = {}) {
    const uploadsDir = path.join(__dirname, '../uploads');

    // Resolve student path (handle JSON array)
    let studentPath = path.join(uploadsDir, submission.file_path);
    try {
        const filesData = JSON.parse(submission.file_path);
        if (Array.isArray(filesData) && filesData.length > 0) {
            // For custom graders, they might want all files.
            // If it's a single file, just use its path.
            if (filesData.length === 1) {
                studentPath = path.join(uploadsDir, filesData[0].path);
            } else {
                // If multiple files, we'll need a way for the grader to find them.
                // For now, let's pass the first file's path? 
                // Or better: let's create a temp dir and copy all (this is handled below if it's a directory).
                // But studentPath needs to be a valid path for fs.statSync.
                // Since our system usually stores multiple files in a JSON array but NOT a shared directory,
                // we'll have to create a temporary directory and copy them all there FIRST.
                const os = require('os');
                const workDirForFiles = fs.mkdtempSync(path.join(os.tmpdir(), 'student-files-'));
                filesData.forEach(f => {
                    fs.copyFileSync(path.join(uploadsDir, f.path), path.join(workDirForFiles, f.name));
                });
                studentPath = workDirForFiles;
            }
        }
    } catch (e) {
        // Not JSON, use as is
    }

    const language = assignment.language || 'python';

    // We reuse runCode but with a twist: 
    // We'll run the grader script, and we need to "mount" the student submission.
    // However, runCode is designed to run the student code.
    // For simplicity, we'll run the grader script and pass the student code path *inside* the container if possible.
    // Actually, runCode copies the file to a temp dir.

    // Better: Run the grader script as the "main" program, and provide the student code 
    // as something it can find. 

    // Let's use runCode with the grader script as source, and "mount" student code as an input file?
    // No, student code might be a directory or multiple files.

    // Simplest Capstone-appropriate way with existing runCode:
    // 1. If studentPath is a file, we can pass its content? No.
    // 2. We modify runCode or use runInDocker directly.

    // Let's use runCode to run the GRADER script, and we'll "bundle" the student code into it.
    // We'll rename the grader to 'grader.py' (or active extension) and the student code to 'submission.py'

    const graderExt = path.extname(graderPath);
    const graderBase = 'grader' + graderExt;
    const studentExt = path.extname(studentPath);
    // Custom Python graders commonly expect helpers like "grade_utils" next to grader.py
    // and student code in module "solution". We copy those into the work dir.
    const isPython = (language || '').toLowerCase() === 'python';
    const solutionBase = isPython ? 'solution.py' : 'student_submission' + studentExt;

    // We'll create a temp dir, copy both, then run grader.
    const os = require('os');
    const crypto = require('crypto');
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autograde-custom-'));

    try {
        fs.copyFileSync(graderPath, path.join(workDir, graderBase));

        // If Python, also copy any sibling *.py files (e.g. grade_utils.py) so imports work.
        if (isPython) {
            try {
                const graderDir = path.dirname(graderPath);
                const siblings = fs.readdirSync(graderDir, { withFileTypes: true });
                for (const entry of siblings) {
                    if (!entry.isFile()) continue;
                    if (!entry.name.endsWith('.py')) continue;
                    if (entry.name === path.basename(graderPath)) continue;
                    const src = path.join(graderDir, entry.name);
                    const dest = path.join(workDir, entry.name);
                    if (!fs.existsSync(dest)) {
                        fs.copyFileSync(src, dest);
                    }
                }
            } catch (_) {
                // best-effort; ignore if we can't read siblings
            }
        }

        // Handle student submission (could be file or dir)
        const stat = fs.statSync(studentPath);
        if (stat.isDirectory()) {
            const entries = fs.readdirSync(studentPath, { withFileTypes: true });
            const studentSubDir = path.join(workDir, 'submission');
            fs.mkdirSync(studentSubDir);
            for (const e of entries) {
                if (e.isFile()) fs.copyFileSync(path.join(studentPath, e.name), path.join(studentSubDir, e.name));
            }
        } else {
            fs.copyFileSync(studentPath, path.join(workDir, solutionBase));
        }

        const { runInDocker } = require('./dockerRunner');
        const config = require('./config');
        const lang = language.toLowerCase();
        const image = config.images[lang] || config.images.python;

        // Command to run the grader. For single-file Python, grader often uses "from solution import ..." (no CLI arg needed).
        const studentArg = stat.isDirectory() ? 'submission' : solutionBase;
        const cmd = lang === 'java'
            ? ['sh', '-c', `javac *.java && java ${graderBase.replace('.java', '')} ${studentArg}`]
            : [lang === 'python' ? 'python3' : 'node', graderBase, studentArg];

        const runResult = await runInDocker({
            image,
            cmd,
            workDir,
            timeoutMs: config.runTimeoutMs * 2, // Custom graders might need more time
        });

        if (runResult.timedOut) throw new Error('Custom grader timed out');

        let output = runResult.stdout.trim();
        // Find the JSON block in stdout (in case there's extra logging)
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Custom grader did not output valid JSON. Output: ' + (output || runResult.stderr));
        }

        const data = JSON.parse(jsonMatch[0]);
        const earned = Number(data.earned_points) || 0;
        const total = Number(data.total_points) || 100;
        const results = Array.isArray(data.results) ? data.results.map((r, idx) => ({
            testId: 'custom-' + idx,
            name: r.name || `Task ${idx + 1}`,
            passed: !!r.passed,
            points: Number(r.points) || 0,
            maxPoints: Number(r.points) || 0,
            is_public: r.visibility !== 'private',
            actual: r.passed ? 'Passed' : 'Failed',
            expected: 'Passed'
        })) : [];

        const rawScore = total > 0 ? (earned / total) * 100 : 0;
        const latePenaltyPercent = computeLatePenaltyPercent(assignment, submission.submitted_at);
        const finalGrade = latePenaltyPercent > 0
            ? Math.max(0, rawScore * (1 - latePenaltyPercent / 100))
            : rawScore;

        const feedback = [
            `Custom Grader Results: ${earned}/${total}.`,
            ...(latePenaltyPercent > 0 ? [`Late penalty: ${latePenaltyPercent.toFixed(1)}%. Final: ${finalGrade.toFixed(1)}%.`] : []),
            '---',
            JSON.stringify(results)
        ].join('\n');

        return {
            grade: Math.round(finalGrade * 100) / 100,
            feedback,
            results,
            rawScore,
            maxPossible: total,
            earned_points: earned,
            latePenaltyPercent
        };

    } finally {
        try {
            fs.rmSync(workDir, { recursive: true, force: true });
        } catch (_) { }
    }
}

module.exports = { gradeSubmission, computeLatePenaltyPercent };
