const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, queryToObjects, queryOne, isMySQL } = require('../db');
const { uploadToS3, getFromS3, deleteFromS3, s3Enabled } = require('../s3');
const aiDetectorRouter = require('./aiDetector');
const assignmentsRouter = require('./assignments');

// ── Local disk fallback (for local dev without S3) ─────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Use memory storage: we decide where to write after multer parses the request
const upload = multer({ storage: multer.memoryStorage() });

// ── Key helpers ────────────────────────────────────────────────────────────
function submissionKey(submissionId, filename) {
    return `submissions/${submissionId}/${filename}`;
}

function parseStoredFiles(filePath, fileName) {
    try {
        let parsed = JSON.parse(filePath);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        // Legacy single-file rows store a bare path string.
    }
    return [{ name: fileName, path: filePath }];
}

function findStoredFile(files, filename) {
    return files.find((file) => (
        file?.name === filename ||
        file?.path === filename ||
        path.basename(file?.path || '') === filename
    ));
}

/**
 * Persist a single file: to S3 if configured, otherwise local disk.
 * Returns the value to store in `file_path` column (S3 key or local filename).
 */
async function persistFile(buffer, originalName, submissionId) {
    if (s3Enabled) {
        const key = submissionKey(submissionId, originalName);
        await uploadToS3(key, buffer);
        return key; // stored as S3 key
    } else {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + '-' + originalName;
        fs.writeFileSync(path.join(uploadsDir, uniqueName), buffer);
        return uniqueName; // stored as filename
    }
}

function autoChecksEnabled() {
    return !/^(0|false|no)$/i.test(String(process.env.AUTO_ANALYSIS_ON_SUBMISSION || 'true'));
}

function triggerSubmissionAutoAnalysis({ assignmentId, submissionIds }) {
    if (!autoChecksEnabled()) return;
    const ids = Array.from(new Set((submissionIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id))));
    if (!assignmentId || ids.length === 0) return;

    setImmediate(async () => {
        try {
            if (typeof aiDetectorRouter.runSubmissionDetectionInternal === 'function') {
                for (const id of ids) {
                    try {
                        await aiDetectorRouter.runSubmissionDetectionInternal(id, { batch: true });
                    } catch (err) {
                        console.warn(`[auto-analysis] AI detection failed for submission ${id}:`, err.message || err);
                    }
                }
            }

            if (typeof assignmentsRouter.runPlagiarismCheckInternal === 'function') {
                try {
                    await assignmentsRouter.runPlagiarismCheckInternal(String(assignmentId));
                } catch (err) {
                    console.warn(`[auto-analysis] Plagiarism check failed for assignment ${assignmentId}:`, err.message || err);
                }
            }
        } catch (err) {
            console.warn('[auto-analysis] Unexpected auto-analysis error:', err.message || err);
        }
    });
}

// GET /api/submissions - Get all submissions (optionally filter)
router.get('/', async (req, res, next) => {
    try {
        const db = getDb();
        const { assignment_id, student_id } = req.query;
        const timeField = (f) => isMySQL ? `DATE_FORMAT(${f}, '%Y-%m-%dT%H:%i:%sZ')` : f;
        let sql = `SELECT submissions.*, ${timeField('submissions.submitted_at')} AS submitted_at, ${timeField('submissions.updated_at')} AS updated_at, users.name as student_name, users.profile_picture as student_profile_picture FROM submissions LEFT JOIN users ON submissions.student_id = users.id WHERE 1=1`;
        const params = [];

        if (assignment_id) { sql += ' AND submissions.assignment_id = ?'; params.push(assignment_id); }
        if (student_id)    { sql += ' AND submissions.student_id = ?';    params.push(student_id); }
        sql += ' ORDER BY submissions.submitted_at DESC';

        const result = await db.execute(sql, params);
        res.json(queryToObjects(result));
    } catch (err) { next(err); }
});

// GET /api/submissions/:id - Get single submission
router.get('/:id', async (req, res, next) => {
    try {
        const db = getDb();
        const timeField = (f) => isMySQL ? `DATE_FORMAT(${f}, '%Y-%m-%dT%H:%i:%sZ')` : f;
        const result = await db.execute(
            `SELECT submissions.*, ${timeField('submissions.submitted_at')} AS submitted_at, ${timeField('submissions.updated_at')} AS updated_at, users.name as student_name, users.profile_picture as student_profile_picture FROM submissions LEFT JOIN users ON submissions.student_id = users.id WHERE submissions.id = ?`,
            [req.params.id]
        );
        const row = queryOne(result);
        if (!row) return res.status(404).json({ error: 'Submission not found' });
        res.json(row);
    } catch (err) { next(err); }
});

