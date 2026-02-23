const express = require('express');
const router = express.Router();
const { query, run, queryOne, saveDb, isMySQL } = require('../db');

// --- Course Colors ---

router.get('/colors', async (req, res) => {
    const { student_id } = req.query;
    if (!student_id) return res.status(400).json({ error: 'Student ID required' });
    try {
        const rows = await query('SELECT course_id, color FROM course_settings WHERE student_id = ?', [student_id]);
        const colors = {};
        rows.forEach(r => colors[r.course_id] = r.color);
        res.json(colors);
    } catch (err) {
        console.error('Error fetching colors:', err);
        res.status(500).json({ error: 'Failed to fetch colors' });
    }
});

router.post('/colors', async (req, res) => {
    const { student_id, course_id, color } = req.body;
    if (!student_id || !course_id || !color) return res.status(400).json({ error: 'Missing required fields' });
    try {
        if (isMySQL) {
            await run(`
                INSERT INTO course_settings (student_id, course_id, color, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE color = VALUES(color), updated_at = CURRENT_TIMESTAMP
            `, [student_id, course_id, color]);
        } else {
            await run(`
                INSERT OR REPLACE INTO course_settings (student_id, course_id, color)
                VALUES (?, ?, ?)
            `, [student_id, course_id, color]);
        }
        await saveDb();
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving color:', err);
        res.status(500).json({ error: 'Failed to save color' });
    }
});

// --- Todos ---

router.get('/todos', async (req, res) => {
    const { student_id } = req.query;
    if (!student_id) return res.status(400).json({ error: 'Student ID required' });
    try {
        const todos = await query('SELECT * FROM todos WHERE student_id = ? ORDER BY due_date ASC', [student_id]);
        // Convert 1/0 to boolean
        todos.forEach(t => t.completed = !!t.completed);
        res.json(todos);
    } catch (err) {
        console.error('Error fetching todos:', err);
        res.status(500).json({ error: 'Failed to fetch todos' });
    }
});

router.post('/todos', async (req, res) => {
    const { student_id, title, due_date, course_id } = req.body;
    if (!student_id || !title) return res.status(400).json({ error: 'Missing required fields' });
    const id = `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    try {
        await run(`
            INSERT INTO todos (id, student_id, course_id, title, due_date, completed, created_at)
            VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
        `, [id, student_id, course_id || null, title, due_date || null]);
        await saveDb();
        res.status(201).json({ id, student_id, course_id: course_id || null, title, due_date: due_date || null, completed: false });
    } catch (err) {
        console.error('Error creating todo:', err);
        res.status(500).json({ error: 'Failed to create todo' });
    }
});

router.put('/todos/:id', async (req, res) => {
    const { id } = req.params;
    const { title, due_date, completed, course_id } = req.body;
    try {
        const updates = [];
        const values = [];
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (due_date !== undefined) { updates.push('due_date = ?'); values.push(due_date); }
        if (completed !== undefined) { updates.push('completed = ?'); values.push(completed ? 1 : 0); }
        if (course_id !== undefined) { updates.push('course_id = ?'); values.push(course_id); }
        if (updates.length === 0) return res.json({ success: true });
        values.push(id);
        await run(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`, values);
        await saveDb();
        const todo = await queryOne('SELECT * FROM todos WHERE id = ?', [id]);
        if (todo) todo.completed = !!todo.completed;
        res.json(todo || {});
    } catch (err) {
        console.error('Error updating todo:', err);
        res.status(500).json({ error: 'Failed to update todo' });
    }
});

router.delete('/todos/:id', async (req, res) => {
    try {
        await run('DELETE FROM todos WHERE id = ?', [req.params.id]);
        await saveDb();
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting todo:', err);
        res.status(500).json({ error: 'Failed to delete todo' });
    }
});

module.exports = router;
