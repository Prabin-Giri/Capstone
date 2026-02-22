const express = require('express');
const router = express.Router();
const { getDb, saveDb } = require('../db');

// Helper: run parameterized SELECT and return rows (sql.js ignores params in exec(), so we use prepare/bind)
function selectUsers(db, sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

// POST /api/users/signup - Register new user
router.post('/signup', (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const db = getDb();
        // Check if user exists
        const stmt = db.prepare('SELECT id FROM users WHERE email = ?');
        stmt.bind([email]);
        if (stmt.step()) {
            stmt.free();
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        stmt.free();

        // Create user
        const id = email; // Using email as ID for consistency with existing code
        db.run("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)", [id, name, email, password, role]);
        saveDb();

        res.status(201).json({ id, name, email, role });
    } catch (err) {
        next(err);
    }
});

// POST /api/users/login - Simple login check
router.post('/login', (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const db = getDb();
        const stmt = db.prepare('SELECT id, name, email, role, password FROM users WHERE email = ?');
        stmt.bind([email]);

        let user = null;
        if (stmt.step()) {
            user = stmt.getAsObject();
        }
        stmt.free();

        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Remove password from response
        delete user.password;
        res.json(user);
    } catch (err) {
        next(err);
    }
});

module.exports = router;

