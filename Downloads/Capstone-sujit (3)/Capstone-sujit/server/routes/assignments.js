const express = require('express');
const router = express.Router();
const { getDb, withTransaction, queryToObjects, queryOne } = require('../db');

// GET /api/assignments - Get all assignments
router.get('/', async (req, res, next) => {
    try {
        const db = getDb();
        const result = await db.execute('SELECT * FROM assignments ORDER BY due_date');
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// GET /api/assignments/:id - Get single assignment
router.get('/:id', async (req, res, next) => {
    try {
        const db = getDb();
        const result = await db.execute('SELECT * FROM assignments WHERE id = ?', [req.params.id]);
        const assignment = queryOne(result);

        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        res.json(assignment);
    } catch (err) {
        next(err);
    }
});

// POST /api/assignments/with-rubric - Create assignment then save rubric criteria (assignment id from insertId)
router.post('/with-rubric', async (req, res, next) => {
    try {
        const body = req.body || {};
        const { course_id, title, description, due_date, status = 'active', points = 100, language, starter_code_path, test_case_file_path = null, type = 'individual',
            late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap,
            rubric_criteria } = body;

        if (!course_id || !title || !due_date) {
            return res.status(400).json({ error: 'Missing required fields: course_id, title, due_date' });
        }

        const criteria = Array.isArray(rubric_criteria) ? rubric_criteria : [];
        const mysqlDueDate = new Date(due_date).toISOString().slice(0, 19).replace('T', ' ');
        const lateEnabled = late_penalty_enabled === true || late_penalty_enabled === 1 || late_penalty_enabled === '1';
        const lateType = late_penalty_type || 'per_day';
        const lateValue = late_penalty_value != null ? Number(late_penalty_value) : 10;
        const lateCap = late_penalty_cap != null ? Number(late_penalty_cap) : 50;

        const result = await withTransaction(async (conn) => {
            let assignmentId;
            try {
                const [insertResult] = await conn.execute(
                    'INSERT INTO assignments (course_id, title, description, due_date, status, points, language, starter_code_path, test_case_file_path, type, late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [course_id, title, description || null, mysqlDueDate, status, points, language || null, starter_code_path || null, test_case_file_path || null, type, lateEnabled ? 1 : 0, lateType, lateValue, lateCap]
                );
                assignmentId = insertResult.insertId;
            } catch (e) {
                if (e.message && e.message.includes("Field 'id'") && e.message.includes("default value")) {
                    const stringId = (body.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4));
                    await conn.execute(
                        'INSERT INTO assignments (id, course_id, title, description, due_date, status, points, language, starter_code_path, test_case_file_path, type, late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [stringId, course_id, title, description || null, mysqlDueDate, status, points, language || null, starter_code_path || null, test_case_file_path || null, type, lateEnabled ? 1 : 0, lateType, lateValue, lateCap]
                    );
                    assignmentId = stringId;
                } else {
                    throw e;
                }
            }

            if (criteria.length > 0) {
                for (const c of criteria) {
                    const name = (c.criterion_name != null ? String(c.criterion_name) : (c.label || '')).trim() || 'Criterion';
                    const pts = Math.max(0, parseInt(c.points, 10) || parseInt(c.maxPoints, 10) || 0);
                    const weight = c.weight != null && c.weight !== '' ? Math.max(0, Math.min(100, Number(c.weight))) : null;
                    const category = (c.category != null ? String(c.category) : '').trim() || null;
                    const description = (c.description != null ? String(c.description) : '').trim() || null;
                    await conn.execute(
                        'INSERT INTO assignment_rubric_criteria (assignment_id, criterion_name, points, weight, category, description) VALUES (?, ?, ?, ?, ?, ?)',
                        [assignmentId, name, pts, weight, category, description]
                    ).catch(() => conn.execute(
                        'INSERT INTO assignment_rubric_criteria (assignment_id, criterion_name, points, weight) VALUES (?, ?, ?, ?, ?)',
                        [assignmentId, name, pts, weight]
                    ));
                }
            }

            return { assignmentId, course_id, title, description, due_date, status, points, language, starter_code_path, test_case_file_path, type, lateEnabled, lateType, lateValue, lateCap, criteriaCount: criteria.length };
        });

        res.status(201).json({
            id: result.assignmentId,
            course_id: result.course_id,
            title: result.title,
            description: result.description,
            due_date: result.due_date,
            status: result.status,
            points: result.points,
            language: result.language,
            starter_code_path: result.starter_code_path,
            test_case_file_path: result.test_case_file_path,
            type: result.type,
            late_penalty_enabled: result.lateEnabled,
            late_penalty_type: result.lateType,
            late_penalty_value: result.lateValue,
            late_penalty_cap: result.lateCap,
            rubric_criteria_saved: result.criteriaCount
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/assignments - Create new assignment (id is auto-generated number)
router.post('/', async (req, res, next) => {
    try {
        const { course_id, title, description, due_date, status = 'active', points = 100, language, starter_code_path, test_case_file_path = null, type = 'individual',
            late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap } = req.body;

        if (!course_id || !title || !due_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const mysqlDueDate = new Date(due_date).toISOString().slice(0, 19).replace('T', ' ');

        const db = getDb();
        const lateEnabled = late_penalty_enabled === true || late_penalty_enabled === 1 || late_penalty_enabled === '1';
        const lateType = late_penalty_type || 'per_day';
        const lateValue = late_penalty_value != null ? Number(late_penalty_value) : 10;
        const lateCap = late_penalty_cap != null ? Number(late_penalty_cap) : 50;

        let id;
        try {
            const [result] = await db.execute(
                'INSERT INTO assignments (course_id, title, description, due_date, status, points, language, starter_code_path, test_case_file_path, type, late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [course_id, title, description, mysqlDueDate, status, points, language, starter_code_path, test_case_file_path, type, lateEnabled ? 1 : 0, lateType, lateValue, lateCap]
            );
            id = result.insertId;
        } catch (insertErr) {
            if (insertErr.message && insertErr.message.includes("Field 'id'") && insertErr.message.includes("default value")) {
                const stringId = (req.body.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4));
                await db.execute(
                    'INSERT INTO assignments (id, course_id, title, description, due_date, status, points, language, starter_code_path, test_case_file_path, type, late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [stringId, course_id, title, description, mysqlDueDate, status, points, language, starter_code_path, test_case_file_path, type, lateEnabled ? 1 : 0, lateType, lateValue, lateCap]
                );
                id = stringId;
            } else {
                throw insertErr;
            }
        }

        res.status(201).json({ id, course_id, title, description, due_date, status, points, language, starter_code_path, test_case_file_path, type, late_penalty_enabled: lateEnabled, late_penalty_type: lateType, late_penalty_value: lateValue, late_penalty_cap: lateCap });
    } catch (err) {
        next(err);
    }
});

// PUT /api/assignments/:id - Update assignment
router.put('/:id', async (req, res, next) => {
    try {
        const { title, description, due_date, status, points, language, starter_code_path, test_case_file_path, type,
            late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap } = req.body;
        const id = req.params.id;

        const db = getDb();

        const updates = [];
        const values = [];
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (due_date !== undefined) {
            updates.push('due_date = ?');
            const mysqlDueDate = new Date(due_date).toISOString().slice(0, 19).replace('T', ' ');
            values.push(mysqlDueDate);
        }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }
        if (points !== undefined) { updates.push('points = ?'); values.push(points); }
        if (language !== undefined) { updates.push('language = ?'); values.push(language); }
        if (starter_code_path !== undefined) { updates.push('starter_code_path = ?'); values.push(starter_code_path); }
        if (test_case_file_path !== undefined) { updates.push('test_case_file_path = ?'); values.push(test_case_file_path); }
        if (type !== undefined) { updates.push('type = ?'); values.push(type); }
        if (late_penalty_enabled !== undefined) { updates.push('late_penalty_enabled = ?'); values.push(late_penalty_enabled === true || late_penalty_enabled === 1 || late_penalty_enabled === '1' ? 1 : 0); }
        if (late_penalty_type !== undefined) { updates.push('late_penalty_type = ?'); values.push(late_penalty_type); }
        if (late_penalty_value !== undefined) { updates.push('late_penalty_value = ?'); values.push(Number(late_penalty_value)); }
        if (late_penalty_cap !== undefined) { updates.push('late_penalty_cap = ?'); values.push(Number(late_penalty_cap)); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        await db.execute(`UPDATE assignments SET ${updates.join(', ')} WHERE id = ?`, values);

        res.json({ message: 'Assignment updated successfully' });
    } catch (err) {
        next(err);
    }
});

// GET /api/assignments/:id/rubric-criteria - Get rubric criteria for this assignment (by assignment id)
router.get('/:id/rubric-criteria', async (req, res, next) => {
    try {
        const db = getDb();
        const [rows] = await db.execute(
            'SELECT id, assignment_id, criterion_name, points, weight, category, description FROM assignment_rubric_criteria WHERE assignment_id = ? ORDER BY id',
            [req.params.id]
        ).catch(() => db.execute(
            'SELECT id, assignment_id, criterion_name, points, weight FROM assignment_rubric_criteria WHERE assignment_id = ? ORDER BY id',
            [req.params.id]
        ));
        const list = (rows || []).map(r => ({
            ...r,
            weight: r.weight != null ? Number(r.weight) : null,
            category: r.category != null ? String(r.category) : null,
            description: r.description != null ? String(r.description) : null
        }));
        res.json(list);
    } catch (err) {
        if (err.message && (err.message.includes("doesn't exist") || err.message.includes("assignment_rubric_criteria"))) {
            return res.json([]);
        }
        next(err);
    }
});

// PUT /api/assignments/:id/rubric-criteria - Replace rubric criteria for this assignment
router.put('/:id/rubric-criteria', async (req, res, next) => {
    try {
        const assignmentId = req.params.id;
        const criteria = Array.isArray(req.body.criteria) ? req.body.criteria : [];
        const db = getDb();
        await db.execute('DELETE FROM assignment_rubric_criteria WHERE assignment_id = ?', [assignmentId]);
        for (const c of criteria) {
            const name = (c.criterion_name != null ? String(c.criterion_name) : (c.label || '')).trim() || 'Criterion';
            const pts = Math.max(0, parseInt(c.points, 10) || parseInt(c.maxPoints, 10) || 0);
            const weight = c.weight != null && c.weight !== '' ? Math.max(0, Math.min(100, Number(c.weight))) : null;
            const category = (c.category != null ? String(c.category) : '').trim() || null;
            const description = (c.description != null ? String(c.description) : '').trim() || null;
            await db.execute(
                'INSERT INTO assignment_rubric_criteria (assignment_id, criterion_name, points, weight, category, description) VALUES (?, ?, ?, ?, ?, ?)',
                [assignmentId, name, pts, weight, category, description]
            ).catch(() => db.execute(
                'INSERT INTO assignment_rubric_criteria (assignment_id, criterion_name, points, weight) VALUES (?, ?, ?, ?)',
                [assignmentId, name, pts, weight]
            ));
        }
        res.json({ message: 'Rubric criteria updated', count: criteria.length });
    } catch (err) {
        next(err);
    }
});

// POST /api/assignments/:id/test-cases - Create test case (assignment_id from URL, never from body)
router.post('/:id/test-cases', async (req, res, next) => {
    try {
        const assignmentId = (req.params.id || '').trim();
        if (!assignmentId) {
            return res.status(400).json({ error: 'Assignment ID is required' });
        }
        const body = req.body || {};
        const input = body.input != null ? String(body.input) : '';
        const expected_output = body.expected_output != null ? String(body.expected_output) : '';
        const points = body.points != null ? Number(body.points) : 1;
        const is_public = body.is_public != null ? (body.is_public ? 1 : 0) : 1;
        const safePoints = points <= 0 ? 1 : points;

        const db = getDb();
        await db.execute(
            'INSERT INTO test_cases (assignment_id, input, expected_output, points, is_public) VALUES (?, ?, ?, ?, ?)',
            [assignmentId, input, expected_output, safePoints, is_public]
        );
        res.status(201).json({ message: 'Test case created successfully' });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/assignments/:id - Delete assignment
router.delete('/:id', async (req, res, next) => {
    try {
        const db = getDb();
        await db.execute('DELETE FROM assignments WHERE id = ?', [req.params.id]);
        res.json({ message: 'Assignment deleted successfully' });
    } catch (err) {
        next(err);
    }
});

// GET /api/assignments/:id/grades/export - Export single assignment grades as CSV
router.get('/:id/grades/export', async (req, res, next) => {
    try {
        const db = getDb();
        const assignmentId = req.params.id;

        // 1. Get assignment info
        const [aRows] = await db.execute('SELECT * FROM assignments WHERE id = ?', [assignmentId]);
        const assignment = aRows[0];
        if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

        // 2. Get course info for context
        const [cRows] = await db.execute('SELECT id FROM courses WHERE id = ?', [assignment.course_id]);
        const course = cRows[0];

        // 3. Get all students
        const [students] = await db.execute("SELECT id, name FROM users WHERE (role IS NULL OR role IN ('user', 'student')) ORDER BY name");

        // 4. Get submissions for this specific assignment
        const [submissions] = await db.execute(`
            SELECT student_id, grade 
            FROM submissions 
            WHERE assignment_id = ?
        `, [assignmentId]);

        // 5. Create a map for quick lookup
        const gradeMap = {};
        submissions.forEach(s => {
            gradeMap[s.student_id] = s.grade;
        });

        // 6. Generate CSV
        const headers = ['Student Name', 'Student ID', `Grade (${assignment.title})`];
        const dataRows = students.map(student => {
            const grade = gradeMap[student.id];
            return [student.name, student.id, grade !== undefined && grade !== null ? grade : ''];
        });

        const csvContent = [
            headers.join(','),
            ...dataRows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const filename = `${course?.id || 'Course'}_${assignment.title.replace(/[^a-z0-9]/gi, '_')}_Grades.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
    } catch (err) {
        next(err);
    }
});

// POST /api/assignments/:id/test - Run tests for a specific assignment (Docker, same as autograder)
router.post('/:id/test', async (req, res, next) => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { runCode } = require('../grader/runCode');
    const config = require('../grader/config');

    try {
        const { code, language, submissionId, filename } = req.body;
        const assignmentId = req.params.id;

        console.log('[Run Tests]', { assignmentId, language: language || 'python', codeLength: (code || '').length, submissionId, filename });

        if (!code && !submissionId) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const db = getDb();

        const [testCases] = await db.execute('SELECT * FROM test_cases WHERE assignment_id = ?', [assignmentId]);

        if (testCases.length === 0) {
            return res.json({ results: [], summary: 'No test cases defined.' });
        }

        const lang = (language === 'node' ? 'javascript' : language) || 'python';
        const supported = ['python', 'javascript', 'java', 'php'];
        if (!supported.includes(lang)) {
            return res.json({
                results: testCases.map(tc => ({
                    id: tc.id,
                    input: tc.input,
                    expected: tc.expected_output,
                    actual: '',
                    error: `Unsupported language for testing: ${language}. Use python, javascript, or java.`,
                    passed: false,
                    is_public: tc.is_public,
                    points: tc.points ?? 0
                }))
            });
        }

        const codeTrimmed = (code || '').trim();
        if (!submissionId) {
            // Pure "run this code string" mode (Code Runner, etc.)
            if (!codeTrimmed || /^(\s*\(exit code|\s*Test \d+:|Passed:\s*\d)/m.test(codeTrimmed)) {
                const errMsg = 'The previewed content does not look like source code (it may be test output or an error message). Please ensure you are previewing the actual code file (e.g. .py) and try again.';
                return res.json({
                    results: testCases.map(tc => ({
                        id: tc.id,
                        input: tc.input,
                        expected: (tc.expected_output || '').trim(),
                        actual: '',
                        error: errMsg,
                        passed: false,
                        is_public: tc.is_public,
                        points: tc.points ?? 0
                    }))
                });
            }
        }

        function stripAnsi(str) {
            if (typeof str !== 'string') return str;
            return str.replace(/\x1b\[[0-9;]*m/g, '');
        }

        function getJavaPublicClassName(source) {
            if (typeof source !== 'string') return null;
            const match = source.match(/\bpublic\s+class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[\{]/);
            return match ? match[1] : null;
        }

        // We support two modes:
        // 1) Code-only (no submissionId): run the provided code string as a single file.
        // 2) Submission-aware: use all files from the submission, optionally overriding one with the edited code.
        const results = [];
        const timeoutMs = config.runTimeoutMs || 10000;

        // Mode 2: submission-aware multi-file run
        if (submissionId) {
            const uploadsDir = path.join(__dirname, '../uploads');
            const [subRows] = await db.execute('SELECT * FROM submissions WHERE id = ?', [submissionId]);
            const submission = subRows[0];
            if (!submission) {
                return res.json({
                    results: testCases.map(tc => ({
                        id: tc.id,
                        input: tc.input,
                        expected: (tc.expected_output || '').trim(),
                        actual: '',
                        error: 'Submission not found for preview run.',
                        passed: false,
                        is_public: tc.is_public,
                        points: tc.points ?? 0
                    }))
                });
            }

            const os = require('os');
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'student-preview-'));
            try {
                let filesData;
                try {
                    filesData = JSON.parse(submission.file_path);
                } catch (_) {
                    filesData = null;
                }

                if (Array.isArray(filesData) && filesData.length > 0) {
                    filesData.forEach(f => {
                        const src = path.join(uploadsDir, f.path);
                        const dest = path.join(workDir, f.name);
                        if (fs.existsSync(src)) {
                            fs.copyFileSync(src, dest);
                        }
                    });
                } else if (submission.file_path) {
                    const src = path.join(uploadsDir, submission.file_path);
                    const destName = submission.file_name || (lang === 'python' ? 'main.py' : (lang === 'javascript' ? 'main.js' : (lang === 'java' ? 'Main.java' : 'main.php')));
                    const dest = path.join(workDir, destName);
                    if (fs.existsSync(src)) {
                        fs.copyFileSync(src, dest);
                    }
                }

                // If a filename and code were provided, overwrite that file in the work dir so edits are respected
                if (filename && codeTrimmed) {
                    const targetPath = path.join(workDir, filename);
                    if (fs.existsSync(targetPath)) {
                        fs.writeFileSync(targetPath, code);
                    }
                }

                for (const tc of testCases) {
                    const pts = tc.points ?? 0;
                    try {
                        const runResult = await runCode({
                            sourceFilePath: workDir,
                            language: lang,
                            stdin: tc.input || '',
                            timeoutMs
                        });
                        const actual = (runResult.stdout || '').trim();
                        const expected = (tc.expected_output || '').trim();
                        const passed = actual === expected;
                        let error = runResult.timedOut
                            ? 'Run timed out.'
                            : (runResult.stderr && runResult.stderr.trim()) || (runResult.exitCode !== 0 && runResult.exitCode !== null ? `Exit code ${runResult.exitCode}` : null);
                        if (error) error = stripAnsi(error);

                        results.push({
                            id: tc.id,
                            input: tc.input,
                            expected,
                            actual,
                            error: error || null,
                            passed,
                            is_public: tc.is_public,
                            points: pts
                        });
                    } catch (runErr) {
                        console.log('[Run Tests] test case failed (submission mode)', { assignmentId, testCaseId: tc.id, error: runErr.message });
                        results.push({
                            id: tc.id,
                            input: tc.input,
                            expected: (tc.expected_output || '').trim(),
                            actual: '',
                            error: stripAnsi(runErr.message || 'Run failed. Is Docker or Python (py -3) available?'),
                            passed: false,
                            is_public: tc.is_public,
                            points: pts
                        });
                    }
                }
            } finally {
                try {
                    fs.rmSync(workDir, { recursive: true, force: true });
                } catch (_) { }
            }
        } else {
            // Mode 1: single-file code-only run (original behavior)
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'student-test-'));
            const fileName = lang === 'python' ? 'main.py' : (lang === 'javascript' ? 'main.js' : (lang === 'java' ? ((getJavaPublicClassName(codeTrimmed) || 'Main') + '.java') : 'main.php'));
            const filePath = path.join(tmpDir, fileName);

            try {
                fs.writeFileSync(filePath, code);

                for (const tc of testCases) {
                    const pts = tc.points ?? 0;
                    try {
                        const runResult = await runCode({
                            sourceFilePath: filePath,
                            language: lang,
                            stdin: tc.input || '',
                            timeoutMs
                        });
                        const actual = (runResult.stdout || '').trim();
                        const expected = (tc.expected_output || '').trim();
                        const passed = actual === expected;
                        let error = runResult.timedOut
                            ? 'Run timed out.'
                            : (runResult.stderr && runResult.stderr.trim()) || (runResult.exitCode !== 0 && runResult.exitCode !== null ? `Exit code ${runResult.exitCode}` : null);
                        if (error) error = stripAnsi(error);

                        results.push({
                            id: tc.id,
                            input: tc.input,
                            expected,
                            actual,
                            error: error || null,
                            passed,
                            is_public: tc.is_public,
                            points: pts
                        });
                    } catch (runErr) {
                        console.log('[Run Tests] test case failed', { assignmentId, testCaseId: tc.id, error: runErr.message });
                        results.push({
                            id: tc.id,
                            input: tc.input,
                            expected: (tc.expected_output || '').trim(),
                            actual: '',
                            error: stripAnsi(runErr.message || 'Run failed. Is Docker or Python (py -3) available?'),
                            passed: false,
                            is_public: tc.is_public,
                            points: pts
                        });
                    }
                }
            } finally {
                try {
                    fs.rmSync(tmpDir, { recursive: true, force: true });
                } catch (_) { }
            }
        }

        const passedCount = results.filter(r => r.passed).length;
        const failedCount = results.length - passedCount;
        console.log('[Run Tests]', { assignmentId, total: results.length, passed: passedCount, failed: failedCount, results: results.map(r => ({ id: r.id, passed: r.passed, error: r.error || null })) });

        res.json({ results });
    } catch (err) {
        console.error('[Run Tests] error', { assignmentId: req.params.id, message: err.message });
        next(err);
    }
});

// POST /api/assignments/:id/plagiarism-check - Run plagiarism detection
router.post('/:id/plagiarism-check', async (req, res, next) => {
    try {
        const db = getDb();
        const assignmentId = req.params.id;
        const fs = require('fs');
        const path = require('path');

        const [submissions] = await db.execute('SELECT * FROM submissions WHERE assignment_id = ?', [assignmentId]);
        const submissionMap = new Map();

        submissions.forEach(sub => {
            const existing = submissionMap.get(sub.student_id);
            if (!existing || new Date(sub.submitted_at) > new Date(existing.submitted_at)) {
                submissionMap.set(sub.student_id, sub);
            }
        });

        const tokenize = (code) => {
            return code.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')
                .replace(/\s+/g, ' ')
                .toLowerCase()
                .split(' ')
                .filter(t => t.length > 0);
        };

        const students = Array.from(submissionMap.values());
        const flaggedPairs = [];
        const threshold = 50;

        for (let i = 0; i < students.length; i++) {
            for (let j = i + 1; j < students.length; j++) {
                const sub1 = students[i];
                const sub2 = students[j];

                const path1 = path.join(__dirname, '../../uploads', sub1.file_path);
                const path2 = path.join(__dirname, '../../uploads', sub2.file_path);

                if (fs.existsSync(path1) && fs.existsSync(path2)) {
                    const code1 = fs.readFileSync(path1, 'utf8');
                    const code2 = fs.readFileSync(path2, 'utf8');

                    const tokens1 = new Set(tokenize(code1));
                    const tokens2 = new Set(tokenize(code2));

                    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
                    const union = new Set([...tokens1, ...tokens2]);

                    const similarity = (intersection.size / union.size) * 100;

                    if (similarity >= threshold) {
                        const [s1Rows] = await db.execute('SELECT name FROM users WHERE id = ?', [sub1.student_id]);
                        const s1 = s1Rows[0];
                        const [s2Rows] = await db.execute('SELECT name FROM users WHERE id = ?', [sub2.student_id]);
                        const s2 = s2Rows[0];

                        flaggedPairs.push({
                            student1: { id: sub1.student_id, name: s1 ? s1.name : sub1.student_id },
                            student2: { id: sub2.student_id, name: s2 ? s2.name : sub2.student_id },
                            similarity: Math.round(similarity),
                            matchedTokens: intersection.size,
                            totalTokens: union.size
                        });
                    }
                }
            }
        }

        flaggedPairs.sort((a, b) => b.similarity - a.similarity);

        res.json({
            assignmentId: req.params.id,
            totalSubmissions: students.length,
            flaggedPairs
        });

    } catch (err) {
        next(err);
    }
});

// POST /api/assignments/:id/autograde - Batch auto-grade all submissions
router.post('/:id/autograde', async (req, res, next) => {
    try {
        const { latePenalty, timeout = 2000 } = req.body;
        const assignmentId = req.params.id;
        const db = getDb();
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');
        const os = require('os');

        // 1. Get Assignment
        const [aRows] = await db.execute('SELECT * FROM assignments WHERE id = ?', [assignmentId]);
        const assignment = aRows[0];
        if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

        // 2. Get Test Cases
        const [testCases] = await db.execute('SELECT * FROM test_cases WHERE assignment_id = ?', [assignmentId]);
        if (testCases.length === 0) return res.json({ graded: 0, message: 'No test cases found' });

        // 3. Get Latest Submissions
        const [submissions] = await db.execute('SELECT * FROM submissions WHERE assignment_id = ?', [assignmentId]);
        const submissionMap = new Map();
        submissions.forEach(sub => {
            const existing = submissionMap.get(sub.student_id);
            if (!existing || new Date(sub.submitted_at) > new Date(existing.submitted_at)) {
                submissionMap.set(sub.student_id, sub);
            }
        });
        const latestSubmissions = Array.from(submissionMap.values());

        const { gradeSubmission } = require('../grader/gradeSubmission');

        // 5. Process All
        let gradedCount = 0;
        let totalGrades = 0;

        for (const sub of latestSubmissions) {
            try {
                // This will run the grader (custom or default), update the DB, and return the result
                const result = await gradeSubmission(sub.id);

                gradedCount++;
                totalGrades += result.grade;
            } catch (err) {
                console.error(`Failed to grade submission ${sub.id}:`, err);
            }
        }

        res.json({
            graded: gradedCount,
            average: gradedCount > 0 ? Math.round(totalGrades / gradedCount) : 0
        });

    } catch (err) {
        next(err);
    }
});

module.exports = router;
