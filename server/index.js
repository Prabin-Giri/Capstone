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
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/courses', coursesRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/test-cases', testCasesRouter);
app.use('/api/users', usersRouter);
app.use('/api/grader', graderRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize database then start server
initDb().then(async () => {
    const { initGraderSchema } = require('./grader/initGraderSchema');
    await initGraderSchema();
    const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
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
