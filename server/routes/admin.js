const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query, getDb, isMySQL } = require('../db');

const FACULTY_METRICS_SQL = `
    SELECT u.id, u.name, u.email, u.verified, u.created_at, u.updated_at,
        (SELECT COUNT(*) FROM courses c WHERE c.instructor_id = u.id) AS course_count,
        (SELECT COUNT(*) FROM assignments a INNER JOIN courses c ON a.course_id = c.id WHERE c.instructor_id = u.id) AS assignment_count,
        (SELECT COUNT(*) FROM assignments a INNER JOIN courses c ON a.course_id = c.id WHERE c.instructor_id = u.id AND a.status = 'active') AS active_assignments,
        (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id) AS messages_sent,
        (SELECT COUNT(DISTINCT ce.student_id) FROM course_enrollments ce INNER JOIN courses c ON ce.course_id = c.id WHERE c.instructor_id = u.id) AS unique_students
    FROM users u WHERE u.role = 'faculty'`;

function normalizeFacultyRow(row) {
    const n = { ...row };
    ['course_count', 'assignment_count', 'active_assignments', 'messages_sent', 'unique_students'].forEach((k) => {
        if (n[k] !== undefined && n[k] !== null) n[k] = Number(n[k]);
    });
    if (n.verified !== undefined && n.verified !== null) {
        n.verified = n.verified === 1 || n.verified === true;
    }
    return n;
}

function validateAdminFacultyPassword(password) {
    if (typeof password !== 'string' || password.length < 8) {
        return 'Password must be at least 8 characters';
    }
    if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
    if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must contain at least one special character';
    return null;
}

async function insertAdminStudentRecord(db, { studentId, name, email, password }) {
    const sid = String(studentId || '').trim();
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!sid || !normalizedName || !normalizedEmail) {
        const err = new Error('Student ID, name, and email are required');
        err.statusCode = 400;
        throw err;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        const err = new Error('Invalid email address');
        err.statusCode = 400;
        throw err;
    }
    const pw = String(password || '').trim();
    if (pw.length < 8) {
        const err = new Error('Password must be at least 8 characters');
        err.statusCode = 400;
        throw err;
    }
    const [existing] = await db.execute('SELECT id FROM users WHERE id = ? OR LOWER(email) = ?', [sid, normalizedEmail]);
    const exRows = Array.isArray(existing) ? existing : [];
    if (exRows.length > 0) {
        const err = new Error('A user with this student ID or email already exists');
        err.statusCode = 409;
        throw err;
    }
    if (isMySQL) {
        await db.execute(
            `INSERT INTO users (id, name, email, password, role, verified, student_id, email_verified, email_verification_token, email_verification_otp, email_verification_expires) VALUES (?, ?, ?, ?, 'student', 1, ?, 1, NULL, NULL, NULL)`,
            [sid, normalizedName, normalizedEmail, pw, sid]
        );
    } else {
        await db.execute(
            `INSERT INTO users (id, name, email, password, role, verified, student_id) VALUES (?, ?, ?, ?, 'student', 1, ?)`,
            [sid, normalizedName, normalizedEmail, pw, sid]
        );
    }
    if (pw === 'password123') {
        try {
            await db.execute('UPDATE users SET must_change_password = 1 WHERE id = ?', [sid]);
        } catch {
            /* column missing on very old DB */
        }
    }
    return { id: sid, email: normalizedEmail, name: normalizedName };
}

async function insertFacultyRecord(db, { name, email, password, verified }) {
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedName || !normalizedEmail) {
        const err = new Error('Name and email are required');
        err.statusCode = 400;
        throw err;
    }
    const pwErr = validateAdminFacultyPassword(password);
    if (pwErr) {
        const err = new Error(pwErr);
        err.statusCode = 400;
        throw err;
    }
    const [existing] = await db.execute('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
    const exRows = Array.isArray(existing) ? existing : [];
    if (exRows.length > 0) {
        const err = new Error('User with this email already exists');
        err.statusCode = 409;
        throw err;
    }
    const id = `faculty_${crypto.randomUUID()}`;
    const ver = verified === false ? 0 : 1;
    await db.execute(
        `INSERT INTO users (id, name, email, password, role, verified, student_id, email_verified, email_verification_token, email_verification_otp, email_verification_expires) VALUES (?, ?, ?, ?, 'faculty', ?, NULL, 1, NULL, NULL, NULL)`,
        [id, normalizedName, normalizedEmail, password, ver]
    );
    return { id, email: normalizedEmail, name: normalizedName };
}

