const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne } = require('../db');

// POST /api/users/signup - Register new user
router.post('/signup', async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const db = getDb();
        // Check if user exists
        const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        // Create user
        const id = email; // Using email as ID for consistency with existing code
        await db.execute("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)", [id, name, email, password, role]);

        res.status(201).json({ id, name, email, role, profile_picture: null });
    } catch (err) {
        next(err);
    }
});

// POST /api/users/login - Simple login check
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const db = getDb();
        const [rows] = await db.execute('SELECT id, name, email, role, password, profile_picture FROM users WHERE email = ?', [email]);
        const user = rows[0];

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

// GET /api/users/students - Get all students (for enrollment)
router.get('/students', async (req, res, next) => {
    const { q } = req.query;
    try {
        const db = getDb();
        let query = "SELECT id, name, email, profile_picture FROM users WHERE role = 'student'";
        const params = [];
        if (q) {
            query += " AND (name LIKE ? OR email LIKE ? OR id LIKE ?)";
            const search = `%${q}%`;
            params.push(search, search, search);
        }
        const result = await db.execute(query, params);
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// GET /api/users/search - Get users dynamically by role
router.get('/search', async (req, res, next) => {
    const { q, role } = req.query;
    try {
        const db = getDb();
        let query = "SELECT id, name, email, role FROM users WHERE 1=1";
        const params = [];

        if (role) {
            query += " AND role = ?";
            params.push(role);
        }

        if (q) {
            query += " AND (name LIKE ? OR email LIKE ? OR id LIKE ?)";
            const search = `%${q}%`;
            params.push(search, search, search);
        }

        const result = await db.execute(query, params);
        res.json(queryToObjects(result));
    } catch (err) {
        next(err);
    }
});

// PUT /api/users/profile - Update user profile
router.put('/profile', async (req, res, next) => {
    try {
        const { id, name, email } = req.body;
        if (!id || !name || !email) {
            return res.status(400).json({ error: 'ID, name, and email are required' });
        }

        const db = getDb();

        // Check if new email is taken by another user
        if (email !== id) {
            const [existing] = await db.execute('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Email is already in use by another account' });
            }
        }

        await db.execute(
            'UPDATE users SET name = ?, email = ? WHERE id = ?',
            [name, email, id]
        );

        const [updatedUser] = await db.execute('SELECT id, name, email, role, profile_picture FROM users WHERE id = ?', [id]);
        res.json({ ...updatedUser[0], message: 'Profile updated successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
