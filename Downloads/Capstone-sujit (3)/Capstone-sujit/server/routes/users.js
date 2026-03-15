const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne } = require('../db');

// POST /api/users/signup - Register new user (no role; role is assigned later by admin or context)
router.post('/signup', async (req, res, next) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const db = getDb();
        // Check if user exists
        const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        // Create user with no role; role is decided later (e.g. admin assigns faculty, enrollment makes them a student)
        const id = email; // Using email as ID for consistency with existing code
        await db.execute("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)", [id, name, email, password, null]);

        res.status(201).json({ id, name, email, role: null, profile_picture: null });
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
        // Treat users with role user, student, or ta (or no role) as eligible "students" for enrollment.
        let query = "SELECT id, name, email, profile_picture FROM users WHERE (role IS NULL OR role IN ('user', 'student', 'ta'))";
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

// GET /api/users/search - Get users by name/email/id. Optional ?role= filters by role; no role = all users (for TA invite, use no role so students/null can be invited).
router.get('/search', async (req, res, next) => {
    const { q, role } = req.query;
    try {
        const db = getDb();
        let sql = "SELECT id, name, email, role FROM users WHERE 1=1";
        const params = [];

        if (role) {
            sql += " AND role = ?";
            params.push(role);
        } else {
            // No role filter: return all users (including role IS NULL, student, user) so faculty can invite anyone as TA
        }

        if (q) {
            const search = `%${String(q).trim()}%`;
            sql += " AND (name LIKE ? OR email LIKE ? OR id LIKE ?)";
            params.push(search, search, search);
        }

        sql += " ORDER BY name";
        const result = await db.execute(sql, params);
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
