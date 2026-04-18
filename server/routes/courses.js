const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne, isMySQL } = require('../db');
const { courseOfferingStorageId } = require('../courseOfferingKey');

function coursePathId(req) {
    try {
        return decodeURIComponent(String(req.params.id || '').trim());
    } catch (_) {
        return String(req.params.id || '').trim();
    }
}

// GET /api/courses - Get courses (filtered by instructor for faculty, by enrollment for students, by TA, or combined student+TA)
router.get('/', async (req, res, next) => {
    const { instructorId, studentId, taId } = req.query;
    try {
        const db = getDb();
        const selectFields = `
            c.*,
            (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.course_id = c.id) as student_count,
            (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id AND a.status = 'active') as active_assignment_count
        `;

        if (instructorId) {
            const [result] = await db.execute(`SELECT ${selectFields} FROM courses c WHERE c.instructor_id = ? ORDER BY c.id`, [instructorId]);
            return res.json(queryToObjects(result));
        }

        // Combined: user is both TA and student (same id or different) - return courses from both with my_role
        if (studentId && taId) {
            const [enrolled] = await db.execute(`
                SELECT ${selectFields} FROM courses c
                JOIN course_enrollments ce ON c.id = ce.course_id
                WHERE ce.student_id = ?
                ORDER BY c.id
            `, [studentId]);
            const [taCourses] = await db.execute(`
                SELECT ${selectFields} FROM courses c
                JOIN course_tas ct ON c.id = ct.course_id
                WHERE ct.ta_id = ?
                ORDER BY c.id
            `, [taId]);
            const byId = {};
            queryToObjects(enrolled).forEach(c => {
                byId[c.id] = { ...c, my_role: 'student' };
            });
            queryToObjects(taCourses).forEach(c => {
                if (byId[c.id]) byId[c.id].my_role = 'both';
                else byId[c.id] = { ...c, my_role: 'ta' };
            });
            return res.json(Object.values(byId).sort((a, b) => (a.id || '').localeCompare(b.id || '')));
        }

        if (taId) {
            const [result] = await db.execute(`
                SELECT ${selectFields} FROM courses c
                JOIN course_tas ct ON c.id = ct.course_id
                WHERE ct.ta_id = ?
                ORDER BY c.id
            `, [taId]);
            return res.json(queryToObjects(result));
        }
        if (studentId) {
            const [result] = await db.execute(`
                SELECT ${selectFields} FROM courses c
                JOIN course_enrollments ce ON c.id = ce.course_id
                WHERE ce.student_id = ?
                ORDER BY c.id
            `, [studentId]);
            return res.json(queryToObjects(result));
        }

        const [result] = await db.execute(`SELECT ${selectFields} FROM courses c ORDER BY c.id`);
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
            u.name AS instructor_name, 
            u.email AS instructor_email, 
            u.profile_picture AS instructor_profile_picture,
            (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.course_id = c.id) as student_count,
            (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id AND a.status = 'active') as active_assignment_count
            FROM courses c 
            LEFT JOIN users u ON c.instructor_id = u.id
            WHERE c.id = ?
        `, [coursePathId(req)]);
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
        const courseId = coursePathId(req);
        const sql = `
            SELECT a.*,
                (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submissions_count
            FROM assignments a
            WHERE a.course_id = ?
            ORDER BY a.due_date
        `;
        const [result] = await db.execute(sql, [courseId]);
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/documents - Get course documents
router.get('/:id/documents', async (req, res, next) => {
    try {
        const db = getDb();
        const result = await db.execute('SELECT syllabus_path, schedule_path FROM course_documents WHERE course_id = ?', [coursePathId(req)]);
        const doc = queryOne(result);
        if (!doc) {
            // Check if course exists
            const [course] = await db.execute('SELECT id FROM courses WHERE id = ?', [coursePathId(req)]);
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

        const courseCode = String(id).trim();
        const termStr = String(term).trim();
        let storageId;
        try {
            storageId = courseOfferingStorageId(courseCode, termStr);
        } catch (e) {
            return res.status(400).json({ error: e.message || 'Invalid course code' });
        }

        const db = getDb();
        const [dup] = await db.execute(
            'SELECT id FROM courses WHERE course_code = ? AND term = ?',
            [courseCode, termStr]
        );
        if (dup.length > 0) {
            return res.status(400).json({ error: 'A course with this ID already exists in this term.' });
        }

        await db.execute(
            'INSERT INTO courses (id, course_code, name, term, instructor_id) VALUES (?, ?, ?, ?, ?)',
            [storageId, courseCode, name, termStr, instructor_id || null]
        );

        res.status(201).json({ id: storageId, course_code: courseCode, name, term: termStr, instructor_id });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' || err.code === 'SQLITE_CONSTRAINT' || /unique|duplicate/i.test(String(err.message || ''))) {
            return res.status(400).json({ error: 'A course with this ID already exists in this term.' });
        }
        next(err);
    }
});

// PATCH /api/courses/:id - Update course details
router.patch('/:id', async (req, res, next) => {
    try {
        const { name, term, is_archived } = req.body;
        const db = getDb();
        const cid = coursePathId(req);

        const [curRows] = await db.execute('SELECT term FROM courses WHERE id = ?', [cid]);
        if (!curRows.length) {
            return res.status(404).json({ error: 'Course not found' });
        }
        if (term !== undefined && String(term).trim() !== String(curRows[0].term)) {
            return res.status(400).json({
                error: 'Changing the term is not supported. Archive this course and create a new offering for the other term.',
            });
        }

        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (is_archived !== undefined) {
            updates.push('is_archived = ?');
            params.push(is_archived ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields provided for update' });
        }

        params.push(cid);
        const sql = `UPDATE courses SET ${updates.join(', ')} WHERE id = ?`;
        await db.execute(sql, params);

        res.json({ message: 'Course updated successfully' });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/courses/:id - Delete a course
router.delete('/:id', async (req, res, next) => {
    try {
        const db = getDb();
        await db.execute('DELETE FROM courses WHERE id = ?', [coursePathId(req)]);
        res.json({ message: 'Course deleted successfully' });
    } catch (err) {
        next(err);
    }
});

// GET /api/courses/:id/grades - Get course grades as JSON (for Gradebook UI)
router.get('/:id/grades', async (req, res, next) => {
    try {
        const db = getDb();
        const courseId = coursePathId(req);

        // 1. Get course info
        const [courseRows] = await db.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
        const course = courseRows[0];
        if (!course) return res.status(404).json({ error: 'Course not found' });

        // 2. Get all assignments for this course
        const [assignments] = await db.execute('SELECT id, title, points, due_date FROM assignments WHERE course_id = ? ORDER BY due_date', [courseId]);

        // 3. Get only students enrolled in this course
        const [students] = await db.execute(`
            SELECT u.id, u.name, u.email, u.profile_picture FROM users u
            JOIN course_enrollments ce ON u.id = ce.student_id AND ce.course_id = ?
            WHERE u.role = 'student'
            ORDER BY u.name
        `, [courseId]);

        // 4. Get all submissions for these assignments (grade may be null if ungraded)
        const [submissions] = await db.execute(`
            SELECT s.student_id, s.assignment_id, s.grade 
            FROM submissions s
            JOIN assignments a ON s.assignment_id = a.id
            WHERE a.course_id = ?
        `, [courseId]);

        const gradeMap = {};
        const submittedMap = {};
        submissions.forEach(s => {
            if (!gradeMap[s.student_id]) gradeMap[s.student_id] = {};
            gradeMap[s.student_id][s.assignment_id] = s.grade;
            if (!submittedMap[s.student_id]) submittedMap[s.student_id] = {};
            submittedMap[s.student_id][s.assignment_id] = true;
        });

        const studentGrades = students.map(student => {
            const grades = {};
            const submitted = {};
            assignments.forEach(a => {
                grades[a.id] = gradeMap[student.id]?.[a.id] ?? null;
                submitted[a.id] = !!submittedMap[student.id]?.[a.id];
            });
            return {
                ...student,
                grades,
                submitted
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

// GET /api/courses/:id/grades/export - Export course grades (CSV or Excel)
// Query: format=csv|excel, type=assignments|final|student, studentId=<id>, assignmentIds=id1,id2 (optional)
router.get('/:id/grades/export', async (req, res, next) => {
    try {
        const db = getDb();
        const courseId = coursePathId(req);
        const format = (req.query.format || 'csv').toLowerCase() === 'excel' ? 'excel' : 'csv';
        const type = (req.query.type || 'assignments').toLowerCase();
        const studentId = req.query.studentId ? String(req.query.studentId).trim() : null;
        const assignmentIdsParam = req.query.assignmentIds ? String(req.query.assignmentIds).trim() : '';
        const filterAssignmentIds = assignmentIdsParam ? assignmentIdsParam.split(',').map(s => s.trim()).filter(Boolean) : null;

        const [courseRows] = await db.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
        const course = courseRows[0];
        if (!course) return res.status(404).json({ error: 'Course not found' });

        let [assignments] = await db.execute('SELECT id, title FROM assignments WHERE course_id = ? ORDER BY due_date', [courseId]);
        if (filterAssignmentIds && filterAssignmentIds.length > 0) {
            const idSet = new Set(filterAssignmentIds);
            assignments = assignments.filter(a => idSet.has(a.id));
        }
        const [students] = await db.execute(`
            SELECT u.id, u.name FROM users u
            JOIN course_enrollments ce ON u.id = ce.student_id AND ce.course_id = ?
            WHERE u.role = 'student'
            ORDER BY u.name
        `, [courseId]);

        const [submissions] = await db.execute(`
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

        let headers;
        let dataRows;

        if (type === 'student') {
            if (!studentId) return res.status(400).json({ error: 'studentId is required when type=student' });
            const student = students.find(s => s.id === studentId);
            if (!student) return res.status(404).json({ error: 'Student not found or not enrolled' });
            headers = ['Assignment', 'Grade'];
            dataRows = assignments.map(a => {
                const g = gradeMap[student.id]?.[a.id];
                return [a.title, g !== undefined && g !== null ? g : ''];
            });
        } else if (type === 'final') {
            headers = ['Student ID', 'Student Name', 'Final Grade'];
            dataRows = students.map(student => {
                const grades = assignments.map(a => gradeMap[student.id]?.[a.id]).filter(g => g !== undefined && g !== null && g !== '');
                const finalGrade = grades.length ? (grades.reduce((a, b) => a + Number(b), 0) / grades.length).toFixed(2) : '';
                return [student.id, student.name, finalGrade];
            });
        } else {
            headers = ['Student Name', 'Student ID', ...assignments.map(a => a.title)];
            dataRows = students.map(student => {
                const studentGrades = assignments.map(a => {
                    const grade = gradeMap[student.id]?.[a.id];
                    return grade !== undefined && grade !== null ? grade : '';
                });
                return [student.name, student.id, ...studentGrades];
            });
        }

        const allRows = [headers, ...dataRows];

        if (format === 'excel') {
            const XLSX = require('xlsx');
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(allRows);
            XLSX.utils.book_append_sheet(wb, ws, type === 'student' ? 'Student' : type === 'final' ? 'Final Grades' : 'Grades');
            const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            const ext = type === 'student' ? `_${studentId}` : '';
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=grades_${courseId}${ext}.xlsx`);
            res.send(buf);
        } else {
            const csvContent = [
                headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','),
                ...dataRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');
            const ext = type === 'student' ? `_${studentId}` : '';
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=grades_${courseId}${ext}.csv`);
            res.send(csvContent);
        }
    } catch (err) {
        next(err);
    }
});

