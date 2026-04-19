const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb, queryToObjects, queryOne, isMySQL } = require('../db');
const { parseStoredFiles, readStoredUpload } = require('../uploadStorage');
const { hasAnyRole } = require('../auth');

function normalizeRunLang(language) {
    const l = (language == null || language === '') ? 'python' : String(language).trim().toLowerCase();
    if (l === 'node' || l === 'nodejs') return 'javascript';
    return l;
}

function inferRunLangFromPayload({ requestedLang, code, files }) {
    const normalized = normalizeRunLang(requestedLang);
    const list = Array.isArray(files) ? files : [];
    const names = list.map((f) => String(f?.name || '').toLowerCase());
    const source = String(code || '');
    const allText = `${source}\n${list.map((f) => String(f?.content || '')).join('\n')}`;

    // Content-first detection for clipboard / mislabeled snippets (e.g. Java code in main.js).
    const hasJavaSyntax = (
        /\bimport\s+java\.[\w.*]+;/.test(allText) ||
        /\bpublic\s+class\s+\w+/.test(allText) ||
        /\bpublic\s+static\s+void\s+main\s*\(/.test(allText) ||
        /\bSystem\.out\.println\s*\(/.test(allText)
    );
    if (hasJavaSyntax) return 'java';

    const hasPhpSyntax = /<\?php/.test(allText);
    if (hasPhpSyntax) return 'php';

    const hasPythonSyntax = (
        /\bdef\s+\w+\s*\(.*\)\s*:/.test(allText) ||
        /\bif\s+__name__\s*==\s*['"]__main__['"]\s*:/.test(allText)
    );
    if (hasPythonSyntax) return 'python';

    // Extension-based fallback when content is ambiguous.
    if (names.some((n) => n.endsWith('.java'))) return 'java';
    if (names.some((n) => n.endsWith('.py'))) return 'python';
    if (names.some((n) => n.endsWith('.php'))) return 'php';
    if (names.some((n) => n.endsWith('.js') || n.endsWith('.mjs') || n.endsWith('.cjs'))) return 'javascript';

    return normalized;
}

const fs = require('fs');
const os = require('os');

function ensureStaff(req, res) {
    if (!hasAnyRole(req, 'admin', 'faculty', 'ta')) {
        res.status(403).json({ error: 'Faculty, TA, or admin access required' });
        return false;
    }
    return true;
}

/**
 * Run one program (used by /test and /run). Supports multi-file Java via `files` + optional `javaMainClass`.
 */
async function runStudentProgramOnce({ lang, code, stdin, timeoutMs, files, javaMainClass }) {
    const { runCode } = require('../grader/runCode');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'student-snippet-'));
    try {
        const effectiveLang = inferRunLangFromPayload({ requestedLang: lang, code, files });
        if (effectiveLang === 'java' && Array.isArray(files) && files.length > 0) {
            let written = 0;
            for (const item of files) {
                const base = path.basename(String(item?.name || ''));
                if (!/^[a-zA-Z0-9_.-]+\.java$/i.test(base)) continue;
                fs.writeFileSync(path.join(tmpRoot, base), String(item.content ?? ''));
                written++;
            }
            if (written === 0) {
                const classMatch = String(code || '').match(/public\s+class\s+(\w+)/);
                const cn = classMatch ? classMatch[1] : 'Main';
                fs.writeFileSync(path.join(tmpRoot, `${cn}.java`), String(code || ''));
            }
            const jc = javaMainClass && String(javaMainClass).trim().match(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/)
                ? String(javaMainClass).trim()
                : null;
            return await runCode({
                sourceFilePath: tmpRoot,
                language: effectiveLang,
                stdin: stdin || '',
                timeoutMs,
                ...(jc ? { javaMainClass: jc } : {}),
            });
        }

        let fileName;
        if (effectiveLang === 'java') {
            const classMatch = String(code).match(/public\s+class\s+(\w+)/);
            const className = classMatch ? classMatch[1] : 'Main';
            fileName = className + '.java';
        } else {
            fileName = effectiveLang === 'python' ? 'main.py' : (effectiveLang === 'javascript' ? 'main.js' : 'main.php');
        }
        const filePath = path.join(tmpRoot, fileName);
        fs.writeFileSync(filePath, String(code || ''));
        return await runCode({
            sourceFilePath: filePath,
            language: effectiveLang,
            stdin: stdin || '',
            timeoutMs,
        });
    } finally {
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch (_) { /* ignore */ }
    }
}

// GET /api/assignments - Get all assignments
router.get('/', async (req, res, next) => {
    try {
        const db = getDb();
        const timeField = (f) => isMySQL ? `DATE_FORMAT(${f}, '%Y-%m-%dT%H:%i:%sZ')` : f;
        const result = await db.execute(`SELECT *, ${timeField('due_date')} AS due_date FROM assignments ORDER BY due_date`);
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// GET /api/assignments/:id - Get single assignment
router.get('/:id', async (req, res, next) => {
    try {
        const db = getDb();
        const timeField = (f) => isMySQL ? `DATE_FORMAT(${f}, '%Y-%m-%dT%H:%i:%sZ')` : f;
        const result = await db.execute(`SELECT *, ${timeField('due_date')} AS due_date, ${timeField('created_at')} AS created_at, ${timeField('updated_at')} AS updated_at FROM assignments WHERE id = ?`, [req.params.id]);
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
        if (!ensureStaff(req, res)) return;
        const {
            course_id,
            title,
            description,
            due_date,
            status = 'active',
            points = 100,
            language,
            starter_code_path,
            test_case_file_path = null,
            type = 'individual',
            group_submission_type = 'one_for_all',
            max_group_members = null,
            groups = [],
            late_penalty_enabled,
            late_penalty_type,
            late_penalty_value,
            late_penalty_cap,
            rubric_config,
        } = req.body;

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
            'INSERT INTO assignments (id, course_id, title, description, due_date, status, points, language, starter_code_path, test_case_file_path, type, group_submission_type, max_group_members, late_penalty_enabled, late_penalty_type, late_penalty_value, late_penalty_cap, rubric_config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, course_id, title, description, mysqlDueDate, status, points, language, starter_code_path, test_case_file_path, type, group_submission_type, max_group_members, lateEnabled ? 1 : 0, lateType, lateValue, lateCap, rubric_config || null]
        );

        // Save groups if provided
        if (type === 'group' && Array.isArray(groups)) {
            for (const group of groups) {
                const groupId = group.id || id + '-grp-' + Math.random().toString(36).substr(2, 9);
                await db.execute('INSERT INTO assignment_groups (id, assignment_id, name) VALUES (?, ?, ?)', [groupId, id, group.name]);
                if (Array.isArray(group.students)) {
                    for (const studentId of group.students) {
                        try {
                            await db.execute('INSERT INTO group_members (group_id, student_id) VALUES (?, ?)', [groupId, studentId]);
                        } catch (e) {
                            console.error('Failed to add group member', e);
                        }
                    }
                }
            }
        }

        res.status(201).json({
            id,
            course_id,
            title,
            description,
            due_date,
            status,
            points,
            language,
            starter_code_path,
            test_case_file_path,
            type,
            late_penalty_enabled: lateEnabled,
            late_penalty_type: lateType,
            late_penalty_value: lateValue,
            late_penalty_cap: lateCap,
            rubric_config: rubric_config || null,
        });
    } catch (err) {
        next(err);
    }
});

// PUT /api/assignments/:id - Update assignment
router.put('/:id', async (req, res, next) => {
    try {
        if (!ensureStaff(req, res)) return;
        const {
            title,
            description,
            due_date,
            status,
            points,
            language,
            starter_code_path,
            test_case_file_path,
            type,
            group_submission_type,
            max_group_members,
            groups,
            late_penalty_enabled,
            late_penalty_type,
            late_penalty_value,
            late_penalty_cap,
            rubric_config,
            hide_student_names,
        } = req.body;
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
        if (group_submission_type !== undefined) { updates.push('group_submission_type = ?'); values.push(group_submission_type); }
        if (max_group_members !== undefined) { updates.push('max_group_members = ?'); values.push(max_group_members); }
        if (late_penalty_enabled !== undefined) { updates.push('late_penalty_enabled = ?'); values.push(late_penalty_enabled === true || late_penalty_enabled === 1 || late_penalty_enabled === '1' ? 1 : 0); }
        if (late_penalty_type !== undefined) { updates.push('late_penalty_type = ?'); values.push(late_penalty_type); }
        if (late_penalty_value !== undefined) { updates.push('late_penalty_value = ?'); values.push(Number(late_penalty_value)); }
        if (late_penalty_cap !== undefined) { updates.push('late_penalty_cap = ?'); values.push(Number(late_penalty_cap)); }
        if (rubric_config !== undefined) { updates.push('rubric_config = ?'); values.push(rubric_config); }
        if (hide_student_names !== undefined) { updates.push('hide_student_names = ?'); values.push(hide_student_names === true || hide_student_names === 1 || hide_student_names === '1' ? 1 : 0); }

        if (updates.length > 0) {
            values.push(id);
            await db.execute(`UPDATE assignments SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        // Update groups if provided
        if (groups && Array.isArray(groups)) {
            // Re-create groups: simple method is delete and insert
            await db.execute('DELETE FROM assignment_groups WHERE assignment_id = ?', [id]);
            for (const group of groups) {
                const groupId = group.id || id + '-grp-' + Math.random().toString(36).substr(2, 9);
                await db.execute('INSERT INTO assignment_groups (id, assignment_id, name) VALUES (?, ?, ?)', [groupId, id, group.name]);
                if (Array.isArray(group.students)) {
                    for (const studentId of group.students) {
                        try {
                            await db.execute('INSERT INTO group_members (group_id, student_id) VALUES (?, ?)', [groupId, studentId]);
                        } catch (e) {
                            console.error('Failed to add group member', e);
                        }
                    }
                }
            }
        }

        res.json({ message: 'Assignment updated successfully' });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/assignments/:id - Delete assignment
router.delete('/:id', async (req, res, next) => {
    try {
        if (!ensureStaff(req, res)) return;
        const db = getDb();
        await db.execute('DELETE FROM assignments WHERE id = ?', [req.params.id]);
        res.json({ message: 'Assignment deleted successfully' });
    } catch (err) {
        next(err);
    }
});

// GET /api/assignments/:id/groups - Get groups for assignment
router.get('/:id/groups', async (req, res, next) => {
    try {
        const db = getDb();
        const [groups] = await db.execute('SELECT * FROM assignment_groups WHERE assignment_id = ? ORDER BY name', [req.params.id]);
        
        // Fetch members for each group
        const result = [];
        for (const group of groupToObjects(groups)) {
            const [members] = await db.execute(`
                SELECT u.id, u.name, u.email, u.profile_picture 
                FROM group_members gm 
                JOIN users u ON gm.student_id = u.id 
                WHERE gm.group_id = ?
            `, [group.id]);
            
            result.push({
                ...group,
                students: queryToObjects(members)
            });
        }
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// Helper for object conversion
function groupToObjects(result) {
    if (!result) return [];
    if (Array.isArray(result)) {
        return Array.isArray(result[0]) ? result[0] : result;
    }
    return [];
}

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
    const config = require('../grader/config');

    try {
        const { code, language, files, javaMainClass } = req.body;
        const assignmentId = req.params.id;

        console.log('[Run Tests]', {
            assignmentId,
            language: language || 'python',
            codeLength: (code || '').length,
            javaFiles: Array.isArray(files) ? files.length : 0,
        });

        if (!code && !(Array.isArray(files) && files.length > 0)) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const db = getDb();
        const [assignments] = await db.execute('SELECT * FROM assignments WHERE id = ?', [assignmentId]);
        const assignment = assignments[0];

        if (!assignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        let testCases = [];

        if (assignment.test_case_file_path && assignment.test_case_file_path.toLowerCase().endsWith('.json')) {
            try {
                const content = (await readStoredUpload(assignment.test_case_file_path)).toString('utf8');
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
            } catch (e) {
                console.error('Failed to parse JSON test cases in /test:', e);
            }
        }

        if (testCases.length === 0) {
            const [dbCases] = await db.execute('SELECT * FROM test_cases WHERE assignment_id = ?', [assignmentId]);
            testCases = dbCases;
        }

        if (testCases.length === 0) {
            return res.json({ results: [], summary: 'No test cases defined.' });
        }

        const lang = normalizeRunLang(language);
        const supported = ['python', 'javascript', 'java', 'php'];
        if (!supported.includes(lang)) {
            return res.json({
                results: testCases.map(tc => ({
                    id: tc.id,
                    input: tc.input,
                    expected: tc.expected_output,
                    actual: '',
                    error: `Unsupported language for testing: ${language}. Use python, javascript, java, or php.`,
                    passed: false,
                    is_public: tc.is_public,
                    points: tc.points ?? 0
                }))
            });
        }

        const results = [];
        const timeoutMs = config.runTimeoutMs;

        for (const tc of testCases) {
            const pts = tc.points ?? 0;
            try {
                const runResult = await runStudentProgramOnce({
                    lang,
                    code: code || '',
                    stdin: tc.input || '',
                    timeoutMs,
                    files,
                    javaMainClass,
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
                    error: runErr.message || 'Execution failed.',
                    passed: false,
                    is_public: tc.is_public,
                    points: pts
                });
            }
        }

        const passed = results.filter(r => r.passed).length;
        const failed = results.length - passed;
        console.log('[Run Tests]', { assignmentId, total: results.length, passed, failed, results: results.map(r => ({ id: r.id, passed: r.passed, error: r.error || null })) });

        res.json({ results, timeoutMs: timeoutMs });
    } catch (err) {
        console.error('[Run Tests] error', { assignmentId: req.params.id, message: err.message });
        next(err);
    }
});

// POST /api/assignments/:id/run - Run code against custom stdin (Manual Input)
router.post('/:id/run', async (req, res, next) => {
    const config = require('../grader/config');

    try {
        const { code, language, stdin = '', files, javaMainClass } = req.body;
        const assignmentId = req.params.id;

        console.log('[Run Custom Code]', {
            assignmentId,
            language: language || 'python',
            codeLength: (code || '').length,
            stdinLength: stdin.length,
            javaFiles: Array.isArray(files) ? files.length : 0,
        });

        if (!code && !(Array.isArray(files) && files.length > 0)) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const lang = normalizeRunLang(language);
        const supported = ['python', 'javascript', 'java', 'php'];

        if (!supported.includes(lang)) {
            return res.status(400).json({ error: `Unsupported language for execution: ${language}. Use python, javascript, java, or php.` });
        }

        try {
            const timeoutMs = config.runTimeoutMs;

            const runResult = await runStudentProgramOnce({
                lang,
                code: code || '',
                stdin,
                timeoutMs,
                files,
                javaMainClass,
            });

            const actual = (runResult.stdout || '').trim();
            const error = runResult.timedOut
                ? 'Run timed out.'
                : (runResult.stderr && runResult.stderr.trim()) || (runResult.exitCode !== 0 && runResult.exitCode !== null ? `Exit code ${runResult.exitCode}` : null);

            res.json({
                stdout: actual,
                stderr: error || null,
                exitCode: runResult.exitCode,
                timedOut: runResult.timedOut,
                timeoutMs,
            });
        } catch (runErr) {
            console.error('[Run Custom Code] execution failed', { assignmentId, error: runErr.message });
            res.status(500).json({ error: runErr.message || 'Execution failed.' });
        }
    } catch (err) {
        console.error('[Run Custom Code] routing error', { assignmentId: req.params.id, message: err.message });
        next(err);
    }
});

async function runPlagiarismCheckInternal(assignmentId) {
        const db = getDb();
        const startTime = Date.now();

        const [[assignmentRow]] = await db.execute('SELECT type, group_submission_type FROM assignments WHERE id = ?', [assignmentId]);
        const isGroupOneForAll = assignmentRow && assignmentRow.type === 'group' && assignmentRow.group_submission_type === 'one_for_all';

        // Build a map of student_id -> { group_id, group_name } to tag same-group pairs
        const studentGroupMap = new Map();
        if (isGroupOneForAll) {
            const [groupMembers] = await db.execute(
                `SELECT gm.student_id, gm.group_id, ag.name AS group_name
                 FROM group_members gm
                 JOIN assignment_groups ag ON gm.group_id = ag.id
                 WHERE ag.assignment_id = ?`, [assignmentId]
            );
            for (const row of groupMembers) {
                studentGroupMap.set(row.student_id, { groupId: row.group_id, groupName: row.group_name });
            }
        }

        const [submissions] = await db.execute('SELECT * FROM submissions WHERE assignment_id = ?', [assignmentId]);
        const submissionMap = new Map();

        submissions.forEach(sub => {
            const existing = submissionMap.get(sub.student_id);
            if (!existing || new Date(sub.submitted_at) > new Date(existing.submitted_at)) {
                submissionMap.set(sub.student_id, sub);
            }
        });

        const tokenize = (code) => {
            return code
                .replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '') // remove JS/C comments
                .replace(/#.*/g, '') // remove Python comments
                .replace(/[^a-zA-Z0-9_]/g, ' ') // strip punctuation
                .toLowerCase()
                .split(/\s+/)
                .filter(t => t.length > 0);
        };

        // find matched line indices between two code strings
        const findMatchedLines = (code1, code2) => {
            const lines1 = code1.split('\n');
            const lines2 = code2.split('\n');
            const matched1 = new Set();
            const matched2 = new Set();

            lines1.forEach((line, i) => {
                const stripped = line.replace(/#.*/g, '').replace(/[^a-zA-Z0-9_]/g, ' ').toLowerCase().trim();
                if (stripped.length < 4) return;
                lines2.forEach((line2, j) => {
                    const stripped2 = line2.replace(/#.*/g, '').replace(/[^a-zA-Z0-9_]/g, ' ').toLowerCase().trim();
                    if (stripped2.length >= 4 && stripped === stripped2) {
                        matched1.add(i);
                        matched2.add(j);
                    }
                });
            });
            return { matched1: Array.from(matched1), matched2: Array.from(matched2) };
        };

        const students = Array.from(submissionMap.values());
        const flaggedPairs = [];
        const threshold = 50;
        const readSubmissionFiles = async (sub) => {
            const fileList = parseStoredFiles(sub.file_path, sub.file_name);
            let combinedCode = '';
            for (const file of fileList) {
                try {
                    const content = (await readStoredUpload(file.path)).toString('utf8');
                    if (fileList.length > 1) {
                        combinedCode += `\n\n# --- ${file.name} ---\n\n`;
                    }
                    combinedCode += content;
                } catch (err) {
                    console.warn(`[plagiarism] Skipping unreadable file ${file.path}:`, err.message);
                }
            }
            return combinedCode.trim();
        };

        for (let i = 0; i < students.length; i++) {
            for (let j = i + 1; j < students.length; j++) {
                const sub1 = students[i];
                const sub2 = students[j];

                const code1 = await readSubmissionFiles(sub1);
                const code2 = await readSubmissionFiles(sub2);

                if (code1 && code2) {
                    const tokens1 = new Set(tokenize(code1));
                    const tokens2 = new Set(tokenize(code2));

                    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
                    const union = new Set([...tokens1, ...tokens2]);

                    const similarity = (intersection.size / union.size) * 100;

                    if (similarity >= threshold) {
                        const [s1Rows] = await db.execute('SELECT name, profile_picture FROM users WHERE id = ?', [sub1.student_id]);
                        const s1 = s1Rows[0];
                        const [s2Rows] = await db.execute('SELECT name, profile_picture FROM users WHERE id = ?', [sub2.student_id]);
                        const s2 = s2Rows[0];

                        const { matched1, matched2 } = findMatchedLines(code1, code2);

                        // Check if both students are in the same group
                        let sameGroup = null;
                        if (isGroupOneForAll) {
                            const g1 = studentGroupMap.get(sub1.student_id);
                            const g2 = studentGroupMap.get(sub2.student_id);
                            if (g1 && g2 && g1.groupId === g2.groupId) {
                                sameGroup = g1.groupName || g1.groupId;
                            }
                        }

                        flaggedPairs.push({
                            student1: { id: sub1.student_id, name: s1 ? s1.name : sub1.student_id, profile_picture: s1?.profile_picture || null },
                            student2: { id: sub2.student_id, name: s2 ? s2.name : sub2.student_id, profile_picture: s2?.profile_picture || null },
                            similarity: Math.round(similarity),
                            matchedTokens: intersection.size,
                            totalTokens: union.size,
                            file1: { name: sub1.file_name, content: code1, matchedLines: matched1 },
                            file2: { name: sub2.file_name, content: code2, matchedLines: matched2 },
                            assignmentId,
                            sameGroup,
                        });
                    }
                }
            }
        }

        flaggedPairs.sort((a, b) => b.similarity - a.similarity);
        const latencyMs = Date.now() - startTime;

        return {
            assignmentId,
            totalSubmissions: students.length,
            flaggedPairs,
            latencyMs,
            isGroupAssignment: isGroupOneForAll,
        };
}

// POST /api/assignments/:id/plagiarism-check - Run plagiarism detection
router.post('/:id/plagiarism-check', async (req, res, next) => {
    try {
        if (!ensureStaff(req, res)) return;
        const report = await runPlagiarismCheckInternal(req.params.id);
        res.json(report);
    } catch (err) {
        next(err);
    }
});

// POST /api/assignments/:id/autograde - Batch auto-grade all submissions
router.post('/:id/autograde', async (req, res, next) => {
    try {
        if (!ensureStaff(req, res)) return;
        const { latePenalty, timeout = 2000 } = req.body;
        void latePenalty;
        void timeout;
        const assignmentId = req.params.id;
        const db = getDb();

        // 1. Get Assignment
        const [aRows] = await db.execute('SELECT * FROM assignments WHERE id = ?', [assignmentId]);
        const assignment = aRows[0];
        if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

        // 2. Get Test Cases
        let testCases = [];
        const [dbCases] = await db.execute('SELECT * FROM test_cases WHERE assignment_id = ?', [assignmentId]);
        testCases = dbCases;

        if (testCases.length === 0 && assignment.test_case_file_path && assignment.test_case_file_path.toLowerCase().endsWith('.json')) {
            try {
                const content = (await readStoredUpload(assignment.test_case_file_path)).toString('utf8');
                const jsonCases = JSON.parse(content);
                testCases = jsonCases; // gradeSubmission handles the mapping
            } catch (e) {
                console.error('Failed to parse JSON test cases in /autograde:', e);
            }
        }

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

// POST /api/assignments/:id/grade-group/:groupId - Grade an entire group
router.post('/:id/grade-group/:groupId', async (req, res, next) => {
    try {
        if (!ensureStaff(req, res)) return;
        const { grade, feedback, status = 'graded' } = req.body;
        const assignmentId = req.params.id;
        const groupId = req.params.groupId;
        const db = getDb();

        // 1. Get all students in the group
        const [members] = await db.execute('SELECT student_id FROM group_members WHERE group_id = ?', [groupId]);
        if (!members || members.length === 0) {
            return res.status(404).json({ error: 'Group has no members or does not exist' });
        }
        const studentIds = members.map(m => m.student_id);

        // 2. Update their latest submissions for this assignment
        let updateCount = 0;
        for (const studentId of studentIds) {
            // Find latest submission
            const [rows] = await db.execute('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY submitted_at DESC LIMIT 1', [assignmentId, studentId]);
            if (rows && rows.length > 0) {
                const subId = rows[0].id;
                await db.execute('UPDATE submissions SET grade = ?, feedback = ?, status = ? WHERE id = ?', [grade, feedback, status, subId]);
                updateCount++;
            } else {
                // If they have no submission, we might insert an empty graded submission or just skip.
                // We'll insert an empty placeholder so they see the grade.
                await db.execute("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, grade, feedback, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [assignmentId, studentId, 'Group Submission', '[]', grade, feedback, status]);
                updateCount++;
            }
        }

        res.json({ message: `Successfully graded ${updateCount} group members.` });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
module.exports.runPlagiarismCheckInternal = runPlagiarismCheckInternal;
