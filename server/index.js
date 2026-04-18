const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { initDb, isMySQL } = require('./db');

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

// Middleware
app.use(cors({
    origin: '*', // Allow all for initial link fix, we can restrict later
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

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
app.use('/api/courses', coursesRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/test-cases', testCasesRouter);
app.use('/api/users', usersRouter);
app.use('/api/grader', graderRouter);
app.use('/api/ai-detector', aiDetectorRouter);
app.use('/api/admin', adminRouter);
app.use('/api/messages', messagesRouter);

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
