const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { hasAnyRole } = require('../auth');

function actorUserId(req) {
    return String(req.auth?.userId || '').trim();
}

function resolveStudentId(req, candidate) {
    const actorId = actorUserId(req);
    const requested = String(candidate || '').trim();
    if (!actorId) return { error: 'Authentication required', status: 401 };
    if (!requested) return { studentId: actorId };
    if (requested === actorId) return { studentId: actorId };
    if (hasAnyRole(req, 'admin', 'faculty', 'ta')) return { studentId: requested };
    return { error: 'Forbidden', status: 403 };
}

// --- Course Colors ---

// Get course color settings for a student
router.get('/colors', async (req, res) => {
    const { student_id } = req.query;
    const resolved = resolveStudentId(req, student_id);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    const studentId = resolved.studentId;

    try {
        const db = getDb();
        const [rows] = await db.execute('SELECT course_id, color FROM course_settings WHERE student_id = ?', [studentId]);

        // Convert to object map { course_id: color }
        const colors = {};
        rows.forEach(r => colors[r.course_id] = r.color);

        res.json(colors);
    } catch (err) {
        console.error('Error fetching colors:', err);
        res.status(500).json({ error: 'Failed to fetch colors' });
    }
});

// Save course color
router.post('/colors', async (req, res) => {
    const { student_id, course_id, color } = req.body;
    const resolved = resolveStudentId(req, student_id);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    if (!course_id || !color) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const db = getDb();
        // MySQL Upsert
        await db.query(`
            INSERT INTO course_settings (student_id, course_id, color)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE color = VALUES(color)
        `, [resolved.studentId, course_id, color]);

        res.json({ success: true });
    } catch (err) {
        console.error('Error saving color:', err);
        res.status(500).json({ error: 'Failed to save color' });
    }
});

// --- Todos ---

// Get todos for a student
router.get('/todos', async (req, res) => {
    const { student_id } = req.query;
    const resolved = resolveStudentId(req, student_id);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

    try {
        const db = getDb();
        const [todos] = await db.execute('SELECT * FROM todos WHERE student_id = ? ORDER BY due_date ASC', [resolved.studentId]);

        // Convert 1/0 to boolean
        todos.forEach(t => t.completed = !!t.completed);

        res.json(todos);
    } catch (err) {
        console.error('Error fetching todos:', err);
        res.status(500).json({ error: 'Failed to fetch todos' });
    }
});

// Create todo
router.post('/todos', async (req, res) => {
    const { student_id, title, due_date, course_id } = req.body;
    const resolved = resolveStudentId(req, student_id);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    if (!title) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const mysqlDueDate = due_date ? new Date(due_date).toISOString().slice(0, 19).replace('T', ' ') : null;

    try {
        const db = getDb();
        await db.execute(`
            INSERT INTO todos (id, student_id, course_id, title, due_date, completed)
            VALUES (?, ?, ?, ?, ?, 0)
        `, [id, resolved.studentId, course_id || null, title, mysqlDueDate]);

        res.status(201).json({
            id,
            student_id: resolved.studentId,
            course_id: course_id || null,
            title,
            due_date: due_date || null,
            completed: false
        });
    } catch (err) {
        console.error('Error creating todo:', err);
        res.status(500).json({ error: 'Failed to create todo' });
    }
});

// Update todo
router.put('/todos/:id', async (req, res) => {
    const { id } = req.params;
    const { title, due_date, completed, course_id } = req.body;
    const actorId = actorUserId(req);
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });

    try {
        const db = getDb();
        const [ownerRows] = await db.execute('SELECT student_id FROM todos WHERE id = ?', [id]);
        if (!ownerRows.length) return res.status(404).json({ error: 'Todo not found' });
        const ownerId = String(ownerRows[0].student_id || '');
        if (ownerId !== actorId && !hasAnyRole(req, 'admin', 'faculty', 'ta')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const updates = [];
        const values = [];

        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (due_date !== undefined) {
            const mysqlDueDate = due_date ? new Date(due_date).toISOString().slice(0, 19).replace('T', ' ') : null;
            updates.push('due_date = ?');
            values.push(mysqlDueDate);
        }
        if (completed !== undefined) { updates.push('completed = ?'); values.push(completed ? 1 : 0); }
        if (course_id !== undefined) { updates.push('course_id = ?'); values.push(course_id); }

        if (updates.length === 0) return res.json({ success: true });

        values.push(id);
        const sql = `UPDATE todos SET ${updates.join(', ')} WHERE id = ?`;

        await db.execute(sql, values);

        const [rows] = await db.execute('SELECT * FROM todos WHERE id = ?', [id]);
        const todo = rows[0];

        if (todo) todo.completed = !!todo.completed;

        res.json(todo);
    } catch (err) {
        console.error('Error updating todo:', err);
        res.status(500).json({ error: 'Failed to update todo' });
    }
});

// Delete todo
router.delete('/todos/:id', async (req, res) => {
    const { id } = req.params;
    const actorId = actorUserId(req);
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });

    try {
        const db = getDb();
        const [ownerRows] = await db.execute('SELECT student_id FROM todos WHERE id = ?', [id]);
        if (!ownerRows.length) return res.status(404).json({ error: 'Todo not found' });
        const ownerId = String(ownerRows[0].student_id || '');
        if (ownerId !== actorId && !hasAnyRole(req, 'admin', 'faculty', 'ta')) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        await db.execute('DELETE FROM todos WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting todo:', err);
        res.status(500).json({ error: 'Failed to delete todo' });
    }
});

module.exports = router;
