const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne } = require('../db');

// GET /api/courses - Get all courses
router.get('/', (req, res, next) => {
    try {
        const db = getDb();
        const result = db.exec('SELECT * FROM courses ORDER BY id');
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id - Get single course
router.get('/:id', (req, res, next) => {
    try {
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM courses WHERE id = ?');
        stmt.bind([req.params.id]);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/assignments - Get assignments for a course
router.get('/:id/assignments', (req, res, next) => {
    try {
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date');
        stmt.bind([req.params.id]);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/documents - Get course documents
router.get('/:id/documents', (req, res, next) => {
    try {
        const db = getDb();
        const stmt = db.prepare('SELECT syllabus_path, schedule_path FROM courses WHERE id = ?');
        stmt.bind([req.params.id]);

        let result = null;
        if (stmt.step()) {
            result = stmt.getAsObject();
        }
        stmt.free();

        if (!result) {
            return res.status(404).json({ error: 'Course not found' });
        }
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// POST /api/courses - Create a new course
router.post('/', (req, res, next) => {
    try {
        const { id, name, term } = req.body;
        if (!id || !name || !term) {
            return res.status(400).json({ error: 'Missing required fields: id, name, term' });
        }

        const db = getDb();
        const stmt = db.prepare('INSERT INTO courses (id, name, term) VALUES (?, ?, ?)');
        stmt.run([id, name, term]);
        stmt.free();

        res.status(201).json({ id, name, term });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Course ID already exists' });
        }
        next(err);
    }
});

// PATCH /api/courses/:id - Update course details
router.patch('/:id', (req, res, next) => {
    try {
        const { name, term, is_archived } = req.body;
        const db = getDb();

        // Build query dynamically based on provided fields
        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (term !== undefined) {
            updates.push('term = ?');
            params.push(term);
        }
        if (is_archived !== undefined) {
            updates.push('is_archived = ?');
            params.push(is_archived ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields provided for update' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(req.params.id);

        const sql = `UPDATE courses SET ${updates.join(', ')} WHERE id = ?`;
        const stmt = db.prepare(sql);
        stmt.run(params);
        stmt.free();

        // Save the database after changes
        const { saveDb } = require('../db');
        saveDb();

        res.json({ message: 'Course updated successfully' });
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/grades - Get course grades as JSON (for Gradebook UI)
router.get('/:id/grades', (req, res, next) => {
    try {
        const db = getDb();
        const courseId = req.params.id;

        // Helper for prepared statements
        const fetchAll = (sql, params) => {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            const rows = [];
            while (stmt.step()) {
                rows.push(stmt.getAsObject());
            }
            stmt.free();
            return rows;
        };

        const fetchOne = (sql, params) => {
            const rows = fetchAll(sql, params);
            return rows.length > 0 ? rows[0] : null;
        };

        // 1. Get course info
        const course = fetchOne('SELECT * FROM courses WHERE id = ?', [courseId]);
        if (!course) return res.status(404).json({ error: 'Course not found' });

        // 2. Get all assignments for this course
        const assignments = fetchAll('SELECT id, title, points, due_date FROM assignments WHERE course_id = ? ORDER BY due_date', [courseId]);

        // 3. Get all students 
        const students = fetchAll("SELECT id, name, email FROM users WHERE role = 'student' ORDER BY name", []);

        // 4. Get all submissions for these assignments
        const submissions = fetchAll(`
            SELECT s.student_id, s.assignment_id, s.grade 
            FROM submissions s
            JOIN assignments a ON s.assignment_id = a.id
            WHERE a.course_id = ?
        `, [courseId]);

        // 5. Create a map for quick lookup
        const gradeMap = {};
        submissions.forEach(s => {
            if (!gradeMap[s.student_id]) gradeMap[s.student_id] = {};
            gradeMap[s.student_id][s.assignment_id] = s.grade;
        });

        // 6. Structure response
        const studentGrades = students.map(student => {
            const grades = {};
            assignments.forEach(a => {
                grades[a.id] = gradeMap[student.id]?.[a.id] ?? null;
            });
            return {
                ...student,
                grades
            };
        });

        res.json({
            course,
            assignments,
            students: studentGrades
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/grades/export - Export course grades as CSV
router.get('/:id/grades/export', (req, res, next) => {
    try {
        const db = getDb();
        const courseId = req.params.id;

        // Re-using helper logic (inline for isolation)
        const fetchAll = (sql, params) => {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            const rows = [];
            while (stmt.step()) {
                rows.push(stmt.getAsObject());
            }
            stmt.free();
            return rows;
        };

        // 1. Get course info
        const courseRows = fetchAll('SELECT * FROM courses WHERE id = ?', [courseId]);
        const course = courseRows.length > 0 ? courseRows[0] : null;

        if (!course) return res.status(404).json({ error: 'Course not found' });

        // 2. Get all assignments for this course
        const assignments = fetchAll('SELECT id, title FROM assignments WHERE course_id = ? ORDER BY due_date', [courseId]);

        // 3. Get all students
        const students = fetchAll("SELECT id, name FROM users WHERE role = 'student' ORDER BY name", []);

        // 4. Get all submissions for these assignments
        const submissions = fetchAll(`
            SELECT s.student_id, s.assignment_id, s.grade 
            FROM submissions s
            JOIN assignments a ON s.assignment_id = a.id
            WHERE a.course_id = ?
        `, [courseId]);

        // 5. Create a map for quick lookup
        const gradeMap = {};
        submissions.forEach(s => {
            if (!gradeMap[s.student_id]) gradeMap[s.student_id] = {};
            gradeMap[s.student_id][s.assignment_id] = s.grade;
        });

        // 6. Generate CSV
        const headers = ['Student Name', 'Student ID', ...assignments.map(a => a.title)];
        const rows = students.map(student => {
            const studentGrades = assignments.map(a => {
                const grade = gradeMap[student.id]?.[a.id];
                return grade !== undefined && grade !== null ? grade : '';
            });
            return [student.name, student.id, ...studentGrades];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=grades_${courseId}.csv`);
        res.send(csvContent);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
