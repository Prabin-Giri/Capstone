const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, saveDb } = require('../db');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// Helper to update document path in DB
const updateDocumentPath = (courseId, column, filePath) => {
    const db = getDb();
    // Check if record exists
    const stmt = db.prepare('SELECT 1 FROM course_documents WHERE course_id = ?');
    stmt.bind([courseId]);
    const exists = stmt.step();
    stmt.free();

    if (exists) {
        db.run(`UPDATE course_documents SET ${column} = ?, updated_at = datetime('now') WHERE course_id = ?`, [filePath, courseId]);
    } else {
        db.run(`INSERT INTO course_documents (course_id, ${column}) VALUES (?, ?)`, [courseId, filePath]);
    }
    saveDb();
};

// POST /api/uploads/syllabus/:courseId
router.post('/syllabus/:courseId', upload.single('file'), (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        updateDocumentPath(req.params.courseId, 'syllabus_path', req.file.filename);
        res.json({ message: 'Syllabus uploaded successfully', filePath: req.file.filename });
    } catch (err) {
        next(err);
    }
});

// POST /api/uploads/schedule/:courseId
router.post('/schedule/:courseId', upload.single('file'), (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        updateDocumentPath(req.params.courseId, 'schedule_path', req.file.filename);
        res.json({ message: 'Assignment schedule uploaded successfully', filePath: req.file.filename });
    } catch (err) {
        next(err);
    }
});

// GET /api/uploads/documents/:courseId
router.get('/documents/:courseId', (req, res, next) => {
    try {
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM course_documents WHERE course_id = ?');
        stmt.bind([req.params.courseId]);
        let result = null;
        if (stmt.step()) {
            result = stmt.getAsObject();
        }
        stmt.free();
        res.json(result || {});
    } catch (err) {
        next(err);
    }
});

module.exports = router;