// GET /api/submissions/:id/file/:filename — Proxy file content for preview
// Replaces the old express.static('/uploads') endpoint from the frontend's perspective.
router.get('/:id/file/:filename', async (req, res, next) => {
    try {
        const { id, filename } = req.params;
        const db = getDb();
        const [rows] = await db.execute('SELECT file_name, file_path FROM submissions WHERE id = ?', [id]);
        if (!rows || rows.length === 0) return res.status(404).send('Submission not found');

        const files = parseStoredFiles(rows[0].file_path, rows[0].file_name);
        const matchedFile = findStoredFile(files, filename);
        const storedPath = matchedFile?.path;

        if (s3Enabled) {
            const candidateKeys = [
                storedPath,
                submissionKey(id, filename),
            ].filter((value, index, list) => value && list.indexOf(value) === index);

            for (const key of candidateKeys) {
                try {
                    const buffer = await getFromS3(key);
                    res.set('Content-Type', 'text/plain; charset=utf-8');
                    res.set('Access-Control-Allow-Origin', '*');
                    return res.send(buffer);
                } catch (err) {
                    // Try the next possible key, then fall through to local fallback.
                }
            }
        }

        // Local fallback: use the stored disk filename when available.
        const localCandidates = [
            storedPath,
            matchedFile?.path ? path.basename(matchedFile.path) : null,
            rows[0].file_path,
            filename,
        ]
            .filter((value, index, list) => value && list.indexOf(value) === index)
            .map((value) => path.join(uploadsDir, value));

        const localPath = localCandidates.find((candidate) => fs.existsSync(candidate));
        if (!localPath) return res.status(404).send('File not found');
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.set('Access-Control-Allow-Origin', '*');
        res.sendFile(localPath);
    } catch (err) { next(err); }
});

// POST /api/submissions - Create new submission (with file array)
router.post('/', upload.array('files'), async (req, res, next) => {
    try {
        const db = getDb();
        const { assignment_id, student_id } = req.body;

        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
        if (!assignment_id || !student_id) return res.status(400).json({ error: 'assignment_id and student_id are required' });

        // Check if assignment is group one_for_all (need to know target student IDs before we can build keys)
        const [aRows] = await db.execute('SELECT type, group_submission_type FROM assignments WHERE id = ?', [assignment_id]);
        const assignment = aRows[0];

        let targetStudentIds = [student_id];
        if (assignment && assignment.type === 'group' && assignment.group_submission_type === 'one_for_all') {
            const [gRows] = await db.execute(`
                SELECT student_id FROM group_members
                WHERE group_id IN (
                    SELECT group_id FROM group_members
                    JOIN assignment_groups ON group_members.group_id = assignment_groups.id
                    WHERE assignment_groups.assignment_id = ? AND group_members.student_id = ?
                )
            `, [assignment_id, student_id]);
            if (gRows && gRows.length > 0) targetStudentIds = gRows.map(r => r.student_id);
        }

        // Insert a placeholder row to get the submission ID (needed for S3 key)
        await db.execute(
            "INSERT INTO submissions (assignment_id, student_id, file_name, file_path) VALUES (?, ?, ?, ?)",
            [assignment_id, student_id, 'uploading...', '']
        );
        const [idRows] = await db.execute(
            'SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1',
            [assignment_id, student_id]
        );
        const newId = idRows[0].id;

        // Now persist files using that ID
        const filesData = await Promise.all(req.files.map(async (f) => {
            const storedPath = await persistFile(f.buffer, f.originalname, newId);
            return { name: f.originalname, path: storedPath };
        }));

        const file_name = `${req.files.length} file${req.files.length > 1 ? 's' : ''}`;
        const file_path = JSON.stringify(filesData);

        await db.execute(
            'UPDATE submissions SET file_name = ?, file_path = ? WHERE id = ?',
            [file_name, file_path, newId]
        );

        const createdSubmissionIds = [newId];

        // If group, insert copies for other members
        for (const tid of targetStudentIds) {
            if (tid === student_id) continue;
            await db.execute(
                "INSERT INTO submissions (assignment_id, student_id, file_name, file_path) VALUES (?, ?, ?, ?)",
                [assignment_id, tid, file_name, file_path]
            );
            const [copyRows] = await db.execute(
                'SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1',
                [assignment_id, tid]
            );
            if (copyRows && copyRows[0] && copyRows[0].id != null) {
                createdSubmissionIds.push(copyRows[0].id);
            }
        }

        const [rows] = await db.execute(
            'SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1',
            [assignment_id, student_id]
        );
        triggerSubmissionAutoAnalysis({
            assignmentId: assignment_id,
            submissionIds: createdSubmissionIds,
        });

        res.status(201).json(rows[0]);
    } catch (err) { next(err); }
});

