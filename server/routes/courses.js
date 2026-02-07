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

module.exports = router;
