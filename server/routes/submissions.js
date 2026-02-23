const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, run, saveDb } = require('../db');

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

// GET /api/submissions - Get all submissions (optionally filter)
router.get('/', async (req, res, next) => {
    try {
        const { assignment_id, student_id } = req.query;
        let sql = 'SELECT * FROM submissions WHERE 1=1';
        const params = [];
        if (assignment_id) { sql += ' AND assignment_id = ?'; params.push(assignment_id); }
        if (student_id) { sql += ' AND student_id = ?'; params.push(student_id); }
        sql += ' ORDER BY submitted_at DESC';
        const rows = await query(sql, params);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /api/submissions/:id - Get single submission
router.get('/:id', async (req, res, next) => {
    try {
        const rows = await query('SELECT * FROM submissions WHERE id = ?', [parseInt(req.params.id)]);
        if (rows.length === 0) return res.status(404).json({ error: 'Submission not found' });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST /api/submissions - Create new submission (code file required; optional second file)
router.post('/', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'testCasesFile', maxCount: 1 }]), async (req, res, next) => {
    try {
        const { assignment_id, student_id } = req.body;
        const mainFile = req.files && req.files['file'] && req.files['file'][0];
        const testCasesFile = req.files && req.files['testCasesFile'] && req.files['testCasesFile'][0];

        if (!mainFile) return res.status(400).json({ error: 'No file uploaded' });
        if (!assignment_id || !student_id) return res.status(400).json({ error: 'assignment_id and student_id are required' });

        const file_name = mainFile.originalname;
        const file_path = mainFile.filename;
        const file_name_2 = testCasesFile ? testCasesFile.originalname : null;
        const file_path_2 = testCasesFile ? testCasesFile.filename : null;

        const existing = await query('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?', [assignment_id, student_id]);
        if (existing.length > 0) {
            await run("UPDATE submissions SET file_name = ?, file_path = ?, file_name_2 = ?, file_path_2 = ?, updated_at = CURRENT_TIMESTAMP, status = 'pending' WHERE assignment_id = ? AND student_id = ?",
                [file_name, file_path, file_name_2, file_path_2, assignment_id, student_id]);
        } else {
            await run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, file_name_2, file_path_2, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                [assignment_id, student_id, file_name, file_path, file_name_2, file_path_2]);
        }
        await saveDb();

        const rows = await query('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?', [assignment_id, student_id]);
        res.status(201).json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/submissions/:id - Update submission (supports rubric: style_points, efficiency_points, deduction_points)
router.put('/:id', upload.single('file'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { status, grade, feedback, style_points, efficiency_points, deduction_points } = req.body;
        const updates = [];
        const params = [];

        if (req.files && req.files.length > 0) {
            const filesData = req.files.map(f => ({
                name: f.originalname,
                path: f.filename
            }));
            updates.push('file_name = ?', 'file_path = ?');
            params.push(`${req.files.length} file${req.files.length > 1 ? 's' : ''}`, JSON.stringify(filesData));
        }
        if (status) { updates.push('status = ?'); params.push(status); }
        if (feedback !== undefined) { updates.push('feedback = ?'); params.push(feedback); }
        if (style_points !== undefined) { updates.push('style_points = ?'); params.push(style_points === '' || style_points === null ? null : parseFloat(style_points)); }
        if (efficiency_points !== undefined) { updates.push('efficiency_points = ?'); params.push(efficiency_points === '' || efficiency_points === null ? null : parseFloat(efficiency_points)); }
        if (deduction_points !== undefined) { updates.push('deduction_points = ?'); params.push(parseFloat(deduction_points) || 0); }

        if (style_points !== undefined || efficiency_points !== undefined || deduction_points !== undefined) {
            const subRows = await query('SELECT * FROM submissions WHERE id = ?', [id]);
            if (subRows.length > 0) {
                const sub = subRows[0];
                const assignRows = await query('SELECT * FROM assignments WHERE id = ?', [sub.assignment_id]);
                const tcRows = await query('SELECT points FROM test_cases WHERE assignment_id = ?', [sub.assignment_id]);
                const maxPossible = tcRows.reduce((s, r) => s + (Number(r.points) || 0), 0);
                const stylePossible = assignRows.length ? (Number(assignRows[0].style_points_possible) || 0) : 0;
                const efficiencyPossible = assignRows.length ? (Number(assignRows[0].efficiency_points_possible) || 0) : 0;
                const totalPossible = maxPossible + stylePossible + efficiencyPossible;
                const correctness = sub.correctness_score != null ? Number(sub.correctness_score) : 0;
                const stylePts = style_points !== undefined && style_points !== '' && style_points !== null ? parseFloat(style_points) : (sub.style_points != null ? Number(sub.style_points) : 0);
                const effPts = efficiency_points !== undefined && efficiency_points !== '' && efficiency_points !== null ? parseFloat(efficiency_points) : (sub.efficiency_points != null ? Number(sub.efficiency_points) : 0);
                const dedPts = deduction_points !== undefined ? (parseFloat(deduction_points) || 0) : (Number(sub.deduction_points) || 0);
                const rubricTotal = correctness + stylePts + effPts - dedPts;
                const computedGrade = totalPossible > 0 ? Math.round((rubricTotal / totalPossible) * 10000) / 100 : null;
                updates.push('grade = ?');
                params.push(computedGrade);
            }
        } else if (grade !== undefined) {
            updates.push('grade = ?');
            params.push(parseFloat(grade));
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        await run(`UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`, params);
        await saveDb();

        const rows = await query('SELECT * FROM submissions WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Submission not found' });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/submissions/:id - Delete submission
router.delete('/:id', async (req, res, next) => {
    try {
        const rows = await query('SELECT * FROM submissions WHERE id = ?', [parseInt(req.params.id)]);
        if (rows.length === 0) return res.status(404).json({ error: 'Submission not found' });
        const filePath = path.join(uploadsDir, rows[0].file_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        await run('DELETE FROM submissions WHERE id = ?', [parseInt(req.params.id)]);
        await saveDb();
        res.json({ message: 'Submission deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
