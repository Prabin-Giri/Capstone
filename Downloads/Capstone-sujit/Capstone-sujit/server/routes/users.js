const express = require('express');
const router = express.Router();
const { queryOne, run } = require('../db');
const { v4: uuidv4 } = require('crypto').randomUUID ? { v4: () => require('crypto').randomUUID() } : require('crypto');

// POST /api/users/login
router.post('/login', async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const user = await queryOne('SELECT id, name, email, role FROM users WHERE email = ?', [email]);
        if (!user) return res.status(404).json({ error: 'User not found. Please try a registered email.' });
        res.json(user);
    } catch (err) {
        next(err);
    }
});

// POST /api/users/signup
router.post('/signup', async (req, res, next) => {
    try {
        const { name, email, role } = req.body;
        if (!name || !email || !role) {
            return res.status(400).json({ error: 'Name, email, and role are required' });
        }

        // Check if email already exists
        const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists' });
        }

        const id = require('crypto').randomUUID();
        await run(
            'INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?)',
            [id, name, email, role]
        );

        const user = await queryOne('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
        res.status(201).json(user);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
