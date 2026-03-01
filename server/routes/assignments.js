const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne } = require('../db');

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

// POST /api/assignments - Create new assignment
router.post('/', async (req, res, next) => {
    try {
        const { course_id, title, description, due_date, status = 'active', points = 100, language, starter_code_path, test_case_file_path = null, type = 'individual',
            late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap } = req.body;

        if (!course_id || !title || !due_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Convert ISO 8601 (e.g. "2026-03-01T05:59:00.000Z") to MySQL DATETIME format "YYYY-MM-DD HH:MM:SS"
        const mysqlDueDate = new Date(due_date).toISOString().slice(0, 19).replace('T', ' ');

        const id = req.body.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4);

        const db = getDb();
        const lateEnabled = late_penalty_enabled === true || late_penalty_enabled === 1 || late_penalty_enabled === '1';
        const lateType = late_penalty_type || 'per_day';
        const lateValue = late_penalty_value != null ? Number(late_penalty_value) : 10;
        const lateCap = late_penalty_cap != null ? Number(late_penalty_cap) : 50;

        await db.execute(
            'INSERT INTO assignments (id, course_id, title, description, due_date, status, points, language, starter_code_path, test_case_file_path, type, late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, course_id, title, description, mysqlDueDate, status, points, language, starter_code_path, test_case_file_path, type, lateEnabled ? 1 : 0, lateType, lateValue, lateCap]
        );

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
        const [students] = await db.execute("SELECT id, name FROM users WHERE role = 'student' ORDER BY name");

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
        const { code, language } = req.body;
        const assignmentId = req.params.id;

        console.log('[Run Tests]', { assignmentId, language: language || 'python', codeLength: (code || '').length });

        if (!code) {
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

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'student-test-'));
        const fileName = lang === 'python' ? 'main.py' : (lang === 'javascript' ? 'main.js' : (lang === 'java' ? 'Main.java' : 'main.php'));
        const filePath = path.join(tmpDir, fileName);

        try {
            fs.writeFileSync(filePath, code);

            const results = [];
            const timeoutMs = config.runTimeoutMs || 10000;

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
                    const error = runResult.timedOut
                        ? 'Run timed out.'
                        : (runResult.stderr && runResult.stderr.trim()) || (runResult.exitCode !== 0 && runResult.exitCode !== null ? `Exit code ${runResult.exitCode}` : null);

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
                        error: runErr.message || 'Docker run failed. Is Docker running?',
                        passed: false,
                        is_public: tc.is_public,
                        points: pts
                    });
                }
            }

            const passed = results.filter(r => r.passed).length;
            const failed = results.length - passed;
            console.log('[Run Tests]', { assignmentId, total: results.length, passed, failed, results: results.map(r => ({ id: r.id, passed: r.passed, error: r.error || null })) });

            res.json({ results });
        } finally {
            try {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch (_) {}
        }
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
