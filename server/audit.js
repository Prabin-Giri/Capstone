const { isMySQL } = require('./db');

function getClientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length) {
        return xf.split(',')[0].trim().slice(0, 128);
    }
    const raw = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
    return String(raw).slice(0, 128);
}

function getUserAgent(req) {
    const u = req.headers['user-agent'];
    return typeof u === 'string' ? u.slice(0, 512) : '';
}

/**
 * @param {import('mysql2/promise').Pool | { execute: Function }} db
 * @param {{ email: string, userId?: string|null, success: boolean, reason?: string|null, ip?: string, userAgent?: string }} p
 */
async function recordLoginAttempt(db, { email, userId, success, reason, ip, userAgent }) {
    try {
        await db.execute(
            `INSERT INTO login_audit (email, user_id, outcome, reason, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
            [email, userId || null, success ? 'success' : 'failed', reason || null, ip || null, userAgent || null]
        );
    } catch (e) {
        console.warn('[audit] login_audit:', e.message);
    }
}

/**
 * @param {import('mysql2/promise').Pool | { execute: Function }} db
 */
async function recordActivity(db, { userId, action, detail, ip }) {
    try {
        const d = detail != null ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null;
        await db.execute(`INSERT INTO activity_log (user_id, action, detail, ip) VALUES (?, ?, ?, ?)`, [
            userId || null,
            String(action).slice(0, 128),
            d,
            ip || null,
        ]);
    } catch (e) {
        console.warn('[audit] activity_log:', e.message);
    }
}

async function touchUserLastSeen(db, userId) {
    try {
        if (isMySQL) {
            await db.execute('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [userId]);
        } else {
            await db.execute('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
        }
    } catch (e) {
        /* last_seen_at optional */
    }
}

module.exports = {
    getClientIp,
    getUserAgent,
    recordLoginAttempt,
    recordActivity,
    touchUserLastSeen,
};
