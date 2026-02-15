const express = require('express');
const router = express.Router();
const { getDb, queryToObjects } = require('../db');

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
        const { course_id, title, description, due_date, status = 'active', points = 100 } = req.body;

        if (!course_id || !title || !due_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Generate a simple ID if not provided (e.g., lowercase title driven or random)
        const id = req.body.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4);

        const db = getDb();
        const stmt = db.prepare('INSERT INTO assignments (id, course_id, title, description, due_date, status, points) VALUES (?, ?, ?, ?, ?, ?, ?)');
        stmt.run([id, course_id, title, description, due_date, status, points]);
        stmt.free();

        // Save DB to file
        const { saveDb } = require('../db');
        saveDb();

        res.status(201).json({ id, course_id, title, description, due_date, status, points });
    } catch (err) {
        next(err);
    }
});

// PUT /api/assignments/:id - Update assignment
router.put('/:id', (req, res, next) => {
    try {
        const { title, description, due_date, status, points } = req.body;
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

module.exports = router;
