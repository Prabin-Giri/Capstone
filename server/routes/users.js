const express = require('express');
const router = express.Router();
const { getDb, queryOne } = require('../db');

// POST /api/users/login - Simple login check (Auto-create for students)
router.post('/login', (req, res, next) => {
    try {
        const { email, role } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const db = getDb();
        let result = db.exec('SELECT id, name, email, role FROM users WHERE email = ?', [email]);
        let user = queryOne(result);

        if (!user) {
            // Auto-create strictly for students
            if (role === 'student') {
                const name = email.split('@')[0]; // Simple name derivation
                // Use email as ID for simplicity and stability, or generate one
                const id = email;

                db.run("INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, 'student')", [id, name, email]);

                // Save DB
                const { saveDb } = require('../db');
                saveDb();

                // Fetch new user
                result = db.exec('SELECT id, name, email, role FROM users WHERE email = ?', [email]);
                user = queryOne(result);
            } else {
                return res.status(404).json({ error: 'Faculty account not found. Please contact administrator.' });
            }
        }

        res.json(user);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
