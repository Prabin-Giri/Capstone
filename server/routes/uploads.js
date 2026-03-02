const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, queryOne } = require('../db');

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
const updateDocumentPath = async (courseId, column, filePath) => {
    const db = getDb();
    // Check if record exists
    const [rows] = await db.execute('SELECT course_id FROM course_documents WHERE course_id = ?', [courseId]);
    const exists = rows.length > 0;

    if (exists) {
        await db.execute(`UPDATE course_documents SET ${column} = ? WHERE course_id = ?`, [filePath, courseId]);
    } else {
        await db.execute(`INSERT INTO course_documents (course_id, ${column}) VALUES (?, ?)`, [courseId, filePath]);
    }
};

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

// POST /api/uploads/starter-code
router.post('/starter-code', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        res.json({ message: 'Starter code uploaded successfully', filePath: req.file.filename });
    } catch (err) {
        next(err);
    }
});

// GET /api/uploads/documents/:courseId
router.get('/documents/:courseId', async (req, res, next) => {
    try {
        const db = getDb();
        const result = await db.execute('SELECT * FROM course_documents WHERE course_id = ?', [req.params.courseId]);
        const row = queryOne(result);
        res.json(row || {});
    } catch (err) {
        next(err);
    }
});

// POST /api/uploads/profile-picture/:userId
router.post('/profile-picture/:userId', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const db = getDb();
        const userId = req.params.userId;
        const filePath = req.file.filename;

        // Update user record
        await db.execute(
            'UPDATE users SET profile_picture = ? WHERE id = ?',
            [filePath, userId]
        );

        res.json({
            message: 'Profile picture updated successfully',
            filePath: filePath
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
