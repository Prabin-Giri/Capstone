/**
 * s3.js — Thin AWS S3 helper for AutoGrade backend.
 *
 * Required env vars:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION          (e.g. us-east-2)
 *   AWS_S3_BUCKET       (e.g. autograde-uploads)
 *
 * If these vars are missing, uploads fall back to local disk so local dev
 * still works without AWS credentials.
 */

const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION || 'us-east-2';

const s3Enabled = !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    BUCKET
);

let _client = null;
function getClient() {
    if (!_client) {
        _client = new S3Client({
            region: REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
    }
    return _client;
}

/**
 * Upload a buffer or string to S3.
 * @param {string} key  - S3 object key (e.g. "submissions/42/main.py")
 * @param {Buffer|string} body - File content
 * @param {string} [contentType] - MIME type (default "application/octet-stream")
 */
async function uploadToS3(key, body, contentType = 'application/octet-stream') {
    if (!s3Enabled) throw new Error('S3 not configured (missing AWS env vars)');
    const client = getClient();
    await client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: typeof body === 'string' ? Buffer.from(body) : body,
        ContentType: contentType,
    }));
    return key;
}

/**
 * Download an S3 object and return its content as a Buffer.
 * @param {string} key
 * @returns {Promise<Buffer>}
 */
async function getFromS3(key) {
    if (!s3Enabled) throw new Error('S3 not configured (missing AWS env vars)');
    const client = getClient();
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    // Stream -> Buffer
    const chunks = [];
    for await (const chunk of res.Body) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

/**
 * Delete an S3 object. Silently ignores "not found" errors — idempotent.
 * @param {string} key
 */
async function deleteFromS3(key) {
    if (!s3Enabled) return; // no-op in local mode
    try {
        const client = getClient();
        await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (err) {
        if (err.name !== 'NoSuchKey') throw err;
    }
}

/**
 * Generate a temporary pre-signed GET URL for browser preview (default 15 min).
 * @param {string} key
 * @param {number} [expiresIn=900] seconds
 * @returns {Promise<string>} Pre-signed URL
 */
async function getPresignedUrl(key, expiresIn = 900) {
    if (!s3Enabled) throw new Error('S3 not configured');
    const client = getClient();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

module.exports = { uploadToS3, getFromS3, deleteFromS3, getPresignedUrl, s3Enabled };
