const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne } = require('../db');

// GET /api/assignments - Get all assignments
router.get('/', (req, res, next) => {
    try {
        const db = getDb();
        const result = db.exec('SELECT * FROM assignments ORDER BY due_date');
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// GET /api/assignments/:id - Get single assignment
router.get('/:id', (req, res, next) => {
    try {
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM assignments WHERE id = ?');
        stmt.bind([req.params.id]);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST /api/assignments - Create new assignment
router.post('/', (req, res, next) => {
    try {
        const { course_id, title, description, due_date, status = 'active', points = 100, language, starter_code_path } = req.body;

        if (!course_id || !title || !due_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Generate a simple ID if not provided (e.g., lowercase title driven or random)
        const id = req.body.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4);

        const db = getDb();
        const stmt = db.prepare('INSERT INTO assignments (id, course_id, title, description, due_date, status, points, language, starter_code_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        stmt.run([id, course_id, title, description, due_date, status, points, language, starter_code_path]);
        stmt.free();

        // Save DB to file
        const { saveDb } = require('../db');
        saveDb();

        res.status(201).json({ id, course_id, title, description, due_date, status, points, language, starter_code_path });
    } catch (err) {
        next(err);
    }
});

// PUT /api/assignments/:id - Update assignment
router.put('/:id', (req, res, next) => {
    try {
        const { title, description, due_date, status, points, language, starter_code_path } = req.body;
        const id = req.params.id;

        const db = getDb();

        // Build dynamic update query
        const updates = [];
        const values = [];
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (due_date !== undefined) { updates.push('due_date = ?'); values.push(due_date); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }
        if (points !== undefined) { updates.push('points = ?'); values.push(points); }
        if (language !== undefined) { updates.push('language = ?'); values.push(language); }
        if (starter_code_path !== undefined) { updates.push('starter_code_path = ?'); values.push(starter_code_path); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        const stmt = db.prepare(`UPDATE assignments SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(values);
        stmt.free();

        // Save DB
        const { saveDb } = require('../db');
        saveDb();

        res.json({ message: 'Assignment updated successfully' });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/assignments/:id - Delete assignment
router.delete('/:id', (req, res, next) => {
    try {
        const db = getDb();
        const stmt = db.prepare('DELETE FROM assignments WHERE id = ?');
        stmt.run([req.params.id]);
        stmt.free();

        // Save DB
        const { saveDb } = require('../db');
        saveDb();

        res.json({ message: 'Assignment deleted successfully' });
    } catch (err) {
        next(err);
    }
});

// GET /api/assignments/:id/grades/export - Export single assignment grades as CSV
router.get('/:id/grades/export', (req, res, next) => {
    try {
        const db = getDb();
        const assignmentId = req.params.id;

        // 1. Get assignment info
        const assignmentResult = db.exec('SELECT * FROM assignments WHERE id = ?', [assignmentId]);
        const assignment = queryOne(assignmentResult);
        if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

        // 2. Get course info for context
        const courseResult = db.exec('SELECT id FROM courses WHERE id = ?', [assignment.course_id]);
        const course = queryOne(courseResult);

        // 3. Get all students
        const studentsResult = db.exec("SELECT id, name FROM users WHERE role = 'student' ORDER BY name");
        const students = queryToObjects(studentsResult);

        // 4. Get submissions for this specific assignment
        const submissionsResult = db.exec(`
            SELECT student_id, grade 
            FROM submissions 
            WHERE assignment_id = ?
        `, [assignmentId]);
        const submissions = queryToObjects(submissionsResult);

        // 5. Create a map for quick lookup
        const gradeMap = {};
        submissions.forEach(s => {
            gradeMap[s.student_id] = s.grade;
        });

        // 6. Generate CSV
        const headers = ['Student Name', 'Student ID', `Grade (${assignment.title})`];
        const rows = students.map(student => {
            const grade = gradeMap[student.id];
            return [student.name, student.id, grade !== undefined && grade !== null ? grade : ''];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const filename = `${course?.id || 'Course'}_${assignment.title.replace(/[^a-z0-9]/gi, '_')}_Grades.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
