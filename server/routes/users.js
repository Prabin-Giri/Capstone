const express = require('express');
const router = express.Router();
const { getDb, queryToObjects, queryOne } = require('../db');
const { getClientIp, getUserAgent, recordLoginAttempt, recordActivity, touchUserLastSeen } = require('../audit');
const { generateToken, generateOTP, sendVerificationEmail, sendPasswordResetEmail } = require('../email');

/** Plain object for JSON responses (avoids mysql2 RowDataPacket quirks; stable profile_picture). */
function publicUserFromRow(row) {
    if (!row) return null;
    const pic = row.profile_picture;
    return {
        id: row.id != null ? String(row.id) : '',
        name: row.name,
        email: row.email,
        role: row.role,
        profile_picture: pic == null || pic === '' ? null : String(pic),
        verified: row.verified === 1 || row.verified === true,
        email_verified: row.email_verified === 1 || row.email_verified === true,
        must_change_password: row.must_change_password === 1 || row.must_change_password === true,
    };
}

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

        // Send verification email (don't fail signup if email fails, but log it)
        try {
            await sendVerificationEmail(normalizedEmail, normalizedName, verificationToken, otp);
        } catch (emailErr) {
            console.error('VERIFICATION EMAIL ERROR [Signup]:', {
                code: emailErr.code,
                message: emailErr.message,
                stack: emailErr.stack,
                email: normalizedEmail
            });
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
        const ip = getClientIp(req);
        const ua = getUserAgent(req);
        const [rows] = await db.execute(
            'SELECT id, name, email, role, password, profile_picture, verified, email_verified, must_change_password FROM users WHERE LOWER(email) = ?',
            [normalizedEmail]
        );
        const user = rows[0];

        if (!user) {
            await recordLoginAttempt(db, {
                email: normalizedEmail,
                userId: null,
                success: false,
                reason: 'unknown_user',
                ip,
                userAgent: ua,
            });
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (user.password !== password) {
            await recordLoginAttempt(db, {
                email: normalizedEmail,
                userId: user.id,
                success: false,
                reason: 'bad_password',
                ip,
                userAgent: ua,
            });
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        await recordLoginAttempt(db, {
            email: normalizedEmail,
            userId: user.id,
            success: true,
            reason: null,
            ip,
            userAgent: ua,
        });
        await recordActivity(db, { userId: user.id, action: 'login', detail: { email: normalizedEmail }, ip });
        await touchUserLastSeen(db, user.id);

        res.json(publicUserFromRow(user));
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

        res.json(publicUserFromRow(user));
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

        res.json(publicUserFromRow(user));
    } catch (err) {
        next(err);
    }
});

// GET /api/users/diag/env - Censors secrets but confirms if Vercel is reading the SMTP/Email env vars
router.get('/diag/env', async (req, res) => {
    const mask = (val) => {
        if (!val) return 'MISSING';
        if (typeof val !== 'string') return 'PRESENT (Not a string)';
        if (val.length <= 4) return 'PRESENT (Too short)';
        return `${val.slice(0, 2)}***${val.slice(-2)} (Length: ${val.length})`;
    };

    const config = {
        NODE_ENV: process.env.NODE_ENV,
        EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'auto',
        SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
        SMTP_PORT: process.env.SMTP_PORT || '587',
        SMTP_SECURE: process.env.SMTP_SECURE || 'false',
        SMTP_USER: mask(process.env.SMTP_USER),
        SMTP_PASS: mask(process.env.SMTP_PASS),
        SMTP_FROM: mask(process.env.SMTP_FROM),
        RESEND_API_KEY: mask(process.env.RESEND_API_KEY),
        EMAIL_FROM: mask(process.env.EMAIL_FROM),
        FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
        MYSQL_HOST: mask(process.env.MYSQL_HOST),
        TIMESTAMP: new Date().toISOString()
    };

    // Test Database Connectivity
    try {
        const { getDb, isMySQL } = require('../db');
        const db = getDb();
        if (isMySQL) {
            const [rows] = await db.execute('SELECT 1 as "health"');
            config.DATABASE = {
                status: 'CONNECTED',
                type: 'MySQL',
                health: rows[0].health
            };
        } else {
            config.DATABASE = {
                status: 'CONNECTED',
                type: 'SQLite'
            };
        }
    } catch (dbErr) {
        config.DATABASE = {
            status: 'FAILED',
            error: dbErr.message,
            code: dbErr.code,
            errno: dbErr.errno,
            sqlState: dbErr.sqlState,
            hint: 'If ETIMEDOUT, check AWS RDS Security Group. If EACCESS, check password.'
        };
    }

    res.json(config);
});

