const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

const coursesRouter = require('./routes/courses');
const assignmentsRouter = require('./routes/assignments');
const submissionsRouter = require('./routes/submissions');
const calendarRouter = require('./routes/calendar');

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
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Database: SQLite (autograde.db)');
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

// Force restart to reload database changes and routes
