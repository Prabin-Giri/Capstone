const path = require('path');
const fs = require('fs');
const os = require('os');
const { query, run, saveDb } = require('../db');
const { runCode } = require('./runCode');
const { compare, pointsForTest } = require('./outputCompare');
const config = require('./config');
const { ensureLocalUpload, parseStoredFiles, readStoredUpload, resolveLocalUploadPath } = require('../uploadStorage');

/**
 * Download a submission's files from S3 (or verify they exist locally)
 * into a temporary directory. Returns the local directory path and the
 * primary file path for the grader to use.
 */
async function downloadForGrading(submission) {
    const filesData = parseStoredFiles(submission.file_path, submission.file_name);
    const first = filesData[0];
    if (!first) throw new Error(`Submission ${submission.id} has no files`);

    if (filesData.length === 1) {
        const single = await ensureLocalUpload(first.path, { prefix: `autograde-${submission.id}-`, filename: first.name });
        return {
            primaryPath: single.path,
            sourcePath: single.path,
            workspacePath: path.dirname(single.path),
            isTemp: single.isTemp,
            tmpDir: single.tmpDir,
        };
    }

    // Multi-file submissions are always staged into a dedicated directory so
    // the grader only sees this submission's files.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `autograde-${submission.id}-`));
    let primaryPath = null;
    for (const file of filesData) {
        const dest = path.join(tmpDir, file.name);
        try {
            const localPath = resolveLocalUploadPath(file.path);
            if (localPath) {
                fs.copyFileSync(localPath, dest);
            } else {
                const buf = await readStoredUpload(file.path);
                fs.writeFileSync(dest, buf);
            }
            if (!primaryPath) primaryPath = dest;
        } catch (err) {
            console.warn(`[grader] Could not stage submission file: ${file.path}`, err.message);
        }
    }
    if (!primaryPath) throw new Error(`Submission files not found in storage for submission ${submission.id}`);
    return { primaryPath, sourcePath: tmpDir, workspacePath: tmpDir, isTemp: true, tmpDir };
}

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
 * @param {{ publicOnly?: boolean, dryRun?: boolean, testResultsOnly?: boolean }} [opts]
 * - publicOnly: only run public tests (e.g. student "run public tests")
 * - dryRun: run tests but do not persist anything
 * - testResultsOnly: persist auto_grade/auto_feedback; keep status pending (final grade still manual)
 * @returns {Promise<{ grade: number, feedback: string, results: Array, rawScore: number, maxPossible: number, latePenaltyPercent: number }>}
 */
