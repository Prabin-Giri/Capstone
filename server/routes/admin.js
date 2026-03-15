const express = require('express');
const router = express.Router();
const { query, getDb, isMySQL } = require('../db');

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

// GET /api/admin/users - List all users (no password)
router.get('/users', async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.execute(
            'SELECT id, name, email, role, verified, created_at FROM users ORDER BY role, name'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
        const result = students.map(s => ({
            ...s,
            courses_enrolled: (enrollByStudent[s.id] || []).length,
            submissions_count: (submitByStudent[s.id] && submitByStudent[s.id].count) || 0,
            graded_count: (submitByStudent[s.id] && submitByStudent[s.id].graded) || 0,
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/faculty - All faculty with verified status
router.get('/faculty', async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.execute(
            `SELECT u.id, u.name, u.email, u.verified, u.created_at,
             (SELECT COUNT(*) FROM courses c WHERE c.instructor_id = u.id) AS course_count
             FROM users u WHERE u.role = 'faculty' ORDER BY u.name`
        );
        res.json(rows);
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

module.exports = router;
