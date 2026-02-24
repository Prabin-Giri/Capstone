const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne } = require('../db');

// GET /api/courses - Get courses (filtered by instructor for faculty, by enrollment for students)
router.get('/', async (req, res, next) => {
    const { instructorId, studentId } = req.query;
    try {
        const db = getDb();
        let result;
        if (instructorId) {
            result = await db.execute('SELECT * FROM courses WHERE instructor_id = ? ORDER BY id', [instructorId]);
        } else if (studentId) {
            result = await db.execute(`
                SELECT c.* FROM courses c
                JOIN course_enrollments ce ON c.id = ce.course_id
                WHERE ce.student_id = ?
                ORDER BY c.id
            `, [studentId]);
        } else {
            result = await db.execute('SELECT * FROM courses ORDER BY id');
        }
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id - Get single course
router.get('/:id', async (req, res, next) => {
    try {
        const db = getDb();
        const result = await db.execute('SELECT * FROM courses WHERE id = ?', [req.params.id]);
        const course = queryOne(result);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        res.json(course);
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/assignments - Get assignments for a course
router.get('/:id/assignments', async (req, res, next) => {
    try {
        const db = getDb();
        const result = await db.execute('SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date', [req.params.id]);
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/documents - Get course documents
router.get('/:id/documents', async (req, res, next) => {
    try {
        const db = getDb();
        const result = await db.execute('SELECT syllabus_path, schedule_path FROM course_documents WHERE course_id = ?', [req.params.id]);
        const doc = queryOne(result);
        if (!doc) {
            // Check if course exists
            const [course] = await db.execute('SELECT id FROM courses WHERE id = ?', [req.params.id]);
            if (course.length === 0) return res.status(404).json({ error: 'Course not found' });
            return res.json({ syllabus_path: null, schedule_path: null });
        }
        res.json(doc);
    } catch (err) {
        next(err);
    }
});

// POST /api/courses - Create a new course
router.post('/', async (req, res, next) => {
    try {
        const { id, name, term, instructor_id } = req.body;
        if (!id || !name || !term) {
            return res.status(400).json({ error: 'Missing required fields: id, name, term' });
        }

        const db = getDb();
        await db.execute('INSERT INTO courses (id, name, term, instructor_id) VALUES (?, ?, ?, ?)', [id, name, term, instructor_id || null]);

        res.status(201).json({ id, name, term, instructor_id });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Course ID already exists' });
        }
        next(err);
    }
});

// PATCH /api/courses/:id - Update course details
router.patch('/:id', async (req, res, next) => {
    try {
        const { name, term, is_archived } = req.body;
        const db = getDb();

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

        params.push(req.params.id);
        const sql = `UPDATE courses SET ${updates.join(', ')} WHERE id = ?`;
        await db.execute(sql, params);

        res.json({ message: 'Course updated successfully' });
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/grades - Get course grades as JSON (for Gradebook UI)
router.get('/:id/grades', async (req, res, next) => {
    try {
        const db = getDb();
        const courseId = req.params.id;

        // 1. Get course info
        const [courseRows] = await db.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
        const course = courseRows[0];
        if (!course) return res.status(404).json({ error: 'Course not found' });

        // 2. Get all assignments for this course
        const [assignments] = await db.execute('SELECT id, title, points, due_date FROM assignments WHERE course_id = ? ORDER BY due_date', [courseId]);

        // 3. Get all students 
        const [students] = await db.execute("SELECT id, name, email FROM users WHERE role = 'student' ORDER BY name");

        // 4. Get all submissions for these assignments
        const [submissions] = await db.execute(`
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
router.get('/:id/grades/export', async (req, res, next) => {
    try {
        const db = getDb();
        const courseId = req.params.id;

        // 1. Get course info
        const [courseRows] = await db.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
        const course = courseRows[0];
        if (!course) return res.status(404).json({ error: 'Course not found' });

        // 2. Get all assignments for this course
        const [assignments] = await db.execute('SELECT id, title FROM assignments WHERE course_id = ? ORDER BY due_date', [courseId]);

        // 3. Get all students
        const [students] = await db.execute("SELECT id, name FROM users WHERE role = 'student' ORDER BY name");

        // 4. Get all submissions for these assignments
        const [submissions] = await db.execute(`
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
        const dataRows = students.map(student => {
            const studentGrades = assignments.map(a => {
                const grade = gradeMap[student.id]?.[a.id];
                return grade !== undefined && grade !== null ? grade : '';
            });
            return [student.name, student.id, ...studentGrades];
        });

        const csvContent = [
            headers.join(','),
            ...dataRows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=grades_${courseId}.csv`);
        res.send(csvContent);
    } catch (err) {
        next(err);
    }
});

// POST /api/courses/:id/enroll-csv - Bulk enroll students by email list
router.post('/:id/enroll-csv', async (req, res, next) => {
    const { emails } = req.body;
    const courseId = req.params.id;

    if (!Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ error: 'emails array is required' });
    }

    try {
        const db = getDb();
        const enrolled = [];
        const notFound = [];
        const alreadyEnrolled = [];

        for (const rawEmail of emails) {
            const email = rawEmail.trim().toLowerCase();
            if (!email) continue;

            // Look up user by email
            const [userRows] = await db.execute('SELECT id, name, email FROM users WHERE LOWER(email) = ?', [email]);
            if (userRows.length === 0) {
                notFound.push(email);
                continue;
            }

            const user = userRows[0];

            // Check if already enrolled
            const [existing] = await db.execute(
                'SELECT 1 FROM course_enrollments WHERE course_id = ? AND student_id = ?',
                [courseId, user.id]
            );

            if (existing.length > 0) {
                alreadyEnrolled.push({ email, name: user.name });
            } else {
                await db.execute(
                    'INSERT INTO course_enrollments (course_id, student_id) VALUES (?, ?)',
                    [courseId, user.id]
                );
                enrolled.push({ email, name: user.name });
            }
        }

        res.json({ enrolled, notFound, alreadyEnrolled });
    } catch (err) {
        next(err);
    }
});

// POST /api/courses/:id/enroll - Enroll a student
router.post('/:id/enroll', async (req, res, next) => {
    const { studentId } = req.body;
    const courseId = req.params.id;
    try {
        const db = getDb();
        await db.query('INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [courseId, studentId]);
        res.json({ message: 'Student enrolled successfully' });
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/students - Get enrolled students
router.get('/:id/students', async (req, res, next) => {
    const courseId = req.params.id;
    try {
        const db = getDb();
        const result = await db.execute(`
            SELECT u.id, u.name, u.email 
            FROM users u
            JOIN course_enrollments ce ON u.id = ce.student_id
            WHERE ce.course_id = ?
        `, [courseId]);
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

module.exports = router;