// PUT /api/submissions/:id - Update submission
router.put('/:id', upload.array('files'), async (req, res, next) => {
    try {
        const db = getDb();
        const { status, grade, feedback } = req.body;
        const updates = [];
        const params = [];

        if (req.files && req.files.length > 0) {
            const filesData = await Promise.all(req.files.map(async (f) => {
                const storedPath = await persistFile(f.buffer, f.originalname, req.params.id);
                return { name: f.originalname, path: storedPath };
            }));
            updates.push('file_name = ?', 'file_path = ?');
            params.push(`${req.files.length} file${req.files.length > 1 ? 's' : ''}`, JSON.stringify(filesData));
        }
        if (status)            { updates.push('status = ?');   params.push(status); }
        if (grade !== undefined) { updates.push('grade = ?');  params.push(grade === null || grade === '' ? null : parseFloat(grade)); }
        if (feedback !== undefined) { updates.push('feedback = ?'); params.push(feedback); }

        if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });

        params.push(req.params.id);
        await db.execute(`UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`, params);

        // SYNC GRADES FOR GROUP ASSIGNMENTS (one_for_all)
        const [currRows] = await db.execute('SELECT assignment_id, student_id FROM submissions WHERE id = ?', [req.params.id]);
        if (currRows.length > 0) {
            const { assignment_id, student_id } = currRows[0];
            const [aRows] = await db.execute('SELECT type, group_submission_type FROM assignments WHERE id = ?', [assignment_id]);
            const assignment = aRows[0];
            const sync_group = req.body.sync_group === 'true';
            if (assignment && assignment.type === 'group' && assignment.group_submission_type === 'one_for_all' && sync_group) {
                const [gRows] = await db.execute(`
                    SELECT student_id FROM group_members
                    WHERE group_id IN (
                        SELECT group_id FROM group_members
                        JOIN assignment_groups ON group_members.group_id = assignment_groups.id
                        WHERE assignment_groups.assignment_id = ? AND group_members.student_id = ?
                    )
                `, [assignment_id, student_id]);
                if (gRows && gRows.length > 0) {
                    const memberIds = gRows.map(r => r.student_id);
                    for (const mid of memberIds) {
                        if (mid === student_id) continue;
                        const [lastRows] = await db.execute('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1', [assignment_id, mid]);
                        if (lastRows.length > 0) {
                            const syncParams = [...params.slice(0, -1), lastRows[0].id];
                            await db.execute(`UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`, syncParams);
                        }
                    }
                }
            }
        }

        const [rows] = await db.execute('SELECT * FROM submissions WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Submission not found' });
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// DELETE /api/submissions/:id - Delete submission
router.delete('/:id', async (req, res, next) => {
    try {
        const db = getDb();
        const [rows] = await db.execute('SELECT * FROM submissions WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Submission not found' });

        // Delete file(s) from S3 or local disk
        try {
            const filesData = JSON.parse(rows[0].file_path);
            if (Array.isArray(filesData)) {
                for (const f of filesData) {
                    if (s3Enabled) {
                        await deleteFromS3(f.path).catch(() => {});
                    } else {
                        const localPath = path.join(uploadsDir, f.path);
                        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                    }
                }
            }
        } catch {
            // Fallback for older non-JSON entries
            if (!s3Enabled) {
                const localPath = path.join(uploadsDir, rows[0].file_path);
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
            }
        }

        await db.execute('DELETE FROM submissions WHERE id = ?', [req.params.id]);
        res.json({ message: 'Submission deleted successfully' });
    } catch (err) { next(err); }
});

module.exports = router;
