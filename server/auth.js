const crypto = require('crypto');

const AUTH_TOKEN_TTL_SEC = (() => {
    const raw = parseInt(process.env.AUTH_TOKEN_TTL_SEC || '43200', 10); // 12h
    if (!Number.isFinite(raw) || raw < 300) return 43200;
    if (raw > 60 * 60 * 24 * 14) return 60 * 60 * 24 * 14;
    return raw;
})();

const configuredSecret = String(
    process.env.AUTH_SECRET
    || process.env.JWT_SECRET
    || process.env.SESSION_SECRET
    || ''
).trim();
const authSecret = configuredSecret || crypto.randomBytes(48).toString('hex');
if (!configuredSecret) {
    console.warn('[auth] AUTH_SECRET not set. Generated ephemeral secret; all sessions reset on restart.');
}

function base64UrlEncode(input) {
    const b = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
    return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
    const raw = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw + '='.repeat((4 - (raw.length % 4 || 4)) % 4);
    return Buffer.from(padded, 'base64');
}

function createSignature(payloadB64) {
    return base64UrlEncode(
        crypto.createHmac('sha256', authSecret).update(payloadB64).digest()
    );
}

function timingSafeEqualStr(a, b) {
    const aa = Buffer.from(String(a || ''), 'utf8');
    const bb = Buffer.from(String(b || ''), 'utf8');
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
}

function createAuthToken(user) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: String(user.id || ''),
        role: String(user.role || ''),
        verified: user.verified === true || user.verified === 1,
        email_verified: user.email_verified === true || user.email_verified === 1,
        iat: now,
        exp: now + AUTH_TOKEN_TTL_SEC,
    };
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    return `${payloadB64}.${createSignature(payloadB64)}`;
}

function verifyAuthToken(token) {
    const raw = String(token || '').trim();
    if (!raw || !raw.includes('.')) return null;
    const [payloadB64, sig] = raw.split('.', 2);
    if (!payloadB64 || !sig) return null;
    const expected = createSignature(payloadB64);
    if (!timingSafeEqualStr(sig, expected)) return null;

    try {
        const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
        const now = Math.floor(Date.now() / 1000);
        if (!payload || typeof payload !== 'object') return null;
        if (!payload.sub || !payload.role) return null;
        if (!Number.isFinite(payload.exp) || payload.exp < now) return null;
        return payload;
    } catch {
        return null;
    }
}

function getBearerToken(req) {
    const header = String(req.get('authorization') || '').trim();
    if (!header) return '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : '';
}

function attachAuthContext(req, _res, next) {
    const token = getBearerToken(req);
    const payload = verifyAuthToken(token);
    if (payload) {
        req.auth = {
            userId: String(payload.sub),
            role: String(payload.role),
            verified: !!payload.verified,
            emailVerified: !!payload.email_verified,
            tokenPayload: payload,
        };
    } else {
        req.auth = null;
    }
    next();
}

function requireAuth(req, res, next) {
    if (!req.auth || !req.auth.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

function hasAnyRole(req, ...roles) {
    if (!req.auth || !req.auth.role) return false;
    const role = String(req.auth.role);
    return roles.includes(role);
}

function requireRoles(...roles) {
    const set = new Set(roles.map((r) => String(r)));
    return (req, res, next) => {
        const role = String(req.auth?.role || '');
        if (!set.has(role)) return res.status(403).json({ error: 'Forbidden' });
        next();
    };
}

function requireSelfOrRoles(getOwnerId, ...roles) {
    return (req, res, next) => {
        const actorId = String(req.auth?.userId || '');
        const ownerId = String(getOwnerId(req) || '');
        const actorRole = String(req.auth?.role || '');
        if (ownerId && actorId && ownerId === actorId) return next();
        if (roles.includes(actorRole)) return next();
        return res.status(403).json({ error: 'Forbidden' });
    };
}

module.exports = {
    createAuthToken,
    verifyAuthToken,
    attachAuthContext,
    requireAuth,
    requireRoles,
    requireSelfOrRoles,
    hasAnyRole,
};
