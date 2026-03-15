const express = require('express');
const router = express.Router();
const { query, getDb, isMySQL } = require('../db');

function safeTableName(name) {
    const safe = name.replace(/[^a-zA-Z0-9_]/g, '');
    return safe === name ? safe : null;
}

// ========== Database Explorer ==========

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

// Get table schema and data (columns include COLUMN_KEY, EXTRA for CRUD)
router.get('/tables/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const safeName = safeTableName(tableName);
    if (!safeName) return res.status(400).json({ error: 'Invalid table name' });
    try {
        if (isMySQL) {
            const columns = await query(
                `SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE, COLUMN_KEY, EXTRA 
                 FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? 
                 ORDER BY ORDINAL_POSITION`,
                [safeName]
            );
            const rows = await query(`SELECT * FROM \`${safeName}\` LIMIT 500`);
            res.json({ tableName: safeName, columns, rows });
        } else {
            const columns = await query(`PRAGMA table_info(${safeName})`);
            const rows = await query(`SELECT * FROM ${safeName} LIMIT 500`);
            res.json({ tableName: safeName, columns, rows });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create row - POST /admin/tables/:tableName/rows
router.post('/tables/:tableName/rows', async (req, res) => {
    const safeName = safeTableName(req.params.tableName);
    if (!safeName) return res.status(400).json({ error: 'Invalid table name' });
    const row = req.body && req.body.row;
    if (!row || typeof row !== 'object') return res.status(400).json({ error: 'Body must include { row: { col: value, ... } }' });
    try {
        const columns = await query(
            `SELECT COLUMN_NAME as name, COLUMN_KEY, EXTRA, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
            [safeName]
        );
        const insertCols = [];
        const insertVals = [];
        for (const col of columns) {
            const val = row[col.name];
            if (val === undefined) {
                if ((col.EXTRA || '').toLowerCase().includes('auto_increment')) continue;
                if (col.IS_NULLABLE === 'YES') { insertCols.push(col.name); insertVals.push(null); continue; }
                insertCols.push(col.name); insertVals.push(null);
            } else {
                insertCols.push(col.name);
                insertVals.push(val === '' && col.IS_NULLABLE === 'YES' ? null : val);
            }
        }
        if (insertCols.length === 0) return res.status(400).json({ error: 'No columns to insert' });
        const placeholders = insertCols.map(() => '?').join(', ');
        const colList = insertCols.map(c => `\`${c}\``).join(', ');
        const sql = `INSERT INTO \`${safeName}\` (${colList}) VALUES (${placeholders})`;
        const db = getDb();
        const [result] = await db.execute(sql, insertVals);
        const insertId = result.insertId;
        res.status(201).json({ message: 'Row created', insertId, affectedRows: result.affectedRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update row - PUT /admin/tables/:tableName/rows (body: { primaryKey: { id: "x" }, row: { col: value } })
router.put('/tables/:tableName/rows', async (req, res) => {
    const safeName = safeTableName(req.params.tableName);
    if (!safeName) return res.status(400).json({ error: 'Invalid table name' });
    const { primaryKey, row } = req.body || {};
    if (!primaryKey || typeof primaryKey !== 'object' || !row || typeof row !== 'object')
        return res.status(400).json({ error: 'Body must include { primaryKey: {...}, row: {...} }' });
    try {
        const columns = await query(
            `SELECT COLUMN_NAME as name, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
            [safeName]
        );
        const pkCols = columns.filter(c => (c.COLUMN_KEY || '').toLowerCase() === 'pri').map(c => c.name);
        if (pkCols.length === 0) return res.status(400).json({ error: 'Table has no primary key' });
        const setParts = [];
        const setVals = [];
        for (const col of columns) {
            if (pkCols.includes(col.name)) continue;
            if (!(col.name in row)) continue;
            setParts.push(`\`${col.name}\` = ?`);
            setVals.push(row[col.name] === '' ? null : row[col.name]);
        }
        if (setParts.length === 0) return res.status(400).json({ error: 'No columns to update' });
        const whereParts = pkCols.map(c => `\`${c}\` = ?`);
        const whereVals = pkCols.map(c => primaryKey[c]);
        const sql = `UPDATE \`${safeName}\` SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')}`;
        const db = getDb();
        const [result] = await db.execute(sql, [...setVals, ...whereVals]);
        res.json({ message: 'Row updated', affectedRows: result.affectedRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete row - DELETE /admin/tables/:tableName/rows (body: { primaryKey: { id: "x" } })
router.delete('/tables/:tableName/rows', async (req, res) => {
    const safeName = safeTableName(req.params.tableName);
    if (!safeName) return res.status(400).json({ error: 'Invalid table name' });
    const primaryKey = (req.body && req.body.primaryKey) || req.query.primaryKey;
    const pk = typeof primaryKey === 'string' ? (() => { try { return JSON.parse(primaryKey); } catch { return null; } })() : primaryKey;
    if (!pk || typeof pk !== 'object') return res.status(400).json({ error: 'primaryKey required (object or JSON string)' });
    try {
        const columns = await query(
            `SELECT COLUMN_NAME as name, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
            [safeName]
        );
        const pkCols = columns.filter(c => (c.COLUMN_KEY || '').toLowerCase() === 'pri').map(c => c.name);
        if (pkCols.length === 0) return res.status(400).json({ error: 'Table has no primary key' });
        const whereParts = pkCols.map(c => `\`${c}\` = ?`);
        const whereVals = pkCols.map(c => pk[c]);
        const sql = `DELETE FROM \`${safeName}\` WHERE ${whereParts.join(' AND ')}`;
        const db = getDb();
        const [result] = await db.execute(sql, whereVals);
        res.json({ message: 'Row deleted', affectedRows: result.affectedRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== User / Faculty Management ==========

// List users (filter by role, query, course enrollment, TA for course, instructor)
router.get('/users', async (req, res) => {
    const { role, q, courseId, taCourseId, instructorOnly, noRole } = req.query;
    try {
        let sql = 'SELECT DISTINCT u.id, u.name, u.email, u.role FROM users u';
        const params = [];
        const conditions = [];

        if (courseId) {
            sql += ' INNER JOIN course_enrollments ce ON u.id = ce.student_id AND ce.course_id = ?';
            params.push(courseId);
        }
        if (taCourseId) {
            sql += ' INNER JOIN course_tas ct ON u.id = ct.ta_id AND ct.course_id = ?';
            params.push(taCourseId);
        }
        if (instructorOnly === '1' || instructorOnly === 'true') {
            sql += ' INNER JOIN courses c ON c.instructor_id = u.id';
        }

        sql += ' WHERE 1=1';

        if (noRole === '1' || noRole === 'true') {
            conditions.push('u.role IS NULL');
        } else if (role) {
            conditions.push('u.role = ?');
            params.push(role);
        }
        if (q) {
            conditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.id LIKE ?)');
            const search = `%${q}%`;
            params.push(search, search, search);
        }
        if (conditions.length > 0) {
            sql += ' AND ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY u.name';

        const rows = await query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Promote an existing user to faculty (by email or id)
router.post('/users/promote-faculty', async (req, res) => {
    try {
        const { email, id } = req.body || {};
        if (!email && !id) {
            return res.status(400).json({ error: 'Email or ID is required' });
        }

        let where = '';
        const params = [];
        if (id) {
            where = 'id = ?';
            params.push(id);
        } else {
            where = 'LOWER(email) = ?';
            params.push(String(email).trim().toLowerCase());
        }

        const users = await query(`SELECT id, name, email, role FROM users WHERE ${where} LIMIT 1`, params);
        if (!users || users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        await query('UPDATE users SET role = ? WHERE id = ?', ['faculty', user.id]);

        const updated = await query('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1', [user.id]);
        res.json({ message: 'User promoted to faculty', user: updated[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new faculty account
router.post('/users/create-faculty', async (req, res) => {
    try {
        const { id, name, email, password } = req.body || {};
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const existing = await query('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
        if (existing && existing.length > 0) {
            return res.status(400).json({ error: 'A user with this email already exists' });
        }

        const userId = id || normalizedEmail;
        await query(
            'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
            [userId, name, normalizedEmail, password, 'faculty']
        );

        res.status(201).json({
            message: 'Faculty account created',
            user: { id: userId, name, email: normalizedEmail, role: 'faculty' }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user role (admin only)
router.patch('/users/:userId/role', async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body || {};
    const allowed = ['student', 'faculty', 'ta', 'user', 'admin'];
    if (!role || !allowed.includes(role)) {
        return res.status(400).json({ error: 'Valid role required: student, faculty, ta, user, admin' });
    }
    try {
        const users = await query('SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
        if (!users || users.length === 0) return res.status(404).json({ error: 'User not found' });
        await query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
        const updated = await query('SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
        res.json({ message: 'Role updated', user: updated[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset user password
router.post('/users/:userId/reset-password', async (req, res) => {
    const { userId } = req.params;
    const { password } = req.body || {};
    if (!password || String(password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    try {
        const users = await query('SELECT id FROM users WHERE id = ?', [userId]);
        if (!users || users.length === 0) return res.status(404).json({ error: 'User not found' });
        await query('UPDATE users SET password = ? WHERE id = ?', [password, userId]);
        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== TA Management ==========

// List TAs with their courses
router.get('/tas', async (req, res) => {
    try {
        const rows = await query(`
            SELECT u.id, u.name, u.email, u.role,
                   GROUP_CONCAT(ct.course_id) AS course_ids
            FROM users u
            LEFT JOIN course_tas ct ON u.id = ct.ta_id
            WHERE u.role = 'ta'
            GROUP BY u.id, u.name, u.email, u.role
            ORDER BY u.name
        `);
        const tas = (rows || []).map(r => ({
            id: r.id,
            name: r.name,
            email: r.email,
            role: r.role,
            course_ids: r.course_ids ? r.course_ids.split(',') : []
        }));
        res.json(tas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Promote user to TA (by id or email)
router.post('/tas/promote', async (req, res) => {
    try {
        const { id, email } = req.body || {};
        if (!id && !email) return res.status(400).json({ error: 'User id or email is required' });
        let users = [];
        if (id) users = await query('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
        else users = await query('SELECT id, name, email, role FROM users WHERE LOWER(email) = ?', [String(email).trim().toLowerCase()]);
        if (!users || users.length === 0) return res.status(404).json({ error: 'User not found' });
        const user = users[0];
        await query("UPDATE users SET role = 'ta' WHERE id = ? AND (role IS NULL OR role IN ('user', 'student'))", [user.id]);
        const updated = await query('SELECT id, name, email, role FROM users WHERE id = ?', [user.id]);
        res.json({ message: 'User promoted to TA', user: updated[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Assign TA to course
router.post('/courses/:courseId/tas', async (req, res) => {
    const { courseId } = req.params;
    const { taId } = req.body || {};
    if (!taId) return res.status(400).json({ error: 'taId is required' });
    try {
        const [enrollRows] = await getDb().execute('SELECT 1 FROM course_enrollments WHERE course_id = ? AND student_id = ?', [courseId, taId]);
        if (enrollRows.length > 0) return res.status(400).json({ error: 'Cannot add as TA: this person is already enrolled as a student in this course.' });
        await query('INSERT IGNORE INTO course_tas (course_id, ta_id, permissions) VALUES (?, ?, ?)', [courseId, taId, JSON.stringify({ can_grade: true, can_edit_assignments: true })]);
        res.status(201).json({ message: 'TA assigned to course' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Remove TA from course
router.delete('/courses/:courseId/tas/:taId', async (req, res) => {
    const { courseId, taId } = req.params;
    try {
        const [r] = await getDb().execute('DELETE FROM course_tas WHERE course_id = ? AND ta_id = ?', [courseId, taId]);
        res.json({ message: 'TA removed from course', affectedRows: r.affectedRows || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== Course Oversight ==========

// List all courses (admin)
router.get('/courses', async (req, res) => {
    try {
        const rows = await query(`
            SELECT c.id, c.name, c.term, c.instructor_id, c.is_archived,
                   u.name AS instructor_name, u.email AS instructor_email,
                   (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.course_id = c.id) AS enrollment_count,
                   (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignment_count
            FROM courses c
            LEFT JOIN users u ON c.instructor_id = u.id
            ORDER BY c.is_archived, c.term DESC, c.id
        `);
        res.json(rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reassign course instructor
router.patch('/courses/:courseId/instructor', async (req, res) => {
    const { courseId } = req.params;
    const { instructorId } = req.body || {};
    if (instructorId === undefined) return res.status(400).json({ error: 'instructorId is required (use null to clear)' });
    try {
        const [courses] = await getDb().execute('SELECT id FROM courses WHERE id = ?', [courseId]);
        if (courses.length === 0) return res.status(404).json({ error: 'Course not found' });
        await query('UPDATE courses SET instructor_id = ? WHERE id = ?', [instructorId || null, courseId]);
        res.json({ message: 'Instructor updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Archive/unarchive course (admin)
router.patch('/courses/:courseId/archive', async (req, res) => {
    const { courseId } = req.params;
    const { isArchived } = req.body || {};
    try {
        const [courses] = await getDb().execute('SELECT id FROM courses WHERE id = ?', [courseId]);
        if (courses.length === 0) return res.status(404).json({ error: 'Course not found' });
        await query('UPDATE courses SET is_archived = ? WHERE id = ?', [isArchived ? 1 : 0, courseId]);
        res.json({ message: isArchived ? 'Course archived' : 'Course unarchived' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== Reports ==========

router.get('/reports/summary', async (req, res) => {
    try {
        const userCounts = await query('SELECT role, COUNT(*) AS count FROM users WHERE role IS NOT NULL GROUP BY role');
        const courseStats = await query(`
            SELECT COUNT(*) AS total, SUM(CASE WHEN is_archived = 1 THEN 1 ELSE 0 END) AS archived FROM courses
        `);
        const assignmentCount = await query('SELECT COUNT(*) AS count FROM assignments');
        const submissionCount = await query('SELECT COUNT(*) AS count FROM submissions');
        const recentSignups = await query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 10');
        const recentSubmissions = await query(`
            SELECT s.id, s.student_id, s.assignment_id, s.submitted_at, a.title AS assignment_title
            FROM submissions s JOIN assignments a ON s.assignment_id = a.id ORDER BY s.submitted_at DESC LIMIT 15
        `);
        const cr = (courseStats && courseStats[0]) || {};
        res.json({
            usersByRole: (userCounts || []).reduce((acc, r) => { acc[r.role] = Number(r.count); return acc; }, {}),
            totalUsers: (userCounts || []).reduce((sum, r) => sum + Number(r.count), 0),
            courses: { total: Number(cr.total) || 0, archived: Number(cr.archived) || 0 },
            assignments: Number((assignmentCount && assignmentCount[0] && assignmentCount[0].count) || 0),
            submissions: Number((submissionCount && submissionCount[0] && submissionCount[0].count) || 0),
            recentSignups: recentSignups || [],
            recentSubmissions: recentSubmissions || []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== Bulk ==========

// Bulk import users (CSV-like: array of { id?, name, email, password?, role? })
router.post('/users/bulk-import', async (req, res) => {
    const { users: usersList } = req.body || {};
    if (!Array.isArray(usersList) || usersList.length === 0) {
        return res.status(400).json({ error: 'Body must include { users: [{ name, email, ... }] }' });
    }
    const db = getDb();
    const created = [];
    const skipped = [];
    const errors = [];
    for (const u of usersList) {
        const name = u.name && String(u.name).trim();
        const email = u.email && String(u.email).trim().toLowerCase();
        if (!name || !email) {
            errors.push({ email: email || u.email, error: 'Missing name or email' });
            continue;
        }
        try {
            const [existing] = await db.execute('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
            if (existing.length > 0) {
                skipped.push({ email, reason: 'Already exists' });
                continue;
            }
            const id = u.id || email;
            const password = u.password || 'password123';
            const role = ['student', 'faculty', 'ta', 'user', 'admin'].includes(u.role) ? u.role : null;
            await db.execute(
                'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
                [id, name, email, password, role]
            );
            created.push({ id, name, email, role });
        } catch (e) {
            errors.push({ email, error: e.message });
        }
    }
    res.status(201).json({ created, skipped, errors });
});

// Bulk update roles (body: { userIds: string[], role: string })
router.post('/users/bulk-role', async (req, res) => {
    const { userIds, role } = req.body || {};
    if (!Array.isArray(userIds) || userIds.length === 0 || !role) {
        return res.status(400).json({ error: 'Body must include { userIds: string[], role: string }' });
    }
    const allowed = ['student', 'faculty', 'ta', 'user'];
    if (!allowed.includes(role)) return res.status(400).json({ error: 'Role must be student, faculty, ta, or user' });
    const db = getDb();
    let updated = 0;
    for (const userId of userIds) {
        const [r] = await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
        updated += r.affectedRows || 0;
    }
    res.json({ message: `Updated ${updated} user(s) to role: ${role}`, updated });
});

module.exports = router;
