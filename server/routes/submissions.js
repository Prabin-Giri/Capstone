const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, saveDb } = require('../db');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
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

// Helper to get rows from prepared statement
function getRows(db, sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

// GET /api/submissions - Get all submissions (optionally filter)
router.get('/', (req, res, next) => {
    try {
        const db = getDb();
        const { assignment_id, student_id } = req.query;
        let sql = 'SELECT * FROM submissions WHERE 1=1';
        const params = [];

        if (assignment_id) {
            sql += ' AND assignment_id = ?';
            params.push(assignment_id);
        }
        if (student_id) {
            sql += ' AND student_id = ?';
            params.push(student_id);
        }
        sql += ' ORDER BY submitted_at DESC';

        res.json(getRows(db, sql, params));
    } catch (err) {
        next(err);
    }
});

// GET /api/submissions/:id - Get single submission
router.get('/:id', (req, res, next) => {
    try {
        const db = getDb();
        const rows = getRows(db, 'SELECT * FROM submissions WHERE id = ?', [parseInt(req.params.id)]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST /api/submissions - Create new submission (with file upload)
router.post('/', upload.single('file'), (req, res, next) => {
    try {
        const db = getDb();
        const { assignment_id, student_id } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        if (!assignment_id || !student_id) {
            return res.status(400).json({ error: 'assignment_id and student_id are required' });
        }

        const file_name = req.file.originalname;
        const file_path = req.file.filename;

        // Check for existing submission
        const existing = getRows(db, 'SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?',
            [assignment_id, student_id]);

        if (existing.length > 0) {
            // Update existing
            db.run("UPDATE submissions SET file_name = ?, file_path = ?, updated_at = datetime('now'), status = 'pending' WHERE assignment_id = ? AND student_id = ?",
                [file_name, file_path, assignment_id, student_id]);
        } else {
            // Insert new
            db.run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, submitted_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
                [assignment_id, student_id, file_name, file_path]);
        }
        saveDb();

        // Return the submission
        const rows = getRows(db, 'SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?',
            [assignment_id, student_id]);
        res.status(201).json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/submissions/:id - Update submission
router.put('/:id', upload.single('file'), (req, res, next) => {
    try {
        const db = getDb();
        const { status, grade, feedback } = req.body;
        const updates = [];
        const params = [];

        if (req.file) {
            updates.push('file_name = ?', 'file_path = ?');
            params.push(req.file.originalname, req.file.filename);
        }
        if (status) {
            updates.push('status = ?');
            params.push(status);
        }
        if (grade !== undefined) {
            updates.push('grade = ?');
            params.push(parseFloat(grade));
        }
        if (feedback !== undefined) {
            updates.push('feedback = ?');
            params.push(feedback);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        updates.push("updated_at = datetime('now')");
        params.push(parseInt(req.params.id));

        db.run(`UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`, params);
        saveDb();

        const rows = getRows(db, 'SELECT * FROM submissions WHERE id = ?', [parseInt(req.params.id)]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/submissions/:id - Delete submission
router.delete('/:id', (req, res, next) => {
    try {
        const db = getDb();
        const rows = getRows(db, 'SELECT * FROM submissions WHERE id = ?', [parseInt(req.params.id)]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        // Delete file
        const filePath = path.join(uploadsDir, rows[0].file_path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        db.run('DELETE FROM submissions WHERE id = ?', [parseInt(req.params.id)]);
        saveDb();
        res.json({ message: 'Submission deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
