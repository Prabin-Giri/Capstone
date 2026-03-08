const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne } = require('../db');

// GET /api/courses - Get courses (filtered by instructor for faculty, by enrollment for students)
router.get('/', async (req, res, next) => {
    const { instructorId, studentId, taId } = req.query;
    try {
        const db = getDb();
        let result;
        const selectFields = `
            c.*,
            (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.course_id = c.id) as student_count,
            (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id AND a.status = 'active') as active_assignment_count
        `;

        if (instructorId) {
            result = await db.execute(`SELECT ${selectFields} FROM courses c WHERE c.instructor_id = ? ORDER BY c.id`, [instructorId]);
        } else if (taId) {
            result = await db.execute(`
                SELECT ${selectFields} FROM courses c
                JOIN course_tas ct ON c.id = ct.course_id
                WHERE ct.ta_id = ?
                ORDER BY c.id
            `, [taId]);
        } else if (studentId) {
            result = await db.execute(`
                SELECT ${selectFields} FROM courses c
                JOIN course_enrollments ce ON c.id = ce.course_id
                WHERE ce.student_id = ?
                ORDER BY c.id
            `, [studentId]);
        } else {
            result = await db.execute(`SELECT ${selectFields} FROM courses c ORDER BY c.id`);
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
        const result = await db.execute(`
            SELECT c.*,
            (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.course_id = c.id) as student_count,
            (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id AND a.status = 'active') as active_assignment_count
            FROM courses c WHERE c.id = ?
        `, [req.params.id]);
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

// POST /api/courses/:id/enroll-csv - Bulk enroll students by CSV data (auto-creates accounts if needed)
router.post('/:id/enroll-csv', async (req, res, next) => {
    const { students } = req.body;
    const courseId = req.params.id;

    if (!Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'students array is required' });
    }

    try {
        const db = getDb();
        const enrolled = [];
        const alreadyEnrolled = [];
        const notFound = [];

        for (const student of students) {
            const { id, name, email } = student;
            if (!id || !name || !email) continue;

            const normalizedEmail = email.trim().toLowerCase();

            // Check if user already exists by id or email
            const [existingRows] = await db.execute(
                'SELECT id, name, email FROM users WHERE id = ? OR LOWER(email) = ?',
                [id, normalizedEmail]
            );

            let userId = id;

            if (existingRows.length === 0) {
                // Auto-create the account with the specified id, name, email, role=student, password=password123
                await db.execute(
                    'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
                    [id, name, normalizedEmail, 'password123', 'student']
                );
            } else {
                // Use the existing user's id
                userId = existingRows[0].id;
            }

            // Check if already enrolled in this course
            const [existingEnrollment] = await db.execute(
                'SELECT 1 FROM course_enrollments WHERE course_id = ? AND student_id = ?',
                [courseId, userId]
            );

            if (existingEnrollment.length > 0) {
                alreadyEnrolled.push({ email: normalizedEmail, name });
            } else {
                await db.execute(
                    'INSERT INTO course_enrollments (course_id, student_id) VALUES (?, ?)',
                    [courseId, userId]
                );
                enrolled.push({ email: normalizedEmail, name });
            }
        }

        res.json({ enrolled, notFound, alreadyEnrolled });
    } catch (err) {
        next(err);
    }
});

// POST /api/courses/:id/enroll - Enroll a student
router.post('/:id/enroll', async (req, res, next) => {
    const { studentId } = req.query; // Allow fallback explicitly
    const actualId = req.body.studentId || studentId;
    const courseId = req.params.id;
    try {
        const db = getDb();
        await db.execute('INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [courseId, actualId]);
        res.json({ message: 'Student enrolled successfully' });
    } catch (err) {
        next(err);
    }
});

// POST /api/courses/:id/invite-ta - Invite a TA by email or ID
router.post('/:id/invite-ta', async (req, res, next) => {
    const { email, taId } = req.body;
    const courseId = req.params.id;

    if (!email && !taId) {
        return res.status(400).json({ error: 'TA email or ID is required' });
    }

    try {
        const db = getDb();
        let finalTaId = taId;

        if (email) {
            const [userRows] = await db.execute('SELECT id, role FROM users WHERE LOWER(email) = ?', [email.trim().toLowerCase()]);
            if (userRows.length === 0) {
                return res.status(404).json({ error: 'User not found with this email' });
            }
            if (userRows[0].role !== 'ta' && userRows[0].role !== 'student') {
                return res.status(400).json({ error: 'User exists but is not a student or Teaching Assistant' });
            }
            finalTaId = userRows[0].id;
        }

        // Insert TA dynamically using JSON privileges
        await db.execute(
            'INSERT IGNORE INTO course_tas (course_id, ta_id, permissions) VALUES (?, ?, ?)',
            [courseId, finalTaId, JSON.stringify({ can_grade: true, can_edit_assignments: true })]
        );

        res.json({ message: 'TA added successfully', taId: finalTaId });
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/tas - Get invited TAs
router.get('/:id/tas', async (req, res, next) => {
    const courseId = req.params.id;
    try {
        const db = getDb();
        const result = await db.execute(`
            SELECT u.id, u.name, u.email, ct.permissions
            FROM users u
            JOIN course_tas ct ON u.id = ct.ta_id
            WHERE ct.course_id = ?
        `, [courseId]);
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// DELETE /api/courses/:id/tas/:taId - Remove a TA
router.delete('/:id/tas/:taId', async (req, res, next) => {
    const { id: courseId, taId } = req.params;
    try {
        const db = getDb();
        await db.execute('DELETE FROM course_tas WHERE course_id = ? AND ta_id = ?', [courseId, taId]);
        res.json({ message: 'TA removed successfully' });
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
            SELECT u.id, u.name, u.email, u.profile_picture 
            FROM users u
            JOIN course_enrollments ce ON u.id = ce.student_id
            WHERE ce.course_id = ?
        `, [courseId]);
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// DELETE /api/courses/:id/enroll/:studentId - Unenroll a student
router.delete('/:id/enroll/:studentId', async (req, res, next) => {
    const { id: courseId, studentId } = req.params;
    try {
        const db = getDb();
        await db.execute(
            'DELETE FROM course_enrollments WHERE course_id = ? AND student_id = ?',
            [courseId, studentId]
        );
        res.json({ message: 'Student unenrolled successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