async function buildLinkedCourseIdsMap(db, userIds) {
    const map = new Map();
    if (!userIds.length) return map;
    const ids = [...new Set(userIds.map(String))];
    const ph = ids.map(() => '?').join(',');
    for (const id of ids) map.set(id, new Set());

    const merge = (rows, uidKey, cidKey) => {
        const list = Array.isArray(rows) ? rows : [];
        for (const row of list) {
            const uid = row[uidKey];
            const cid = row[cidKey];
            if (uid != null && cid != null) map.get(String(uid))?.add(String(cid));
        }
    };

    try {
        const [r1] = await db.execute(
            `SELECT instructor_id AS uid, id AS cid FROM courses WHERE instructor_id IN (${ph})`,
            ids
        );
        merge(r1, 'uid', 'cid');
    } catch {
        /* optional tables */
    }
    try {
        const [r2] = await db.execute(
            `SELECT student_id AS uid, course_id AS cid FROM course_enrollments WHERE student_id IN (${ph})`,
            ids
        );
        merge(r2, 'uid', 'cid');
    } catch {
        /* */
    }
    try {
        const [r3] = await db.execute(
            `SELECT ta_id AS uid, course_id AS cid FROM course_tas WHERE ta_id IN (${ph})`,
            ids
        );
        merge(r3, 'uid', 'cid');
    } catch {
        /* */
    }

    const out = new Map();
    for (const [k, v] of map) out.set(k, [...v]);
    return out;
}

