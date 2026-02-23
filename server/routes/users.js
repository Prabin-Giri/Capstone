const express = require('express');
const router = express.Router();
const { queryOne } = require('../db');

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

module.exports = router;
