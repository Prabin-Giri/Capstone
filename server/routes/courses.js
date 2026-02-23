const express = require('express');
const router = express.Router();
const { query, run, queryOne, saveDb } = require('../db');

// GET /api/courses
router.get('/', async (req, res, next) => {
    try {
        const rows = await query('SELECT * FROM courses ORDER BY id');
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/documents (before /:id)
router.get('/:id/documents', async (req, res, next) => {
    try {
        const row = await queryOne('SELECT syllabus_path, schedule_path FROM course_documents WHERE course_id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Course not found' });
        res.json(row);
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/grades/export (before /:id)
router.get('/:id/grades/export', async (req, res, next) => {
    try {
        const courseId = req.params.id;
        const course = await queryOne('SELECT * FROM courses WHERE id = ?', [courseId]);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const assignments = await query('SELECT id, title FROM assignments WHERE course_id = ? ORDER BY due_date', [courseId]);
        const students = await query("SELECT id, name FROM users WHERE role = 'student' ORDER BY name");
        const submissions = await query(`
            SELECT s.student_id, s.assignment_id, s.grade
            FROM submissions s
            JOIN assignments a ON s.assignment_id = a.id
            WHERE a.course_id = ?
        `, [courseId]);
        const gradeMap = {};
        submissions.forEach(s => {
            if (!gradeMap[s.student_id]) gradeMap[s.student_id] = {};
            gradeMap[s.student_id][s.assignment_id] = s.grade;
        });
        const headers = ['Student Name', 'Student ID', ...assignments.map(a => a.title)];
        const rows = students.map(student => {
            const studentGrades = assignments.map(a => {
                const grade = gradeMap[student.id]?.[a.id];
                return grade !== undefined && grade !== null ? grade : '';
            });
            return [student.name, student.id, ...studentGrades];
        });
        const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=grades_${courseId}.csv`);
        res.send(csvContent);
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/assignments (before /:id)
router.get('/:id/assignments', async (req, res, next) => {
    try {
        const rows = await query('SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date', [req.params.id]);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id
router.get('/:id', async (req, res, next) => {
    try {
        const row = await queryOne('SELECT * FROM courses WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Course not found' });
        res.json(row);
    } catch (err) {
        next(err);
    }
});

// POST /api/courses
router.post('/', async (req, res, next) => {
    try {
        const { id, name, term } = req.body;
        if (!id || !name || !term) return res.status(400).json({ error: 'Missing required fields: id, name, term' });
        await run('INSERT INTO courses (id, name, term) VALUES (?, ?, ?)', [id, name, term]);
        await saveDb();
        res.status(201).json({ id, name, term });
    } catch (err) {
        if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('Duplicate entry'))) {
            return res.status(400).json({ error: 'Course ID already exists' });
        }
        next(err);
    }
});

// PATCH /api/courses/:id
router.patch('/:id', async (req, res, next) => {
    try {
        const { name, term, is_archived } = req.body;
        const updates = [];
        const params = [];
        if (name !== undefined) { updates.push('name = ?'); params.push(name); }
        if (term !== undefined) { updates.push('term = ?'); params.push(term); }
        if (is_archived !== undefined) { updates.push('is_archived = ?'); params.push(is_archived ? 1 : 0); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields provided for update' });
        params.push(req.params.id);
        await run(`UPDATE courses SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
        await saveDb();
        res.json({ message: 'Course updated successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