// Get all table names
router.get('/tables', async (req, res) => {
    try {
        if (isMySQL) {
            const rows = await query('SHOW TABLES');
            const tables = rows.map(r => Object.values(r)[0]).filter(Boolean);
            res.json(tables);
        } else {
            const rows = await query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            res.json(rows.map(t => t.name));
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get table schema and data
router.get('/tables/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    if (safeName !== tableName) return res.status(400).json({ error: 'Invalid table name' });
    try {
        if (isMySQL) {
            const columns = await query('SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [safeName]);
            const rows = await query(`SELECT * FROM \`${safeName}\` LIMIT 100`);
            res.json({ tableName: safeName, columns, rows });
        } else {
            const columns = await query(`PRAGMA table_info(${safeName})`);
            const rows = await query(`SELECT * FROM ${safeName} LIMIT 100`);
            res.json({ tableName: safeName, columns, rows });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/pending-faculty - List faculty pending verification
router.get('/pending-faculty', async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.execute(
            "SELECT id, name, email, role, created_at FROM users WHERE role = 'faculty' AND (verified = 0 OR verified IS NULL) ORDER BY created_at DESC"
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/verify-faculty/:id - Approve a faculty account
router.post('/verify-faculty/:id', async (req, res) => {
    try {
        const db = getDb();
        const [r] = await db.execute('UPDATE users SET verified = 1 WHERE id = ? AND role = ?', [req.params.id, 'faculty']);
        const affected = r && (r.affectedRows !== undefined ? r.affectedRows : r.changes);
        if (!affected) {
            return res.status(404).json({ error: 'Faculty not found or already verified' });
        }
        res.json({ message: 'Faculty verified successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/users — full profile (no password / tokens) + activity counts
router.get('/users', async (req, res) => {
    try {
        const db = getDb();

        if (isMySQL) {
            const [rows] = await db.execute(`
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    u.role,
                    u.student_id,
                    u.profile_picture,
                    u.verified,
                    u.email_verified,
                    u.created_at,
                    u.updated_at,
                    (SELECT COUNT(*) FROM courses c WHERE c.instructor_id = u.id) AS courses_teaching,
                    (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.student_id = u.id) AS enrollments_count,
                    (SELECT COUNT(*) FROM course_tas ct WHERE ct.ta_id = u.id) AS ta_courses_count,
                    (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id) AS submissions_count,
                    (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id) AS messages_sent,
                    (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.user_id = u.id) AS conversation_memberships,
                    (SELECT COUNT(*) FROM group_members gm WHERE gm.student_id = u.id) AS group_memberships,
                    (SELECT COUNT(*) FROM todos t WHERE t.student_id = u.id) AS todos_count,
                    (SELECT COUNT(*) FROM course_settings cs WHERE cs.student_id = u.id) AS course_settings_rows,
                    (SELECT GROUP_CONCAT(DISTINCT cid) FROM (
                        SELECT c.id AS cid FROM courses c WHERE c.instructor_id = u.id
                        UNION
                        SELECT ce.course_id AS cid FROM course_enrollments ce WHERE ce.student_id = u.id
                        UNION
                        SELECT ct.course_id AS cid FROM course_tas ct WHERE ct.ta_id = u.id
                    ) AS _uc) AS linked_course_ids
                FROM users u
                ORDER BY u.role, u.name
            `);
            return res.json(rows.map(normalizeAdminUserRow));
        }

        let baseRows;
        try {
            const [r] = await db.execute(
                `SELECT id, name, email, role, student_id, profile_picture, verified, email_verified, created_at, updated_at
                 FROM users ORDER BY role, name`
            );
            baseRows = r;
        } catch {
            const [r] = await db.execute(
                `SELECT id, name, email, role, student_id, profile_picture, verified, created_at, updated_at
                 FROM users ORDER BY role, name`
            );
            baseRows = r.map((row) => ({ ...row, email_verified: null }));
        }

        const countSql = async (sql, params) => {
            try {
                const [r] = await db.execute(sql, params);
                const row = r[0];
                if (!row) return 0;
                const v = row.c !== undefined ? row.c : row.COUNT !== undefined ? row.COUNT : Object.values(row)[0];
                return Number(v) || 0;
            } catch {
                return 0;
            }
        };

        const linkMap = await buildLinkedCourseIdsMap(db, baseRows.map((u) => u.id));

        const enriched = await Promise.all(
            baseRows.map(async (u) => {
                const id = u.id;
                return {
                    ...u,
                    linked_course_ids: (linkMap.get(String(id)) || []).join(','),
                    courses_teaching: await countSql('SELECT COUNT(*) AS c FROM courses WHERE instructor_id = ?', [id]),
                    enrollments_count: await countSql(
                        'SELECT COUNT(*) AS c FROM course_enrollments WHERE student_id = ?',
                        [id]
                    ),
                    ta_courses_count: await countSql('SELECT COUNT(*) AS c FROM course_tas WHERE ta_id = ?', [id]),
                    submissions_count: await countSql('SELECT COUNT(*) AS c FROM submissions WHERE student_id = ?', [id]),
                    messages_sent: await countSql('SELECT COUNT(*) AS c FROM messages WHERE sender_id = ?', [id]),
                    conversation_memberships: await countSql(
                        'SELECT COUNT(*) AS c FROM conversation_participants WHERE user_id = ?',
                        [id]
                    ),
                    group_memberships: await countSql('SELECT COUNT(*) AS c FROM group_members WHERE student_id = ?', [
                        id,
                    ]),
                    todos_count: await countSql('SELECT COUNT(*) AS c FROM todos WHERE student_id = ?', [id]),
                    course_settings_rows: await countSql(
                        'SELECT COUNT(*) AS c FROM course_settings WHERE student_id = ?',
                        [id]
                    ),
                };
            })
        );

        res.json(enriched.map(normalizeAdminUserRow));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function normalizeAdminUserRow(row) {
    const n = { ...row };
    if (n.verified !== undefined && n.verified !== null) {
        n.verified = n.verified === 1 || n.verified === true;
    }
    if (n.email_verified !== undefined && n.email_verified !== null) {
        n.email_verified = n.email_verified === 1 || n.email_verified === true;
    }
    const numKeys = [
        'courses_teaching',
        'enrollments_count',
        'ta_courses_count',
        'submissions_count',
        'messages_sent',
        'conversation_memberships',
        'group_memberships',
        'todos_count',
        'course_settings_rows',
    ];
    numKeys.forEach((k) => {
        if (n[k] !== undefined && n[k] !== null) n[k] = Number(n[k]);
    });
    if (Array.isArray(n.linked_course_ids)) {
        n.linked_course_ids = n.linked_course_ids.map(String).filter(Boolean);
    } else if (n.linked_course_ids != null && String(n.linked_course_ids).trim() !== '') {
        n.linked_course_ids = String(n.linked_course_ids)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    } else {
        n.linked_course_ids = [];
    }
    return n;
}

// GET /api/admin/students/insights - Student enrollment and activity
router.get('/students/insights', async (req, res) => {
    try {
        const db = getDb();
        const [students] = await db.execute(
            `SELECT u.id, u.name, u.email, u.created_at FROM users u WHERE u.role = 'student' ORDER BY u.name`
        );
        const [enrollments] = await db.execute(
            'SELECT student_id, course_id FROM course_enrollments'
        );
        const [submissions] = await db.execute(
            'SELECT student_id, assignment_id, grade FROM submissions'
        );
        let taRows = [];
        try {
            const [tr] = await db.execute('SELECT ta_id, course_id FROM course_tas');
            taRows = Array.isArray(tr) ? tr : [];
        } catch {
            taRows = [];
        }
        const taCoursesByUser = {};
        taRows.forEach((t) => {
            const uid = String(t.ta_id);
            if (!taCoursesByUser[uid]) taCoursesByUser[uid] = [];
            taCoursesByUser[uid].push(String(t.course_id));
        });
        const enrollByStudent = {};
        enrollments.forEach(e => {
            if (!enrollByStudent[e.student_id]) enrollByStudent[e.student_id] = [];
            enrollByStudent[e.student_id].push(e.course_id);
        });
        const submitByStudent = {};
        submissions.forEach(s => {
            if (!submitByStudent[s.student_id]) submitByStudent[s.student_id] = { count: 0, graded: 0 };
            submitByStudent[s.student_id].count++;
            if (s.grade != null) submitByStudent[s.student_id].graded++;
        });
        const enrolledIds = (sid) => (enrollByStudent[sid] || []).map(String);
        const result = students.map(s => {
            const taIds = taCoursesByUser[String(s.id)] || [];
            return {
                ...s,
                courses_enrolled: enrolledIds(s.id).length,
                enrolled_course_ids: enrolledIds(s.id),
                ta_course_ids: taIds,
                is_ta: taIds.length > 0,
                submissions_count: (submitByStudent[s.id] && submitByStudent[s.id].count) || 0,
                graded_count: (submitByStudent[s.id] && submitByStudent[s.id].graded) || 0,
            };
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/students — create one student account (admin)
router.post('/students', async (req, res) => {
    try {
        const { studentId, id, name, email, password } = req.body || {};
        const sid = studentId || id;
        const db = getDb();
        const out = await insertAdminStudentRecord(db, { studentId: sid, name, email, password });
        res.status(201).json({ message: 'Student created successfully', ...out });
    } catch (e) {
        const code = e.statusCode || 500;
        res.status(code >= 400 && code < 600 ? code : 500).json({
            error: e.message || 'Failed to create student',
        });
    }
});

// POST /api/admin/students/import — bulk create from parsed CSV rows
router.post('/students/import', async (req, res) => {
    try {
        const { rows, defaultPassword } = req.body || {};
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({
                error: 'rows must be a non-empty array of { studentId, name, email, password? }',
            });
        }
        const defPw = typeof defaultPassword === 'string' && defaultPassword.trim().length >= 8 ? defaultPassword.trim() : null;
        if (!defPw && rows.some((r) => !r || typeof r.password !== 'string' || !r.password.trim())) {
            return res.status(400).json({ error: 'Provide defaultPassword (8+ chars) or a password on each row' });
        }
        const db = getDb();
        const created = [];
        const errors = [];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i] || {};
            const sid = r.studentId || r.student_id || r.id;
            const password = (typeof r.password === 'string' && r.password.trim()) || defPw;
            try {
                const out = await insertAdminStudentRecord(db, {
                    studentId: sid,
                    name: r.name,
                    email: r.email,
                    password,
                });
                created.push(out);
            } catch (e) {
                errors.push({
                    row: i + 1,
                    studentId: String(sid || r.email || '').trim(),
                    error: e.message || String(e),
                });
            }
        }
        res.status(201).json({
            created,
            errors,
            message: `Created ${created.length}; ${errors.length} failed`,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/faculty - All faculty with engagement-related metrics + courses they teach (for admin filters)
router.get('/faculty', async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.execute(`${FACULTY_METRICS_SQL} ORDER BY u.name`);
        const list = Array.isArray(rows) ? rows : [];
        const normalized = list.map(normalizeFacultyRow);
        const ids = normalized.map((u) => u.id);
        if (ids.length === 0) {
            return res.json([]);
        }
        const ph = ids.map(() => '?').join(',');
        const [courseRows] = await db.execute(
            `SELECT id, name, term, instructor_id FROM courses WHERE instructor_id IN (${ph}) ORDER BY name`,
            ids
        );
        const cr = Array.isArray(courseRows) ? courseRows : [];
        const byInstructor = {};
        cr.forEach((row) => {
            const iid = String(row.instructor_id);
            if (!byInstructor[iid]) byInstructor[iid] = [];
            byInstructor[iid].push({
                id: String(row.id),
                name: row.name,
                term: row.term != null ? String(row.term) : '',
            });
        });
        const out = normalized.map((u) => ({
            ...u,
            courses_taught: byInstructor[String(u.id)] || [],
        }));
        res.json(out);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/faculty/import — bulk create from parsed CSV rows
router.post('/faculty/import', async (req, res) => {
    try {
        const { rows, defaultPassword } = req.body || {};
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ error: 'rows must be a non-empty array of { name, email, password? }' });
        }
        const defPw = typeof defaultPassword === 'string' && defaultPassword ? defaultPassword : null;
        if (!defPw && rows.some((r) => !r || typeof r.password !== 'string' || !r.password.trim())) {
            return res.status(400).json({ error: 'Provide defaultPassword or a password on each row' });
        }
        const db = getDb();
        const created = [];
        const errors = [];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i] || {};
            const password = (typeof r.password === 'string' && r.password.trim()) || defPw;
            try {
                const out = await insertFacultyRecord(db, {
                    name: r.name,
                    email: r.email,
                    password,
                    verified: true,
                });
                created.push(out);
            } catch (e) {
                errors.push({
                    row: i + 1,
                    email: r.email || '',
                    error: e.message || String(e),
                });
            }
        }
        res.status(201).json({
            created,
            errors,
            message: `Created ${created.length}; ${errors.length} failed`,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/faculty — create one faculty account
router.post('/faculty', async (req, res) => {
    try {
        const { name, email, password, requireVerification } = req.body || {};
        const db = getDb();
        const verified = requireVerification === true ? false : true;
        const out = await insertFacultyRecord(db, { name, email, password, verified });
        res.status(201).json({ message: 'Faculty created successfully', ...out });
    } catch (e) {
        const code = e.statusCode || 500;
        res.status(code >= 400 && code < 600 ? code : 500).json({
            error: e.message || 'Failed to create faculty',
        });
    }
});

// GET /api/admin/faculty/:id — detail + courses taught
router.get('/faculty/:id', async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const [rows] = await db.execute(`${FACULTY_METRICS_SQL} AND u.id = ?`, [id]);
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) {
            return res.status(404).json({ error: 'Faculty not found' });
        }
        let courseRows;
        try {
            const [cr] = await db.execute(
                'SELECT id, name, term, is_archived FROM courses WHERE instructor_id = ? ORDER BY name',
                [id]
            );
            courseRows = cr;
        } catch {
            const [cr] = await db.execute('SELECT id, name, term FROM courses WHERE instructor_id = ? ORDER BY name', [
                id,
            ]);
            courseRows = cr;
        }
        const courses = Array.isArray(courseRows) ? courseRows : [];
        res.json({ ...normalizeFacultyRow(list[0]), courses });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/analytics - App-wide stats
router.get('/analytics', async (req, res) => {
    try {
        const db = getDb();
        const [userCounts] = await db.execute(
            `SELECT role, COUNT(*) AS count FROM users GROUP BY role`
        );
        const [courseCount] = await db.execute('SELECT COUNT(*) AS count FROM courses');
        const [assignmentCount] = await db.execute('SELECT COUNT(*) AS count FROM assignments');
        const [submissionCount] = await db.execute('SELECT COUNT(*) AS count FROM submissions');
        const [enrollmentCount] = await db.execute('SELECT COUNT(*) AS count FROM course_enrollments');
        const byRole = {};
        userCounts.forEach(r => { byRole[r.role] = r.count; });
        res.json({
            users: byRole,
            totalUsers: userCounts.reduce((a, r) => a + Number(r.count), 0),
            totalCourses: courseCount[0]?.count ?? 0,
            totalAssignments: assignmentCount[0]?.count ?? 0,
            totalSubmissions: submissionCount[0]?.count ?? 0,
            totalEnrollments: enrollmentCount[0]?.count ?? 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const ADMIN_USER_ROLES = new Set(['student', 'faculty', 'admin', 'ta']);

// PATCH /api/admin/users/:id — update name, email, student_id, and/or role (Admin only)
router.patch('/users/:id', async (req, res) => {
    const userId = req.params.id;
    const body = req.body || {};
    const { name, email, student_id: studentIdBody, role } = body;

    const updates = {};
    if (typeof name === 'string') {
        const t = name.trim();
        if (!t) return res.status(400).json({ error: 'Name cannot be empty' });
        updates.name = t;
    }
    if (typeof email === 'string') {
        const t = email.trim();
        if (!t) return res.status(400).json({ error: 'Email cannot be empty' });
        updates.email = t;
    }
    if (studentIdBody !== undefined) {
        if (studentIdBody === null || studentIdBody === '') updates.student_id = null;
        else if (typeof studentIdBody === 'string') updates.student_id = studentIdBody.trim() || null;
        else return res.status(400).json({ error: 'Invalid student_id' });
    }
    if (role !== undefined) {
        if (typeof role !== 'string' || !ADMIN_USER_ROLES.has(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        updates.role = role;
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }

    try {
        const db = getDb();

        if (updates.email) {
            const [dup] = await db.execute('SELECT id FROM users WHERE email = ? AND id != ?', [
                updates.email,
                userId,
            ]);
            const dupRows = Array.isArray(dup) ? dup : [];
            if (dupRows.length > 0) {
                return res.status(409).json({ error: 'Email already in use' });
            }
        }

        const keys = Object.keys(updates);
        const qCol = (k) => (isMySQL ? `\`${k}\`` : k);
        const setClause = keys.map((k) => `${qCol(k)} = ?`).join(', ');
        const params = [...keys.map((k) => updates[k]), userId];
        await db.execute(`UPDATE users SET ${setClause} WHERE id = ?`, params);
        res.json({ message: 'User updated successfully' });
    } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        const code = err && err.code;
        if (code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT' || /duplicate|unique/i.test(msg)) {
            return res.status(409).json({ error: 'Email already in use' });
        }
        res.status(500).json({ error: msg || 'Update failed' });
    }
});

// DELETE /api/admin/users/:id - Delete a user account (Admin only)
router.delete('/users/:id', async (req, res) => {
    try {
        const db = getDb();
        await db.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/tables/:tableName - Update a record in a table (Admin only)
router.patch('/tables/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const { pkFields, updates } = req.body;
    const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    if (safeTable !== tableName) return res.status(400).json({ error: 'Invalid table name' });

    try {
        const db = getDb();
        const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
        const whereClauses = Object.keys(pkFields).map(k => `\`${k}\` = ?`).join(' AND ');
        const params = [...Object.values(updates), ...Object.values(pkFields)];

        const sql = `UPDATE \`${safeTable}\` SET ${setClauses} WHERE ${whereClauses}`;
        await db.execute(sql, params);
        res.json({ message: 'Record updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/tables/:tableName - Delete a record in a table (Admin only)
router.delete('/tables/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const { pkFields } = req.body;
    const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    if (safeTable !== tableName) return res.status(400).json({ error: 'Invalid table name' });

    try {
        const db = getDb();
        const whereClauses = Object.keys(pkFields).map(k => `\`${k}\` = ?`).join(' AND ');
        const params = Object.values(pkFields);

        const sql = `DELETE FROM \`${safeTable}\` WHERE ${whereClauses}`;
        await db.execute(sql, params);
        res.json({ message: 'Record deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/users/:id/enrollments - List student enrollments (Admin only)
router.get('/users/:id/enrollments', async (req, res) => {
    const studentId = req.params.id;
    try {
        const db = getDb();
        const [rows] = await db.execute(`
            SELECT c.id, c.name, ce.created_at FROM courses c
            JOIN course_enrollments ce ON c.id = ce.course_id
            WHERE ce.student_id = ?
        `, [studentId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function normalizeAdminCourseListRow(row) {
    const n = { ...row };
    ['student_count', 'assignment_count', 'ta_count'].forEach((k) => {
        if (n[k] != null && n[k] !== '') n[k] = Number(n[k]);
    });
    if (n.is_archived !== undefined && n.is_archived !== null) {
        n.is_archived = n.is_archived === 1 || n.is_archived === true;
    }
    return n;
}

// GET /api/admin/courses — paginated list (default 15 per page)
router.get('/courses', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '15'), 10) || 15));
        const offset = (page - 1) * limit;
        const safeLimit = Math.floor(Number(limit));
        const safeOffset = Math.floor(Number(offset));
        const db = getDb();

        const [countResult] = await db.execute('SELECT COUNT(*) AS n FROM courses');
        const countArr = Array.isArray(countResult) ? countResult : [];
        const countRow = countArr[0] || {};
        const total = Number(countRow.n ?? countRow.N ?? Object.values(countRow)[0] ?? 0);

        const baseSql = `
            SELECT c.id, c.name, c.term, c.created_at, c.updated_at, c.is_archived, c.instructor_id,
                u.name AS instructor_name,
                u.email AS instructor_email,
                (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.course_id = c.id) AS student_count,
                (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignment_count,
                (SELECT COUNT(*) FROM course_tas ct WHERE ct.course_id = c.id) AS ta_count,
                (SELECT MAX(a.due_date) FROM assignments a WHERE a.course_id = c.id) AS last_assignment_due
            FROM courses c
            LEFT JOIN users u ON u.id = c.instructor_id
            ORDER BY LOWER(c.name), c.id`;

        // mysql2 rejects bound parameters for LIMIT/OFFSET ("Incorrect arguments to mysqld_stmt_execute")
        const [rows] = await db.execute(`${baseSql} LIMIT ${safeLimit} OFFSET ${safeOffset}`);
        const list = Array.isArray(rows) ? rows : [];
        const courses = list.map(normalizeAdminCourseListRow);

        res.json({
            courses,
            total,
            page,
            limit,
            totalPages: total ? Math.ceil(total / limit) : 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/courses/:courseId/detail — students, assignments, TAs, stats
router.get('/courses/:courseId/detail', async (req, res) => {
    const { courseId } = req.params;
    try {
        const db = getDb();
        const [courseRows] = await db.execute(
            `SELECT c.id, c.name, c.term, c.created_at, c.updated_at, c.is_archived, c.instructor_id,
                u.name AS instructor_name, u.email AS instructor_email
             FROM courses c
             LEFT JOIN users u ON u.id = c.instructor_id
             WHERE c.id = ?`,
            [courseId]
        );
        const cr = Array.isArray(courseRows) ? courseRows : [];
        if (!cr.length) {
            return res.status(404).json({ error: 'Course not found' });
        }
        const course = normalizeAdminCourseListRow(cr[0]);

        let studentRows;
        try {
            const [sr] = await db.execute(
                `SELECT u.id, u.name, u.email, ce.enrolled_at AS enrolled_at
                 FROM users u
                 JOIN course_enrollments ce ON ce.student_id = u.id
                 WHERE ce.course_id = ?
                 ORDER BY u.name`,
                [courseId]
            );
            studentRows = sr;
        } catch {
            const [sr] = await db.execute(
                `SELECT u.id, u.name, u.email
                 FROM users u
                 JOIN course_enrollments ce ON ce.student_id = u.id
                 WHERE ce.course_id = ?
                 ORDER BY u.name`,
                [courseId]
            );
            studentRows = sr;
        }

        const [assignmentRows] = await db.execute(
            `SELECT a.id, a.title, a.due_date, a.status, a.points, a.created_at,
                (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submissions_count
             FROM assignments a
             WHERE a.course_id = ?
             ORDER BY a.due_date`,
            [courseId]
        );

        const [taRows] = await db.execute(
            `SELECT u.id, u.name, u.email
             FROM users u
             JOIN course_tas ct ON ct.ta_id = u.id
             WHERE ct.course_id = ?
             ORDER BY u.name`,
            [courseId]
        );

        const [subAgg] = await db.execute(
            `SELECT COUNT(*) AS n FROM submissions s
             INNER JOIN assignments a ON a.id = s.assignment_id
             WHERE a.course_id = ?`,
            [courseId]
        );
        const subArr = Array.isArray(subAgg) ? subAgg : [];
        const submissionTotal = Number(subArr[0]?.n ?? subArr[0]?.N ?? 0);

        const students = Array.isArray(studentRows) ? studentRows : [];
        const assignments = (Array.isArray(assignmentRows) ? assignmentRows : []).map((a) => ({
            ...a,
            submissions_count: Number(a.submissions_count ?? 0),
        }));
        const tas = Array.isArray(taRows) ? taRows : [];

        res.json({
            course,
            students,
            assignments,
            tas,
            stats: {
                enrollment_count: students.length,
                assignment_count: assignments.length,
                submission_count: submissionTotal,
                ta_count: tas.length,
                active_assignments: assignments.filter((a) => a.status === 'active').length,
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const DEFAULT_APP_SETTINGS = {
    maintenance_mode: 'false',
    allow_self_registration: 'true',
    require_email_verification: 'true',
    active_user_window_minutes: '15',
    max_upload_mb: '25',
};

// GET /api/admin/settings
router.get('/settings', async (req, res) => {
    try {
        const db = getDb();
        const merged = { ...DEFAULT_APP_SETTINGS };
        try {
            const [rows] = await db.execute('SELECT setting_key, setting_value FROM app_settings');
            const list = Array.isArray(rows) ? rows : [];
            list.forEach((r) => {
                if (r.setting_key != null) merged[String(r.setting_key)] = String(r.setting_value ?? '');
            });
        } catch {
            /* table missing on very old DB */
        }
        res.json(merged);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/settings — body: { "maintenance_mode": "true", ... } or { settings: { ... } }
router.patch('/settings', async (req, res) => {
    try {
        const raw = req.body || {};
        const incoming = raw.settings && typeof raw.settings === 'object' ? raw.settings : raw;
        const db = getDb();
        for (const [k, v] of Object.entries(incoming)) {
            if (typeof k !== 'string' || k.length > 120) continue;
            const val = v == null ? '' : String(v);
            if (isMySQL) {
                await db.execute(
                    'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP',
                    [k, val]
                );
            } else {
                await db.execute(
                    'INSERT OR REPLACE INTO app_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                    [k, val]
                );
            }
        }
        const [rows] = await db.execute('SELECT setting_key, setting_value FROM app_settings');
        const merged = { ...DEFAULT_APP_SETTINGS };
        const list = Array.isArray(rows) ? rows : [];
        list.forEach((r) => {
            if (r.setting_key != null) merged[String(r.setting_key)] = String(r.setting_value ?? '');
        });
        res.json(merged);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/security/login-audit — filter: all | failed | unknown
router.get('/security/login-audit', async (req, res) => {
    try {
        const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '150'), 10) || 150));
        const filter = String(req.query.filter || 'all');
        const db = getDb();
        let where = '1=1';
        if (filter === 'failed') where = "outcome = 'failed'";
        else if (filter === 'unknown') where = "outcome = 'failed' AND reason = 'unknown_user'";
        const sql = `SELECT id, email, user_id AS userId, outcome, reason, ip,
            user_agent AS userAgent, created_at AS createdAt
            FROM login_audit WHERE ${where} ORDER BY id DESC LIMIT ${limit}`;
        const [rows] = await db.execute(sql);
        res.json(Array.isArray(rows) ? rows : []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/security/activity-log — optional userId
router.get('/security/activity-log', async (req, res) => {
    try {
        const userId = req.query.userId ? String(req.query.userId).trim() : '';
        const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '150'), 10) || 150));
        const db = getDb();
        let sql;
        let params = [];
        if (userId) {
            sql = `SELECT a.id, a.user_id AS userId, u.name AS userName, u.email AS userEmail, u.role AS userRole,
                a.action, a.detail, a.ip, a.created_at AS createdAt
                FROM activity_log a
                LEFT JOIN users u ON u.id = a.user_id
                WHERE a.user_id = ?
                ORDER BY a.id DESC LIMIT ${limit}`;
            params = [userId];
        } else {
            sql = `SELECT a.id, a.user_id AS userId, u.name AS userName, u.email AS userEmail, u.role AS userRole,
                a.action, a.detail, a.ip, a.created_at AS createdAt
                FROM activity_log a
                LEFT JOIN users u ON u.id = a.user_id
                ORDER BY a.id DESC LIMIT ${limit}`;
        }
        const [rows] = await db.execute(sql, params);
        res.json(Array.isArray(rows) ? rows : []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/security/active-users — seen in last N minutes (from settings or query)
router.get('/security/active-users', async (req, res) => {
    try {
        const db = getDb();
        let windowMin = Math.min(120, Math.max(5, parseInt(String(req.query.minutes || '15'), 10) || 15));
        try {
            const [sr] = await db.execute(
                'SELECT setting_value FROM app_settings WHERE setting_key = ?',
                ['active_user_window_minutes']
            );
            const row = Array.isArray(sr) && sr[0];
            const v = row && row.setting_value != null ? parseInt(String(row.setting_value), 10) : NaN;
            if (!Number.isNaN(v)) windowMin = Math.min(120, Math.max(5, v));
        } catch {
            /* */
        }
        let sql;
        if (isMySQL) {
            sql = `SELECT id, name, email, role, last_seen_at AS lastSeenAt FROM users
                WHERE last_seen_at IS NOT NULL AND last_seen_at > DATE_SUB(NOW(), INTERVAL ${windowMin} MINUTE)
                ORDER BY last_seen_at DESC`;
        } else {
            sql = `SELECT id, name, email, role, last_seen_at AS lastSeenAt FROM users
                WHERE last_seen_at IS NOT NULL AND datetime(last_seen_at) > datetime('now', '-${windowMin} minutes')
                ORDER BY last_seen_at DESC`;
        }
        const [rows] = await db.execute(sql);
        res.json(Array.isArray(rows) ? rows : []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/courses/:courseId/enroll — body: { studentId }
router.post('/courses/:courseId/enroll', async (req, res) => {
    try {
        const courseId = String(req.params.courseId || '').trim();
        const studentId = String((req.body && req.body.studentId) || '').trim();
        if (!courseId || !studentId) {
            return res.status(400).json({ error: 'courseId and studentId are required' });
        }
        const db = getDb();
        const [courseCheck] = await db.execute('SELECT id FROM courses WHERE id = ?', [courseId]);
        if (!Array.isArray(courseCheck) || courseCheck.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }
        const [userRows] = await db.execute('SELECT id, role FROM users WHERE id = ?', [studentId]);
        if (!Array.isArray(userRows) || userRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const role = userRows[0].role;
        if (role !== 'student' && role !== 'ta') {
            return res.status(400).json({ error: 'Only student or TA accounts can be enrolled as students' });
        }
        if (isMySQL) {
            await db.execute('INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [courseId, studentId]);
        } else {
            await db.execute('INSERT OR IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [courseId, studentId]);
        }
        res.json({ message: 'Student enrolled successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/courses/:courseId/enroll-csv — same payload as faculty CSV enroll
router.post('/courses/:courseId/enroll-csv', async (req, res) => {
    const { students } = req.body || {};
    const courseId = String(req.params.courseId || '').trim();
    if (!courseId) return res.status(400).json({ error: 'courseId is required' });
    if (!Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'students array is required' });
    }
    try {
        const db = getDb();
        const [courseCheck] = await db.execute('SELECT id FROM courses WHERE id = ?', [courseId]);
        if (!Array.isArray(courseCheck) || courseCheck.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }
        const enrolled = [];
        const alreadyEnrolled = [];
        const notFound = [];

        for (const student of students) {
            const { id, name, email } = student || {};
            if (!id || !name || !email) continue;

            const normalizedEmail = String(email).trim().toLowerCase();

            const [existingRows] = await db.execute(
                'SELECT id, name, email FROM users WHERE id = ? OR LOWER(email) = ?',
                [id, normalizedEmail]
            );

            let userId = id;

            if (!existingRows.length) {
                await db.execute(
                    'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
                    [id, name, normalizedEmail, 'password123', 'student']
                );
                try {
                    if (isMySQL) {
                        await db.execute(
                            'UPDATE users SET must_change_password = 1, email_verified = 1, verified = 1 WHERE id = ?',
                            [id]
                        );
                    } else {
                        await db.execute('UPDATE users SET must_change_password = 1 WHERE id = ?', [id]);
                    }
                } catch (e) {
                    console.warn('[admin enroll-csv] must_change_password:', e.message);
                }
            } else {
                userId = existingRows[0].id;
            }

            const [existingEnrollment] = await db.execute(
                'SELECT 1 FROM course_enrollments WHERE course_id = ? AND student_id = ?',
                [courseId, userId]
            );

            if (existingEnrollment.length > 0) {
                alreadyEnrolled.push({ email: normalizedEmail, name });
            } else {
                if (isMySQL) {
                    await db.execute('INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [courseId, userId]);
                } else {
                    await db.execute('INSERT OR IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [courseId, userId]);
                }
                enrolled.push({ email: normalizedEmail, name });
            }
        }

        res.json({ enrolled, notFound, alreadyEnrolled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
