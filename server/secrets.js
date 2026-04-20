const crypto = require('crypto');

const SECRET_HASH_RE = /^h1_[a-f0-9]{64}$/i;
const FALLBACK_SECRET_HASH_KEY = 'agnos-default-secret-hash-key-change-me';
let warnedMissingKey = false;

const SECRET_PURPOSES = Object.freeze({
    EMAIL_VERIFICATION_TOKEN: 'email_verification_token',
    EMAIL_VERIFICATION_OTP: 'email_verification_otp',
    PASSWORD_RESET_TOKEN: 'password_reset_token',
});

function getSecretHashKey() {
    const configured = String(
        process.env.SECRET_HASH_KEY
        || process.env.AUTH_SECRET
        || process.env.JWT_SECRET
        || process.env.SESSION_SECRET
        || ''
    ).trim();
    if (configured) return configured;
    if (!warnedMissingKey) {
        console.warn('[security] SECRET_HASH_KEY/AUTH_SECRET is not set. Using a fallback key for hashing transient auth secrets.');
        warnedMissingKey = true;
    }
    return FALLBACK_SECRET_HASH_KEY;
}

function isStoredSecretHash(value) {
    return typeof value === 'string' && SECRET_HASH_RE.test(value);
}

function hashStoredSecret(value, purpose = 'generic') {
    if (value == null) return null;
    const normalized = String(value);
    if (normalized.length === 0) return null;
    const digest = crypto
        .createHmac('sha256', getSecretHashKey())
        .update(`${purpose}:${normalized}`)
        .digest('hex');
    return `h1_${digest}`;
}

function verifyStoredSecret(candidate, storedValue, purpose = 'generic') {
    if (typeof storedValue !== 'string' || storedValue.length === 0) return false;
    const candidateText = String(candidate ?? '');

    if (isStoredSecretHash(storedValue)) {
        const expectedHash = hashStoredSecret(candidateText, purpose);
        const a = Buffer.from(expectedHash);
        const b = Buffer.from(storedValue);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    }

    // Legacy plaintext compatibility (migrated at startup).
    return candidateText === storedValue;
}

module.exports = {
    SECRET_PURPOSES,
    isStoredSecretHash,
    hashStoredSecret,
    verifyStoredSecret,
};
