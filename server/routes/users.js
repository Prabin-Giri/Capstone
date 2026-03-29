const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne } = require('../db');
const { generateToken, generateOTP, sendVerificationEmail, sendPasswordResetEmail, getRecentEmailLogs } = require('../email');

function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 8) {
        return 'Password must be at least 8 characters';
    }
    if (!/[a-zA-Z]/.test(password)) {
        return 'Password must contain at least one letter';
    }
    if (!/[0-9]/.test(password)) {
        return 'Password must contain at least one number';
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
        return 'Password must contain at least one special character';
    }
    return null;
}

function inferSignupRole(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (normalizedEmail.endsWith('@warhawks.ulm.edu')) {
        return 'student';
    }
    if (normalizedEmail.endsWith('@ulm.edu')) {
        return 'faculty';
    }
    return null;
}

// POST /api/users/signup - Register new user with role inferred from email domain
router.post('/signup', async (req, res, next) => {
    try {
        const { name, email, password, student_id } = req.body;
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        const normalizedStudentId = typeof student_id === 'string' ? student_id.trim() : undefined;
        const role = inferSignupRole(normalizedEmail);

        if (!normalizedName || !normalizedEmail || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        if (!role) {
            return res.status(400).json({ error: 'Use a @warhawks.ulm.edu student email or an @ulm.edu faculty email' });
        }
        if (role === 'student' && !normalizedStudentId) {
            return res.status(400).json({ error: 'Student ID is required for student accounts' });
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        const db = getDb();
        const [existing] = await db.execute('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        const id = (role === 'student' && normalizedStudentId) ? normalizedStudentId : normalizedEmail;
        const verified = role === 'faculty' ? 0 : 1;

        // Generate email verification token + OTP
        const verificationToken = generateToken();
        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await db.execute(
            'INSERT INTO users (id, name, email, password, role, verified, student_id, email_verified, email_verification_token, email_verification_otp, email_verification_expires) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
            [id, normalizedName, normalizedEmail, password, role, verified, role === 'student' ? normalizedStudentId : null, verificationToken, otp, expires]
        );

        // Send verification email (don't fail signup if email fails)
        try {
            await sendVerificationEmail(normalizedEmail, normalizedName, verificationToken, otp);
        } catch (emailErr) {
            console.error('Failed to send verification email:', emailErr.message);
        }

        res.status(201).json({ id, name: normalizedName, email: normalizedEmail, role, profile_picture: null, verified: verified === 1, email_verified: false });
    } catch (err) {
        next(err);
    }
});

// POST /api/users/login - Simple login check
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        if (!normalizedEmail || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const db = getDb();
        const [rows] = await db.execute('SELECT id, name, email, role, password, profile_picture, verified, email_verified FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
        const user = rows[0];

        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        delete user.password;
        user.verified = user.verified === 1 || user.verified === true;
        user.email_verified = user.email_verified === 1 || user.email_verified === true;
        res.json(user);
    } catch (err) {
        next(err);
    }
});

// POST /api/users/verify-email - Verify email via OTP
router.post('/verify-email', async (req, res, next) => {
    try {
        const { email, otp } = req.body;
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        if (!normalizedEmail || !otp) {
            return res.status(400).json({ error: 'Email and verification code are required' });
        }

        const db = getDb();
        const [rows] = await db.execute(
            'SELECT id, name, email, role, profile_picture, verified, email_verification_otp, email_verification_expires FROM users WHERE LOWER(email) = ?',
            [normalizedEmail]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = rows[0];
        if (!user.email_verification_otp || !user.email_verification_expires) {
            return res.status(400).json({ error: 'No pending verification. Please request a new code.' });
        }
        if (new Date(user.email_verification_expires) < new Date()) {
            return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
        }
        if (user.email_verification_otp !== otp) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        await db.execute(
            'UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_otp = NULL, email_verification_expires = NULL WHERE id = ?',
            [user.id]
        );

        user.verified = user.verified === 1 || user.verified === true;
        user.email_verified = true;
        delete user.email_verification_otp;
        delete user.email_verification_expires;
        res.json(user);
    } catch (err) {
        next(err);
    }
});

// GET /api/users/verify-email-token - Verify email via link token
router.get('/verify-email-token', async (req, res, next) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const db = getDb();
        const [rows] = await db.execute(
            'SELECT id, name, email, role, profile_picture, verified, email_verification_expires FROM users WHERE email_verification_token = ?',
            [token]
        );
        if (rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired verification link' });
        }

        const user = rows[0];
        if (new Date(user.email_verification_expires) < new Date()) {
            await db.execute(
                'UPDATE users SET email_verification_token = NULL, email_verification_otp = NULL, email_verification_expires = NULL WHERE id = ?',
                [user.id]
            );
            return res.status(400).json({ error: 'Verification link has expired. Please request a new one.' });
        }

        await db.execute(
            'UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_otp = NULL, email_verification_expires = NULL WHERE id = ?',
            [user.id]
        );

        user.verified = user.verified === 1 || user.verified === true;
        user.email_verified = true;
        delete user.email_verification_expires;
        res.json(user);
    } catch (err) {
        next(err);
    }
});

// GET /api/users/dev-email-logs - Dev-only access to recent in-memory email logs
router.get('/dev-email-logs', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }

    const normalizedEmail = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
    if (!normalizedEmail) {
        return res.status(400).json({ error: 'Email is required' });
    }

    return res.json({ logs: getRecentEmailLogs(normalizedEmail) });
});