async function gradeSubmission(submissionId, opts = {}) {
    const submissions = await query('SELECT * FROM submissions WHERE id = ?', [submissionId]);
    if (submissions.length === 0) throw new Error('Submission not found');
    const submission = submissions[0];

    const assignments = await query('SELECT * FROM assignments WHERE id = ?', [submission.assignment_id]);
    if (assignments.length === 0) throw new Error('Assignment not found');
    const assignment = assignments[0];

    // --- Custom Grader / JSON Test Case File Logic ---
    let testCases = [];
    let usingCustomGrader = false;
    let graderUploadTmpDir = null;

    if (assignment.test_case_file_path) {
        try {
            const graderUpload = await ensureLocalUpload(assignment.test_case_file_path, {
                prefix: `autograde-grader-${submissionId}-`,
                filename: path.basename(assignment.test_case_file_path),
            });
            graderUploadTmpDir = graderUpload.tmpDir;
            const graderPath = graderUpload.path;

            if (graderPath.toLowerCase().endsWith('.json')) {
                try {
                    const content = fs.readFileSync(graderPath, 'utf8');
                    const jsonCases = JSON.parse(content);
                    testCases = jsonCases.map((tc, idx) => ({
                        id: tc.id || `file-${idx}`,
                        input: tc.input || '',
                        expected_output: tc.expectedOutput || tc.expected_output || '',
                        points: Number(tc.points) || 0,
                        is_public: tc.isHidden === true ? 0 : 1,
                        input_type: tc.inputType || tc.input_type || 'stdin',
                        input_filename: tc.inputFilename || tc.input_filename,
                        output_filename: tc.outputFilename || tc.output_filename,
                        run_args: tc.runArgs || tc.run_args,
                        compare_mode: tc.compareMode || tc.compare_mode || 'exact'
                    }));
                    console.log(`[gradeSubmission] Loaded ${testCases.length} test cases from JSON file: ${assignment.test_case_file_path}`);
                } catch (e) {
                    console.error('Failed to parse JSON test cases:', e);
                }
            } else {
                usingCustomGrader = true;
                try {
                    const result = await gradeWithCustomFile(submission, assignment, graderPath, opts);
                    try {
                        if (!opts.dryRun) {
                            if (opts.testResultsOnly) {
                                await updateSubmissionGrade(submissionId, {
                                    auto_grade: result.grade,
                                    auto_feedback: result.feedback,
                                    status: 'pending',
                                });
                            } else {
                                await updateSubmissionGrade(submissionId, {
                                    grade: result.grade,
                                    feedback: result.feedback,
                                    status: 'graded',
                                });
                            }
                            await saveDb();
                        }
                        return result;
                    } finally {
                        if (graderUploadTmpDir) {
                            try { fs.rmSync(graderUploadTmpDir, { recursive: true, force: true }); } catch (_) {}
                            graderUploadTmpDir = null;
                        }
                    }
                } catch (err) {
                    console.error('Custom grader failed:', err);
                    const feedback = `Custom grader execution failed: ${err.message}`;
                    try {
                        if (!opts.dryRun) {
                            if (opts.testResultsOnly) {
                                await updateSubmissionGrade(submissionId, {
                                    auto_grade: 0,
                                    auto_feedback: feedback,
                                    status: 'pending',
                                });
                            } else {
                                await updateSubmissionGrade(submissionId, { grade: 0, feedback, status: 'failed' });
                            }
                            await saveDb();
                        }
                        return { grade: 0, feedback, results: [], rawScore: 0, maxPossible: 0, latePenaltyPercent: 0 };
                    } finally {
                        if (graderUploadTmpDir) {
                            try { fs.rmSync(graderUploadTmpDir, { recursive: true, force: true }); } catch (_) {}
                            graderUploadTmpDir = null;
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Failed to prepare grader upload:', err);
        }
    }

    if (!usingCustomGrader && testCases.length === 0) {
        testCases = await query('SELECT * FROM test_cases WHERE assignment_id = ? ORDER BY id', [assignment.id]);
    }

    if (opts.publicOnly) testCases = testCases.filter(tc => tc.is_public === 1 || tc.is_public === true);

    if (!usingCustomGrader && testCases.length === 0) {
        const feedback = 'No test cases defined for this assignment.';
        await updateSubmissionGrade(submissionId, { grade: null, feedback, status: 'graded' });
        return { grade: null, feedback, results: [], rawScore: 0, maxPossible: 0, latePenaltyPercent: 0 };
    }

    // Resolve source path (handle S3 or JSON array or plain filename)
    const { sourcePath, isTemp, tmpDir: graderTmpDir } = await downloadForGrading(submission);

    try {
        if (!fs.existsSync(sourcePath)) {
            const feedback = `Submission file not found: ${submission.file_path}`;
            if (!opts.dryRun) {
                if (opts.testResultsOnly) {
                    await updateSubmissionGrade(submissionId, { auto_grade: 0, auto_feedback: feedback, status: 'pending' });
                } else {
                    await updateSubmissionGrade(submissionId, { grade: 0, feedback, status: 'graded' });
                }
                await saveDb();
            }
            return { grade: 0, feedback, results: [], rawScore: 0, maxPossible: 0, latePenaltyPercent: 0 };
        }

    const language = (assignment.language || 'python').toLowerCase() === 'node' ? 'javascript' : (assignment.language || 'python').toLowerCase();
    const allowPartial = assignment.allow_partial === 1 || assignment.allow_partial === true;
    const partialPct = Number(assignment.partial_pct) || config.defaultPartialCreditPercent;

    const results = [];
    let earned = 0;
    const maxPossible = testCases.reduce((s, tc) => s + (Number(tc.points) || 0), 0);

    const javaMainClass = assignment.java_main_class && String(assignment.java_main_class).trim() ? String(assignment.java_main_class).trim() : null;

    // --- Java Class Name Extraction: Extract main class name to ensure filename matches for javac ---
    let javaOverrideFileName = null;
    if (language === 'java') {
        try {
            const content = fs.readFileSync(sourcePath, 'utf8');
            const classMatch = content.match(/public\s+class\s+(\w+)/);
            if (classMatch) {
                javaOverrideFileName = classMatch[1] + '.java';
                console.log(`[gradeSubmission] Extracted Java class name: ${classMatch[1]}, using file name: ${javaOverrideFileName}`);
            }
        } catch (e) {
            console.error('[gradeSubmission] Failed to read submission for Java class extraction:', e);
        }
    }

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
            overrideFileName: javaOverrideFileName || undefined
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
    const rubricTotal = earned + stylePts + efficiencyPts - deductionPts;
    const assignPoints = Number(assignment.points) || 100;
    const rawScore = totalPossible > 0 ? (rubricTotal / totalPossible) * assignPoints : (maxPossible > 0 ? (earned / maxPossible) * assignPoints : 0);
    const latePenaltyPercent = computeLatePenaltyPercent(assignment, submission.submitted_at);
    const finalGrade = latePenaltyPercent > 0
        ? Math.max(0, rawScore * (1 - latePenaltyPercent / 100))
        : rawScore;

    const feedbackLines = [
        `Correctness: ${earned}/${maxPossible}.`,
        ...(totalPossible > maxPossible ? [`Rubric total: ${rubricTotal}/${totalPossible} (Style + Efficiency - Deductions).`] : []),
        ...(latePenaltyPercent > 0 ? [`Late penalty: ${latePenaltyPercent.toFixed(1)}%. Final Grade: ${finalGrade.toFixed(2)}/${assignPoints}.`] : [`Final Grade: ${finalGrade.toFixed(2)}/${assignPoints}.`]),
        '---',
        JSON.stringify(results),
    ];
    const feedback = feedbackLines.join('\n');

    if (!opts.publicOnly && !opts.dryRun) {
        const rounded = Math.round(finalGrade * 100) / 100;
        if (opts.testResultsOnly) {
            await updateSubmissionGrade(submissionId, {
                auto_grade: rounded,
                auto_feedback: feedback,
                status: 'pending',
            });
        } else {
            await updateSubmissionGrade(submissionId, {
                auto_grade: rounded,
                auto_feedback: feedback,
                status: 'graded',
            });
        }
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
    } finally {
        if (isTemp && graderTmpDir) {
            try { fs.rmSync(graderTmpDir, { recursive: true, force: true }); } catch (_) {}
        }
        if (graderUploadTmpDir) {
            try { fs.rmSync(graderUploadTmpDir, { recursive: true, force: true }); } catch (_) {}
        }
    }
}

async function updateSubmissionGrade(submissionId, opts) {
    const { grade, auto_grade, feedback, auto_feedback, status } = opts;
    const updates = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
    const params = [status ?? 'graded'];
    
    if (grade !== undefined) {
        updates.push('grade = ?');
        params.push(grade);
    }
    if (auto_grade !== undefined) {
        updates.push('auto_grade = ?');
        params.push(auto_grade);
    }
    if (feedback !== undefined) {
        updates.push('feedback = ?');
        params.push(feedback);
    }
    if (auto_feedback !== undefined) {
        updates.push('auto_feedback = ?');
        params.push(auto_feedback);
    }
    
    params.push(submissionId);
    await run(`UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`, params);
}

/**
 * Run a custom grader script against a student submission.
 * Expects the script to output JSON to stdout.
 */
async function gradeWithCustomFile(submission, assignment, graderPath, opts = {}) {
    const { sourcePath: studentPath, isTemp, tmpDir } = await downloadForGrading(submission);

    try {

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
    const studentBase = 'student_submission' + studentExt;

    // We'll create a temp dir, copy both, then run grader.
    const os = require('os');
    const crypto = require('crypto');
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autograde-custom-'));

    // Handle student submission (could be file or dir)
    fs.copyFileSync(graderPath, path.join(workDir, graderBase));
    const stat = fs.statSync(studentPath);
        if (stat.isDirectory()) {
            const entries = fs.readdirSync(studentPath, { withFileTypes: true });
            const studentSubDir = path.join(workDir, 'submission');
            fs.mkdirSync(studentSubDir);
            for (const e of entries) {
                if (e.isFile()) fs.copyFileSync(path.join(studentPath, e.name), path.join(studentSubDir, e.name));
            }
        } else {
            fs.copyFileSync(studentPath, path.join(workDir, studentBase));
        }

        const { runInDocker } = require('./dockerRunner');
        const { runLocally } = require('./localRunner');
        const config = require('./config');
        const lang = language.toLowerCase();
        const image = config.images[lang] || config.images.python;

        // Command to run the grader. Pass the student path (internal to container) as arg.
        const studentArg = stat.isDirectory() ? 'submission' : studentBase;
        const cmd = lang === 'java'
            ? ['sh', '-c', `javac *.java && java ${graderBase.replace('.java', '')} ${studentArg}`]
            : [lang === 'python' ? 'python3' : 'node', graderBase, studentArg];

        let runResult;
        if (config.runMode === 'local') {
            runResult = await runLocally({
                cmd,
                workDir,
                timeoutMs: config.runTimeoutMs * 2,
            });
        } else {
            runResult = await runInDocker({
                image,
                cmd,
                workDir,
                timeoutMs: config.runTimeoutMs * 2, // Custom graders might need more time
            });
        }

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

        const assignPoints = Number(assignment.points) || 100;
        const rawScore = total > 0 ? (earned / total) * assignPoints : 0;
        const latePenaltyPercent = computeLatePenaltyPercent(assignment, submission.submitted_at);
        const finalGrade = latePenaltyPercent > 0
            ? Math.max(0, rawScore * (1 - latePenaltyPercent / 100))
            : rawScore;

        const feedback = [
            `Custom Grader Results: ${earned}/${total}.`,
            ...(latePenaltyPercent > 0 ? [`Late penalty: ${latePenaltyPercent.toFixed(1)}%. Final Grade: ${finalGrade.toFixed(2)}/${assignPoints}.`] : [`Final Grade: ${finalGrade.toFixed(2)}/${assignPoints}.`]),
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
        if (isTemp && tmpDir) {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        }
    }
}

module.exports = { gradeSubmission, computeLatePenaltyPercent };