// POST /api/courses/:id/enroll-csv - Bulk enroll students by CSV data (auto-creates accounts if needed)
router.post('/:id/enroll-csv', async (req, res, next) => {
    const { students } = req.body;
    const courseId = coursePathId(req);

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
                    console.warn('[enroll-csv] could not flag must_change_password:', e.message);
                }
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
    const courseId = coursePathId(req);
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
    const courseId = coursePathId(req);

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
    const courseId = coursePathId(req);
    try {
        const db = getDb();
        const result = await db.execute(`
            SELECT u.id, u.name, u.email, u.profile_picture, ct.permissions
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
    const courseId = coursePathId(req);
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
        // Also remove from course_tas if they were assigned as a TA
        await db.execute(
            'DELETE FROM course_tas WHERE course_id = ? AND ta_id = ?',
            [courseId, studentId]
        );
        res.json({ message: 'Student unenrolled successfully' });
    } catch (err) {
        next(err);
    }
});

// ── Saved rubrics (named templates per course, for reuse on assignments) ──

// GET /api/courses/:id/saved-rubrics
router.get('/:id/saved-rubrics', async (req, res, next) => {
    const courseId = coursePathId(req);
    try {
        const db = getDb();
        const course = queryOne(await db.execute('SELECT id FROM courses WHERE id = ?', [courseId]));
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        const timeField = isMySQL ? `DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ')` : 'updated_at';
        const result = await db.execute(
            `SELECT id, name, rubric_json, ${timeField} AS updated_at FROM saved_rubrics WHERE course_id = ? ORDER BY name ASC`,
            [courseId]
        );
        const rows = queryToObjects(result);
        const out = rows.map((row) => {
            let rubric = null;
            try {
                rubric = typeof row.rubric_json === 'string' ? JSON.parse(row.rubric_json) : row.rubric_json;
            } catch (_) {
                rubric = null;
            }
            return { id: row.id, name: row.name, rubric, updated_at: row.updated_at };
        }).filter((row) => row.rubric != null);
        res.json(out);
    } catch (err) {
        next(err);
    }
});

