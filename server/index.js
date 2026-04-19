const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

function loadEnv() {
    const envFiles = [
        path.join(__dirname, '../.env'),
        path.join(__dirname, '.env'),
    ];
    for (const envPath of envFiles) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath, override: false });
        }
    }

    // Backward-compatible aliases for older EC2 env names.
    if (!process.env.MYSQL_HOST && process.env.DB_HOST) process.env.MYSQL_HOST = process.env.DB_HOST;
    if (!process.env.MYSQL_PORT && process.env.DB_PORT) process.env.MYSQL_PORT = process.env.DB_PORT;
    if (!process.env.MYSQL_USER && process.env.DB_USER) process.env.MYSQL_USER = process.env.DB_USER;
    if (!process.env.MYSQL_PASSWORD && process.env.DB_PASSWORD) process.env.MYSQL_PASSWORD = process.env.DB_PASSWORD;
    if (!process.env.MYSQL_PASSWORD && process.env.DB_PASS) process.env.MYSQL_PASSWORD = process.env.DB_PASS;
    if (!process.env.MYSQL_DATABASE && process.env.DB_NAME) process.env.MYSQL_DATABASE = process.env.DB_NAME;
    if (!process.env.AWS_S3_BUCKET && process.env.S3_BUCKET_NAME) process.env.AWS_S3_BUCKET = process.env.S3_BUCKET_NAME;
}

loadEnv();
const { initDb, isMySQL, getDb } = require('./db');
const { isPasswordHash, hashPassword } = require('./passwords');
const { attachAuthContext, requireAuth, requireRoles } = require('./auth');

const coursesRouter = require('./routes/courses');
const assignmentsRouter = require('./routes/assignments');
const submissionsRouter = require('./routes/submissions');
const calendarRouter = require('./routes/calendar');
const uploadsRouter = require('./routes/uploads');
const testCasesRouter = require('./routes/testCases');
const usersRouter = require('./routes/users');
const graderRouter = require('./routes/grader');
const aiDetectorRouter = require('./routes/aiDetector');
const adminRouter = require('./routes/admin');
const messagesRouter = require('./routes/messages');

const app = express();
const PORT = process.env.PORT || 3001;

function toClientErrorMessage(err) {
    const message = String((err && err.message) || '');
    if ((err && err.code === 'ECONNRESET') || /ECONNRESET/i.test(message)) {
        return 'Database connection was interrupted. Please try again.';
    }
    return message || 'Internal server error';
}

async function migrateLegacyPlaintextPasswords() {
    const db = getDb();
    const [rows] = await db.execute('SELECT id, password FROM users WHERE password IS NOT NULL AND password <> ?', ['']);
    const users = Array.isArray(rows) ? rows : [];
    let migrated = 0;
    for (const user of users) {
        const current = typeof user.password === 'string' ? user.password : '';
        if (!current || isPasswordHash(current)) continue;
        const upgraded = await hashPassword(current);
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [upgraded, user.id]);
        migrated += 1;
    }
    if (migrated > 0) {
        console.log(`[auth] Migrated ${migrated} plaintext password(s) to bcrypt hashes.`);
    }
}

// Middleware
app.use(cors({
    origin: '*', // Allow all for initial link fix, we can restrict later
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(attachAuthContext);

// ── S3 / File Storage ──────────────────────────────────────────────────────
// Files are served via GET /api/submissions/:id/file/:filename (proxy in submissions route)
// which reads from S3 (if configured) or local disk (local dev fallback).
// The legacy express.static('/uploads') has been removed to avoid serving stale files post-redeploy.
const { s3Enabled } = require('./s3');
if (s3Enabled) {
    console.log(`[storage] S3 enabled — bucket: ${process.env.AWS_S3_BUCKET} (${process.env.AWS_REGION || 'us-east-2'})`);
} else {
    console.warn('[storage] S3 not configured — using local disk (uploads/ dir). Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET for persistent storage.');
}

// Routes
app.use('/api/courses', requireAuth, coursesRouter);
app.use('/api/assignments', requireAuth, assignmentsRouter);
app.use('/api/submissions', requireAuth, submissionsRouter);
app.use('/api/calendar', requireAuth, calendarRouter);
app.use('/api/uploads', requireAuth, uploadsRouter);
app.use('/api/test-cases', requireAuth, testCasesRouter);
app.use('/api/users', usersRouter);
app.use('/api/grader', requireAuth, requireRoles('faculty', 'ta', 'admin'), graderRouter);
app.use('/api/ai-detector', requireAuth, aiDetectorRouter);
app.use('/api/admin', requireAuth, requireRoles('admin'), adminRouter);
app.use('/api/messages', requireAuth, messagesRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    const statusCode = Number.isInteger(err?.status) && err.status >= 400 ? err.status : 500;
    res.status(statusCode).json({ error: toClientErrorMessage(err) });
});

// Initialize database then start server
initDb().then(async () => {
    await migrateLegacyPlaintextPasswords();
    const { initGraderSchema } = require('./grader/initGraderSchema');
    await initGraderSchema();
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
        console.log(`Database: ${isMySQL ? 'MySQL' : 'SQLite'} (${isMySQL ? (process.env.MYSQL_DATABASE || 'autograde') : 'autograde.db'})`);
    });

    // Handle server errors (like EADDRINUSE)
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use. Please kill the process or use a different port.`);
        } else {
            console.error('Server error:', err);
        }
        process.exit(1);
    });

    // Graceful shutdown
    const shutdown = async () => {
        console.log('\nShutting down gracefully...');
        try {
            const { getDb } = require('./db');
            const db = getDb();
            await db.end();
            console.log('Database pool closed.');
        } catch (_) {
            // Database was not initialized or already closed
        }
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