// POST /api/users/resend-verification - Resend verification email
router.post('/resend-verification', async (req, res, next) => {
    try {
        const { email } = req.body;
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        if (!normalizedEmail) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const db = getDb();
        const [rows] = await db.execute('SELECT id, name, email_verified, email_verification_expires FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
        if (rows.length === 0) {
            return res.json({ message: 'If an account with that email exists, a verification email has been sent.' });
        }

        const user = rows[0];
        if (user.email_verified === 1 || user.email_verified === true) {
            return res.status(400).json({ error: 'Email is already verified' });
        }

        // Rate limit: if previous OTP was sent less than 1 minute ago
        if (user.email_verification_expires) {
            const expiresAt = new Date(user.email_verification_expires).getTime();
            const sentAt = expiresAt - 10 * 60 * 1000; // OTP lasts 10min, so sent time = expires - 10min
            if (Date.now() - sentAt < 60 * 1000) {
                return res.status(429).json({ error: 'Please wait before requesting another email.' });
            }
        }

        const verificationToken = generateToken();
        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000);

        await db.execute(
            'UPDATE users SET email_verification_token = ?, email_verification_otp = ?, email_verification_expires = ? WHERE id = ?',
            [verificationToken, otp, expires, user.id]
        );

        try {
            await sendVerificationEmail(normalizedEmail, user.name, verificationToken, otp);
        } catch (emailErr) {
            console.error('Failed to resend verification email:', emailErr.message);
            return res.status(500).json({ error: emailErr.message || 'Failed to send verification email. Please try again.' });
        }

        res.json({ message: 'Verification email sent' });
    } catch (err) {
        next(err);
    }
});

// POST /api/users/forgot-password - Send password reset email
router.post('/forgot-password', async (req, res, next) => {
    try {
        const { email } = req.body;
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        if (!normalizedEmail) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const db = getDb();
        const [rows] = await db.execute('SELECT id, name FROM users WHERE LOWER(email) = ?', [normalizedEmail]);

        // Always return generic message to prevent email enumeration
        if (rows.length === 0) {
            return res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
        }

        const user = rows[0];
        const token = generateToken();
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await db.execute(
            'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?',
            [token, expires, user.id]
        );

        try {
            await sendPasswordResetEmail(normalizedEmail, user.name, token);
        } catch (emailErr) {
            console.error('Failed to send password reset email:', emailErr.message);
        }

        res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
    } catch (err) {
        next(err);
    }
});

// POST /api/users/reset-password - Reset password with token
router.post('/reset-password', async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        const passwordError = validatePassword(newPassword);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        const db = getDb();
        const [rows] = await db.execute(
            'SELECT id, password_reset_expires FROM users WHERE password_reset_token = ?',
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset link' });
        }

        const user = rows[0];
        if (new Date(user.password_reset_expires) < new Date()) {
            await db.execute('UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?', [user.id]);
            return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
        }

        await db.execute(
            'UPDATE users SET password = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?',
            [newPassword, user.id]
        );

        res.json({ message: 'Password has been reset successfully' });
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

        if (role === 'ta') {
            // Include students as potential TAs
            query += " AND (role = 'ta' OR role = 'student')";
        } else if (role) {
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

// PUT /api/users/profile - Update user profile (RESTRICTED: Name and Email editing disabled)
router.put('/profile', async (req, res, next) => {
    return res.status(403).json({ error: 'Name and email editing is restricted for all accounts.' });
});

// GET /api/users/:id/verified - Check if user (e.g. faculty) is verified (for pending page refresh)
router.get('/:id/verified', async (req, res, next) => {
    try {
        const db = getDb();
        const [rows] = await db.execute('SELECT verified, email_verified FROM users WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        const verified = rows[0].verified === 1 || rows[0].verified === true;
        const email_verified = rows[0].email_verified === 1 || rows[0].email_verified === true;
        res.json({ verified, email_verified });
    } catch (err) {
        next(err);
    }
});

// POST /api/users/change-password
router.post('/change-password', async (req, res, next) => {
    try {
        const { userId, currentPassword, newPassword } = req.body;
        if (!userId || !currentPassword || !newPassword) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const passwordError = validatePassword(newPassword);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        const db = getDb();
        const [rows] = await db.execute('SELECT password FROM users WHERE id = ?', [userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

        if (rows[0].password !== currentPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        await db.execute('UPDATE users SET password = ? WHERE id = ?', [newPassword, userId]);
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
