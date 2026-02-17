const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, saveDb } = require('../db');

// GET /api/test-cases/:assignmentId - Get all test cases for an assignment
router.get('/:assignmentId', (req, res, next) => {
    try {
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM test_cases WHERE assignment_id = ? ORDER BY id');
        stmt.bind([req.params.assignmentId]);
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

// POST /api/test-cases - Create new test case
router.post('/', (req, res, next) => {
    try {
        const { assignment_id, input, expected_output, points = 0, is_public = 1 } = req.body;

        if (!assignment_id || expected_output === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const db = getDb();
        const stmt = db.prepare('INSERT INTO test_cases (assignment_id, input, expected_output, points, is_public) VALUES (?, ?, ?, ?, ?)');
        stmt.run([assignment_id, input, expected_output, points, is_public]);
        stmt.free();

        saveDb();
        res.status(201).json({ message: 'Test case created successfully' });
    } catch (err) {
        next(err);
    }
});

// PUT /api/test-cases/:id - Update test case
router.put('/:id', (req, res, next) => {
    try {
        const { input, expected_output, points, is_public } = req.body;
        const id = req.params.id;

        const db = getDb();
        const updates = [];
        const values = [];

        if (input !== undefined) { updates.push('input = ?'); values.push(input); }
        if (expected_output !== undefined) { updates.push('expected_output = ?'); values.push(expected_output); }
        if (points !== undefined) { updates.push('points = ?'); values.push(points); }
        if (is_public !== undefined) { updates.push('is_public = ?'); values.push(is_public); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        const stmt = db.prepare(`UPDATE test_cases SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
        stmt.run(values);
        stmt.free();

        saveDb();
        res.json({ message: 'Test case updated successfully' });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/test-cases/:id - Delete test case
router.delete('/:id', (req, res, next) => {
    try {
        const db = getDb();
        const stmt = db.prepare('DELETE FROM test_cases WHERE id = ?');
        stmt.run([req.params.id]);
        stmt.free();

        saveDb();
        res.json({ message: 'Test case deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
