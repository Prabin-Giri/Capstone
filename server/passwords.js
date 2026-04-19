const bcrypt = require('bcryptjs');

const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function getBcryptRounds() {
    const n = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
    if (!Number.isInteger(n)) return 10;
    if (n < 8) return 8;
    if (n > 14) return 14;
    return n;
}

function isPasswordHash(value) {
    return typeof value === 'string' && BCRYPT_HASH_RE.test(value);
}

async function hashPassword(password) {
    return bcrypt.hash(String(password), getBcryptRounds());
}

async function verifyPassword(candidatePassword, storedPassword) {
    if (typeof storedPassword !== 'string' || storedPassword.length === 0) return false;
    const candidate = String(candidatePassword);
    if (isPasswordHash(storedPassword)) {
        return bcrypt.compare(candidate, storedPassword);
    }
    return storedPassword === candidate;
}

module.exports = {
    isPasswordHash,
    hashPassword,
    verifyPassword,
};

