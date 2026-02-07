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

module.exports = router;
