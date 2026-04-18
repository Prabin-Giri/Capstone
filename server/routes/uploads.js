const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, queryOne } = require('../db');
const { uploadToS3, getFromS3, deleteFromS3, s3Enabled } = require('../s3');

// ── Local disk fallback ─────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ storage: multer.memoryStorage() });

function uploadCourseId(req) {
    try {
        return decodeURIComponent(String(req.params.courseId || '').trim());
    } catch (_) {
        return String(req.params.courseId || '').trim();
    }
}

/** Write to S3 or local disk, returning the stored path/key */
async function persistFile(buffer, originalName, category) {
    if (s3Enabled) {
        const key = `uploads/${category}/${Date.now()}-${originalName}`;
        await uploadToS3(key, buffer);
        return key;
    }
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + '-' + originalName;
    fs.writeFileSync(path.join(uploadsDir, uniqueName), buffer);
    return uniqueName;
}

function resolveLocalUploadPath(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/').trim();
    if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
        return null;
    }
    const candidate = path.join(uploadsDir, normalized);
    const resolved = path.resolve(candidate);
    const allowedRoot = path.resolve(uploadsDir) + path.sep;
    if (resolved === path.resolve(uploadsDir) || resolved.startsWith(allowedRoot)) {
        return resolved;
    }
    return null;
}

// Helper to update document path in DB
const updateDocumentPath = async (courseId, column, filePath) => {
    const db = getDb();
    const [rows] = await db.execute('SELECT course_id FROM course_documents WHERE course_id = ?', [courseId]);
    if (rows.length > 0) {
        await db.execute(`UPDATE course_documents SET ${column} = ? WHERE course_id = ?`, [filePath, courseId]);
    } else {
        await db.execute(`INSERT INTO course_documents (course_id, ${column}) VALUES (?, ?)`, [courseId, filePath]);
    }
};

// POST /api/uploads/syllabus/:courseId
router.post('/syllabus/:courseId', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const cid = uploadCourseId(req);
        const storedPath = await persistFile(req.file.buffer, req.file.originalname, `course-docs/${cid}/syllabus`);
        await updateDocumentPath(cid, 'syllabus_path', storedPath);
        res.json({ message: 'Syllabus uploaded successfully', filePath: storedPath });
    } catch (err) { next(err); }
});

// POST /api/uploads/schedule/:courseId
router.post('/schedule/:courseId', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const cid = uploadCourseId(req);
        const storedPath = await persistFile(req.file.buffer, req.file.originalname, `course-docs/${cid}/schedule`);
        await updateDocumentPath(cid, 'schedule_path', storedPath);
        res.json({ message: 'Schedule uploaded successfully', filePath: storedPath });
    } catch (err) { next(err); }
});

// POST /api/uploads/starter-code
router.post('/starter-code', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const storedPath = await persistFile(req.file.buffer, req.file.originalname, 'starter-code');
        res.json({ message: 'Starter code uploaded successfully', filePath: storedPath });
    } catch (err) { next(err); }
});

// POST /api/uploads/attachments
router.post('/attachments', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const storedPath = await persistFile(req.file.buffer, req.file.originalname, 'attachments');
        res.json({ message: 'Attachment uploaded successfully', filePath: storedPath, originalName: req.file.originalname });
    } catch (err) { next(err); }
});

// GET /api/uploads/documents/:courseId
router.get('/documents/:courseId', async (req, res, next) => {
    try {
        const db = getDb();
        const result = await db.execute('SELECT * FROM course_documents WHERE course_id = ?', [uploadCourseId(req)]);
        const row = queryOne(result);
        res.json(row || {});
    } catch (err) { next(err); }
});

// GET /api/uploads/file?path=...
// Proxy any stored upload path/key through the backend so S3-backed assets
// work without exposing a public uploads directory.
router.get('/file', async (req, res, next) => {
    try {
        const filePath = String(req.query.path || '').trim();
        if (!filePath) return res.status(400).json({ error: 'path is required' });

        if (s3Enabled) {
            try {
                const buffer = await getFromS3(filePath);
                res.type(path.extname(filePath) || 'application/octet-stream');
                res.set('Access-Control-Allow-Origin', '*');
                return res.send(buffer);
            } catch (_) {
                // Fall through to local fallback for legacy files.
            }
        }

        const localPath = resolveLocalUploadPath(path.basename(filePath));
        if (!localPath || !fs.existsSync(localPath)) {
            return res.status(404).send('File not found');
        }
        res.set('Access-Control-Allow-Origin', '*');
        return res.sendFile(localPath);
    } catch (err) { next(err); }
});

function profileUserId(req) {
    try {
        return decodeURIComponent(String(req.params.userId || '').trim());
    } catch (_) {
        return String(req.params.userId || '').trim();
    }
}

// DELETE /api/uploads/profile-picture/:userId
router.delete('/profile-picture/:userId', async (req, res, next) => {
    try {
        const db = getDb();
        const userId = profileUserId(req);
        const [rows] = await db.execute('SELECT profile_picture FROM users WHERE id = ?', [userId]);
        if (rows.length > 0 && rows[0].profile_picture) {
            const pic = rows[0].profile_picture;
            if (s3Enabled) {
                await deleteFromS3(pic).catch(() => {});
            } else {
                const localPath = path.join(uploadsDir, pic);
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
            }
        }
        const [delResult] = await db.execute('UPDATE users SET profile_picture = NULL WHERE id = ?', [userId]);
        if (!delResult.affectedRows) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: 'Profile picture removed successfully' });
    } catch (err) { next(err); }
});

// POST /api/uploads/profile-picture/:userId
router.post('/profile-picture/:userId', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const db = getDb();
        const userId = profileUserId(req);

        // Delete old profile pic
        const [rows] = await db.execute('SELECT profile_picture FROM users WHERE id = ?', [userId]);
        if (rows.length > 0 && rows[0].profile_picture) {
            const old = rows[0].profile_picture;
            if (s3Enabled) {
                await deleteFromS3(old).catch(() => {});
            } else {
                const localPath = path.join(uploadsDir, old);
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
            }
        }

        const storedPath = await persistFile(req.file.buffer, req.file.originalname, `profile-pictures/${userId}`);
        const [upd] = await db.execute('UPDATE users SET profile_picture = ? WHERE id = ?', [storedPath, userId]);
        if (!upd.affectedRows) {
            return res.status(404).json({ error: 'User not found — profile was not saved. Check that your account ID matches the server.' });
        }
        res.json({ message: 'Profile picture updated successfully', filePath: storedPath });
    } catch (err) { next(err); }
});

module.exports = router;
