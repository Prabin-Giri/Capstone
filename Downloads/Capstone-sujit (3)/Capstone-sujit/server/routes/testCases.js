const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne } = require('../db');

// GET /api/test-cases/:assignmentId - Get all test cases for an assignment
router.get('/:assignmentId', async (req, res, next) => {
    try {
        const db = getDb();
        const result = await db.execute('SELECT * FROM test_cases WHERE assignment_id = ? ORDER BY id', [req.params.assignmentId]);
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// POST /api/test-cases - Create new test case
router.post('/', async (req, res, next) => {
    try {
        let { assignment_id, input, expected_output, points, is_public = 1 } = req.body;

        if (!assignment_id || expected_output === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const db = getDb();
        // Default each test to at least 1 point if not specified, so autograder doesn't always return 0
        const safePoints = points == null || Number(points) <= 0 ? 1 : Number(points);
        await db.execute('INSERT INTO test_cases (assignment_id, input, expected_output, points, is_public) VALUES (?, ?, ?, ?, ?)',
            [assignment_id, input, expected_output, safePoints, is_public]);

        res.status(201).json({ message: 'Test case created successfully' });
    } catch (err) {
        next(err);
    }
});

// PUT /api/test-cases/:id - Update test case
router.put('/:id', async (req, res, next) => {
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
        const sql = `UPDATE test_cases SET ${updates.join(', ')} WHERE id = ?`;
        await db.execute(sql, values);

        res.json({ message: 'Test case updated successfully' });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/test-cases/:id - Delete test case
router.delete('/:id', async (req, res, next) => {
    try {
        const db = getDb();
        await db.execute('DELETE FROM test_cases WHERE id = ?', [req.params.id]);
        res.json({ message: 'Test case deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