// POST /api/courses/:id/saved-rubrics — body: { name: string, rubric: object }
router.post('/:id/saved-rubrics', async (req, res, next) => {
    const courseId = coursePathId(req);
    const { name, rubric } = req.body || {};
    try {
        const db = getDb();
        const course = queryOne(await db.execute('SELECT id FROM courses WHERE id = ?', [courseId]));
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        const nameTrim = String(name || '').trim();
        if (!nameTrim || nameTrim.length > 255) {
            return res.status(400).json({ error: 'Name is required (max 255 characters).' });
        }
        if (!rubric || typeof rubric !== 'object' || Array.isArray(rubric)) {
            return res.status(400).json({ error: 'Rubric object is required.' });
        }
        const jsonStr = JSON.stringify(rubric);
        const existing = queryOne(await db.execute(
            'SELECT id FROM saved_rubrics WHERE course_id = ? AND name = ?',
            [courseId, nameTrim]
        ));
        if (existing) {
            if (isMySQL) {
                await db.execute(
                    'UPDATE saved_rubrics SET rubric_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [jsonStr, existing.id]
                );
            } else {
                await db.execute(
                    "UPDATE saved_rubrics SET rubric_json = ?, updated_at = datetime('now') WHERE id = ?",
                    [jsonStr, existing.id]
                );
            }
            return res.json({ id: existing.id, message: 'Saved rubric updated.', updated: true });
        }
        const id = `sr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await db.execute(
            'INSERT INTO saved_rubrics (id, course_id, name, rubric_json) VALUES (?, ?, ?, ?)',
            [id, courseId, nameTrim, jsonStr]
        );
        res.status(201).json({ id, message: 'Saved rubric created.', updated: false });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/courses/:id/saved-rubrics/:savedId
router.delete('/:id/saved-rubrics/:savedId', async (req, res, next) => {
    const courseId = coursePathId(req);
    let savedId = String(req.params.savedId || '').trim();
    try {
        savedId = decodeURIComponent(savedId);
    } catch (_) { /* keep raw */ }
    try {
        const db = getDb();
        const [del] = await db.execute(
            'DELETE FROM saved_rubrics WHERE id = ? AND course_id = ?',
            [savedId, courseId]
        );
        const affected = del && typeof del.affectedRows === 'number' ? del.affectedRows : 0;
        if (!affected) {
            return res.status(404).json({ error: 'Saved rubric not found.' });
        }
        res.json({ message: 'Saved rubric removed.' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