// POST /api/users/test-smtp - Send a simple test email to diagnostic credentials
router.post('/test-smtp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Target email is required' });
        }

        // Import deliverEmail directly if needed, but we used sendVerificationEmail as a proxy here
        // Using a custom test for speed and detailed reporting
        console.log('DIAGNOSTIC: Attempting test SMTP email to:', email);
        console.log('DIAGNOSTIC: SMTP_HOST:', process.env.SMTP_HOST || 'smtp.gmail.com');
        console.log('DIAGNOSTIC: SMTP_PORT:', process.env.SMTP_PORT || '587');
        console.log('DIAGNOSTIC: SMTP_USER:', process.env.SMTP_USER);

        await sendVerificationEmail(email, 'Test User', 'test-token', '123456');
        res.json({ success: true, message: `Email sent to ${email}. Check your inbox and Vercel logs.` });
    } catch (err) {
        console.error('DIAGNOSTIC SMTP FAILURE:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message, 
            code: err.code,
            details: 'Check Vercel console logs for the full SMTP handshake.'
        });
    }
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
            console.error('VERIFICATION EMAIL ERROR [Resend]:', {
                code: emailErr.code,
                message: emailErr.message,
                stack: emailErr.stack,
                email: normalizedEmail
            });
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
            'UPDATE users SET password = ?, password_reset_token = NULL, password_reset_expires = NULL, must_change_password = 0 WHERE id = ?',
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

        await db.execute('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?', [newPassword, userId]);
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        next(err);
    }
});

// GET /api/users/:id/groups - Get all groups a user belongs to
router.get('/:id/groups', async (req, res, next) => {
    try {
        const db = getDb();
        const [rows] = await db.execute(`
            SELECT g.id, g.name, g.assignment_id, a.course_id, a.title as assignment_title, c.name as course_name 
            FROM group_members gm
            JOIN assignment_groups g ON gm.group_id = g.id
            JOIN assignments a ON g.assignment_id = a.id
            JOIN courses c ON a.course_id = c.id
            WHERE gm.student_id = ?
        `, [req.params.id]);

        const groups = queryToObjects(rows);

        // Fetch members for each group
        for (let g of groups) {
            const [members] = await db.execute(`
                SELECT u.id, u.name, u.email 
                FROM group_members gm 
                JOIN users u ON gm.student_id = u.id 
                WHERE gm.group_id = ?
            `, [g.id]);
            g.members = queryToObjects(members);
        }
        
        res.json(groups);
    } catch (err) {
        next(err);
    }
});

// GET /api/users/:id/groups - Get all assignment groups a student belongs to
router.get('/:id/groups', async (req, res, next) => {
    try {
        const db = getDb();
        const [rows] = await db.execute(`
            SELECT g.id, g.name, g.assignment_id, a.course_id, a.title AS assignment_title
            FROM assignment_groups g
            JOIN group_members gm ON g.id = gm.group_id
            JOIN assignments a ON g.assignment_id = a.id
            WHERE gm.student_id = ?
        `, [req.params.id]);
        
        // Fetch all members for each group
        const result = [];
        for (const group of queryToObjects(rows)) {
            const [members] = await db.execute(`
                SELECT u.id, u.name, u.email, u.profile_picture
                FROM group_members gm
                JOIN users u ON gm.student_id = u.id
                WHERE gm.group_id = ?
            `, [group.id]);
            result.push({
                ...group,
                members: queryToObjects(members)
            });
        }
        res.json(result);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
