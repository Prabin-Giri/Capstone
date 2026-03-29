const express = require('express');
const router = express.Router();
const { query, run, getDb } = require('../db');

// ---------- helpers ----------

// Get all course IDs a user belongs to (as student, ta, or instructor)
async function getUserCourseIds(userId) {
    const enrolled = await query(
        'SELECT course_id FROM course_enrollments WHERE student_id = ?', [userId]
    );
    const ta = await query(
        'SELECT course_id FROM course_tas WHERE ta_id = ?', [userId]
    );
    const instructor = await query(
        'SELECT id AS course_id FROM courses WHERE instructor_id = ?', [userId]
    );
    const set = new Set();
    [...enrolled, ...ta, ...instructor].forEach(r => set.add(r.course_id));
    return [...set];
}

// Get users the caller can message (same-course peers, instructors, TAs)
router.get('/contacts', async (req, res) => {
    try {
        const { userId, courseId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        let courseIds;
        if (courseId) {
            courseIds = [courseId];
        } else {
            courseIds = await getUserCourseIds(userId);
        }
        if (courseIds.length === 0) return res.json([]);

        const placeholders = courseIds.map(() => '?').join(',');

        // enrolled students
        const students = await query(
            `SELECT DISTINCT u.id, u.name, u.email, u.role, u.profile_picture
             FROM users u
             JOIN course_enrollments ce ON u.id = ce.student_id
             WHERE ce.course_id IN (${placeholders})`,
            courseIds
        );
        // TAs
        const tas = await query(
            `SELECT DISTINCT u.id, u.name, u.email, u.role, u.profile_picture
             FROM users u
             JOIN course_tas ct ON u.id = ct.ta_id
             WHERE ct.course_id IN (${placeholders})`,
            courseIds
        );
        // Instructors
        const instructors = await query(
            `SELECT DISTINCT u.id, u.name, u.email, u.role, u.profile_picture
             FROM users u
             JOIN courses c ON u.id = c.instructor_id
             WHERE c.id IN (${placeholders})`,
            courseIds
        );

        const seen = new Set();
        const contacts = [];
        for (const u of [...students, ...tas, ...instructors]) {
            if (u.id === userId || seen.has(u.id)) continue;
            seen.add(u.id);
            contacts.push(u);
        }
        contacts.sort((a, b) => a.name.localeCompare(b.name));
        res.json(contacts);
    } catch (err) {
        console.error('GET /messages/contacts', err);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

// ---------- conversations ----------

// List conversations for a user (with latest message + unread count)
router.get('/conversations', async (req, res) => {
    try {
        const { userId, filter } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        let where = 'cp.user_id = ? AND cp.is_deleted = 0';
        const params = [userId];

        if (filter === 'unread') {
            where += ' AND (cp.last_read_at IS NULL OR cp.last_read_at < c.updated_at)';
        } else if (filter === 'starred') {
            where += ' AND cp.is_starred = 1';
        } else if (filter === 'archived') {
            where += ' AND cp.is_archived = 1';
        } else if (filter === 'sent') {
            where += ' AND c.created_by = ?';
            params.push(userId);
        } else {
            // inbox default: not archived
            where += ' AND cp.is_archived = 0';
        }

        const conversations = await query(
            `SELECT c.id, c.course_id, c.subject, c.created_by, c.created_at, c.updated_at,
                    cp.is_starred, cp.is_archived, cp.last_read_at,
                    co.name AS course_name,
                    creator.name AS created_by_name
             FROM conversations c
             JOIN conversation_participants cp ON c.id = cp.conversation_id
             LEFT JOIN courses co ON c.course_id = co.id
             LEFT JOIN users creator ON c.created_by = creator.id
             WHERE ${where}
             ORDER BY c.updated_at DESC`,
            params
        );

        // Fetch latest message and participant names for each conversation
        for (const conv of conversations) {
            const msgs = await query(
                `SELECT m.body, m.created_at, u.name AS sender_name
                 FROM messages m
                 JOIN users u ON m.sender_id = u.id
                 WHERE m.conversation_id = ?
                 ORDER BY m.created_at DESC LIMIT 1`,
                [conv.id]
            );
            conv.last_message = msgs[0] || null;

            // unread count
            const unreadRows = await query(
                `SELECT COUNT(*) AS cnt FROM messages
                 WHERE conversation_id = ? AND created_at > COALESCE(?, '1970-01-01')`,
                [conv.id, conv.last_read_at]
            );
            conv.unread_count = unreadRows[0]?.cnt || 0;

            // participants
            const parts = await query(
                `SELECT u.id, u.name, u.profile_picture
                 FROM conversation_participants cp
                 JOIN users u ON cp.user_id = u.id
                 WHERE cp.conversation_id = ? AND cp.is_deleted = 0`,
                [conv.id]
            );
            conv.participants = parts;
        }

        res.json(conversations);
    } catch (err) {
        console.error('GET /messages/conversations', err);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Create a new conversation (compose)
router.post('/conversations', async (req, res) => {
    try {
        const { courseId, subject, createdBy, recipientIds, body } = req.body;
        if (!courseId || !subject || !createdBy || !recipientIds || !body) {
            return res.status(400).json({ error: 'courseId, subject, createdBy, recipientIds[], body are required' });
        }

        const pool = getDb();

        const [result] = await pool.execute(
            'INSERT INTO conversations (course_id, subject, created_by) VALUES (?, ?, ?)',
            [courseId, subject, createdBy]
        );
        const convId = result.insertId;

        // Add all participants (sender + recipients)
        const allParticipants = new Set([createdBy, ...recipientIds]);
        for (const uid of allParticipants) {
            await pool.execute(
                'INSERT INTO conversation_participants (conversation_id, user_id, last_read_at) VALUES (?, ?, ?)',
                [convId, uid, uid === createdBy ? new Date() : null]
            );
        }

        // Insert the first message
        await pool.execute(
            'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)',
            [convId, createdBy, body]
        );

        // Update conversation timestamp
        await pool.execute(
            'UPDATE conversations SET updated_at = NOW() WHERE id = ?',
            [convId]
        );

        res.status(201).json({ id: convId, message: 'Conversation created' });
    } catch (err) {
        console.error('POST /messages/conversations', err);
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});

// ---------- messages within a conversation ----------

// Get all messages in a conversation
router.get('/conversations/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;

        const messages = await query(
            `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
                    u.name AS sender_name, u.profile_picture AS sender_picture
             FROM messages m
             JOIN users u ON m.sender_id = u.id
             WHERE m.conversation_id = ?
             ORDER BY m.created_at ASC`,
            [id]
        );

        // Mark as read
        if (userId) {
            const pool = getDb();
            await pool.execute(
                'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
                [id, userId]
            );
        }

        res.json(messages);
    } catch (err) {
        console.error('GET /messages/conversations/:id/messages', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Reply to a conversation
router.post('/conversations/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        const { senderId, body } = req.body;
        if (!senderId || !body) return res.status(400).json({ error: 'senderId and body required' });

        const pool = getDb();
        await pool.execute(
            'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)',
            [id, senderId, body]
        );

        // Touch conversation updated_at
        await pool.execute(
            'UPDATE conversations SET updated_at = NOW() WHERE id = ?',
            [id]
        );

        // Mark read for sender
        await pool.execute(
            'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
            [id, senderId]
        );

        res.status(201).json({ message: 'Reply sent' });
    } catch (err) {
        console.error('POST /messages/conversations/:id/messages', err);
        res.status(500).json({ error: 'Failed to send reply' });
    }
});

// ---------- conversation actions ----------

// Star / unstar
router.patch('/conversations/:id/star', async (req, res) => {
    try {
        const { userId, starred } = req.body;
        const pool = getDb();
        await pool.execute(
            'UPDATE conversation_participants SET is_starred = ? WHERE conversation_id = ? AND user_id = ?',
            [starred ? 1 : 0, req.params.id, userId]
        );
        res.json({ message: 'Updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update star' });
    }
});

// Archive / unarchive
router.patch('/conversations/:id/archive', async (req, res) => {
    try {
        const { userId, archived } = req.body;
        const pool = getDb();
        await pool.execute(
            'UPDATE conversation_participants SET is_archived = ? WHERE conversation_id = ? AND user_id = ?',
            [archived ? 1 : 0, req.params.id, userId]
        );
        res.json({ message: 'Updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update archive' });
    }
});

// Soft-delete
router.delete('/conversations/:id', async (req, res) => {
    try {
        const { userId } = req.body;
        const pool = getDb();
        await pool.execute(
            'UPDATE conversation_participants SET is_deleted = 1 WHERE conversation_id = ? AND user_id = ?',
            [req.params.id, userId]
        );
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete' });
    }
});

// Unread count for badge
router.get('/unread-count', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        const rows = await query(
            `SELECT COUNT(DISTINCT c.id) AS cnt
             FROM conversations c
             JOIN conversation_participants cp ON c.id = cp.conversation_id
             WHERE cp.user_id = ? AND cp.is_deleted = 0 AND cp.is_archived = 0
               AND (cp.last_read_at IS NULL OR cp.last_read_at < c.updated_at)`,
            [userId]
        );
        res.json({ count: rows[0]?.cnt || 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

module.exports = router;
