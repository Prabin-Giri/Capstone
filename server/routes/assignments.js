const express = require('express');
const router = express.Router();
const { query, run, queryOne, saveDb } = require('../db');

// Helper for dynamic status check
const checkStatus = (assignment) => {
    if (assignment.status === 'active') {
        const dueDate = new Date(assignment.due_date);
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of day comparison
        if (dueDate < now) {
            assignment.status = 'late';
        }
    }
    return assignment;
};

// GET /api/assignments
router.get('/', async (req, res, next) => {
    try {
        const rows = await query('SELECT * FROM assignments ORDER BY due_date');
        const assignments = rows.map(checkStatus);
        res.json(assignments);
    } catch (err) {
        next(err);
    }
});

// GET /api/assignments/:id/grades/export (must be before /:id)
router.get('/:id/grades/export', async (req, res, next) => {
    try {
        const assignmentId = req.params.id;
        const assignment = await queryOne('SELECT * FROM assignments WHERE id = ?', [assignmentId]);
        if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
        const course = await queryOne('SELECT id FROM courses WHERE id = ?', [assignment.course_id]);
        const students = await query("SELECT id, name FROM users WHERE role = 'student' ORDER BY name");
        const submissions = await query('SELECT student_id, grade FROM submissions WHERE assignment_id = ?', [assignmentId]);
        const gradeMap = {};
        submissions.forEach(s => { gradeMap[s.student_id] = s.grade; });
        const headers = ['Student Name', 'Student ID', `Grade (${assignment.title})`];
        const rows = students.map(student => {
            const grade = gradeMap[student.id];
            return [student.name, student.id, grade !== undefined && grade !== null ? grade : ''];
        });
        const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
        const filename = `${course?.id || 'Course'}_${assignment.title.replace(/[^a-z0-9]/gi, '_')}_Grades.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
    } catch (err) {
        next(err);
    }
});

// GET /api/assignments/:id
router.get('/:id', async (req, res, next) => {
    try {
        const row = await queryOne('SELECT * FROM assignments WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Assignment not found' });
        res.json(checkStatus(row));
    } catch (err) {
        next(err);
    }
});

// POST /api/assignments
router.post('/', async (req, res, next) => {
    try {
        const { course_id, title, description, due_date, status = 'active', points = 100, language, starter_code_path, style_points_possible = 0, efficiency_points_possible = 0, java_main_class, run_mode = 'program' } = req.body;
        if (!course_id || !title || !due_date) return res.status(400).json({ error: 'Missing required fields' });
        const id = req.body.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4);
        await run(
            'INSERT INTO assignments (id, course_id, title, description, due_date, status, points, language, starter_code_path, style_points_possible, efficiency_points_possible, java_main_class, run_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, course_id, title, description, due_date, status, points, language, starter_code_path, style_points_possible, efficiency_points_possible, java_main_class ?? null, run_mode === 'function' ? 'function' : 'program']
        );
        await saveDb();
        res.status(201).json({ id, course_id, title, description, due_date, status, points, language, starter_code_path, style_points_possible, efficiency_points_possible, java_main_class: java_main_class ?? null, run_mode: run_mode === 'function' ? 'function' : 'program' });
    } catch (err) {
        next(err);
    }
});

// PUT /api/assignments/:id
router.put('/:id', async (req, res, next) => {
    try {
        const { title, description, due_date, status, points, language, starter_code_path, style_points_possible, efficiency_points_possible, java_main_class, run_mode } = req.body;
        const id = req.params.id;
        const updates = [];
        const values = [];
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (due_date !== undefined) { updates.push('due_date = ?'); values.push(due_date); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }
        if (points !== undefined) { updates.push('points = ?'); values.push(points); }
        if (language !== undefined) { updates.push('language = ?'); values.push(language); }
        if (starter_code_path !== undefined) { updates.push('starter_code_path = ?'); values.push(starter_code_path); }
        if (style_points_possible !== undefined) { updates.push('style_points_possible = ?'); values.push(parseFloat(style_points_possible)); }
        if (efficiency_points_possible !== undefined) { updates.push('efficiency_points_possible = ?'); values.push(parseFloat(efficiency_points_possible)); }
        if (java_main_class !== undefined) { updates.push('java_main_class = ?'); values.push(java_main_class === '' ? null : java_main_class); }
        if (run_mode !== undefined) { updates.push('run_mode = ?'); values.push(run_mode === 'function' ? 'function' : 'program'); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(id);
        await run(`UPDATE assignments SET ${updates.join(', ')} WHERE id = ?`, values);
        await saveDb();
        res.json({ message: 'Assignment updated successfully' });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/assignments/:id
router.delete('/:id', async (req, res, next) => {
    try {
        await run('DELETE FROM assignments WHERE id = ?', [req.params.id]);
        await saveDb();
        res.json({ message: 'Assignment deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
