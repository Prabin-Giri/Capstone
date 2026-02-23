const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { queryOne, run, saveDb } = require('../db');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadsDir); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname); }
});

const upload = multer({ storage });

async function updateDocumentPath(courseId, column, filePath) {
    const row = await queryOne('SELECT 1 FROM course_documents WHERE course_id = ?', [courseId]);
    if (row) {
        await run(`UPDATE course_documents SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE course_id = ?`, [filePath, courseId]);
    } else {
        await run(`INSERT INTO course_documents (course_id, ${column}) VALUES (?, ?)`, [courseId, filePath]);
    }
    await saveDb();
}

// POST /api/uploads/syllabus/:courseId
router.post('/syllabus/:courseId', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        await updateDocumentPath(req.params.courseId, 'syllabus_path', req.file.filename);
        res.json({ message: 'Syllabus uploaded successfully', filePath: req.file.filename });
    } catch (err) {
        next(err);
    }
});

// POST /api/uploads/schedule/:courseId
router.post('/schedule/:courseId', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        await updateDocumentPath(req.params.courseId, 'schedule_path', req.file.filename);
        res.json({ message: 'Assignment schedule uploaded successfully', filePath: req.file.filename });
    } catch (err) {
        next(err);
    }
});

// GET /api/uploads/documents/:courseId
router.get('/documents/:courseId', async (req, res, next) => {
    try {
        const row = await queryOne('SELECT * FROM course_documents WHERE course_id = ?', [req.params.courseId]);
        res.json(row || {});
    } catch (err) {
        next(err);
    }
});

module.exports = router;
