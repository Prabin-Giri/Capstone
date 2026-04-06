const fs = require('fs');
const os = require('os');
const path = require('path');
const { getFromS3, s3Enabled } = require('./s3');

const uploadsDir = path.join(__dirname, 'uploads');

function unique(values) {
    return values.filter((value, index, list) => value && list.indexOf(value) === index);
}

function parseStoredFiles(filePath, fileName) {
    try {
        let parsed = JSON.parse(filePath);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        // Legacy rows store a bare path string.
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

function resolveLocalUploadPath(storedPath) {
    const candidates = unique([
        storedPath,
        path.basename(storedPath || ''),
    ]).map((value) => path.join(uploadsDir, value));

    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function readStoredUpload(storedPath) {
    if (!storedPath) throw new Error('No stored upload path provided');

    const localPath = resolveLocalUploadPath(storedPath);
    if (localPath) return fs.readFileSync(localPath);

    if (!s3Enabled) {
        throw new Error(`Stored upload not found locally: ${storedPath}`);
    }

    const candidateKeys = unique([
        storedPath,
        path.basename(storedPath),
    ]);

    for (const key of candidateKeys) {
        try {
            return await getFromS3(key);
        } catch {
            // Try the next key.
        }
    }

    throw new Error(`Stored upload not found in storage: ${storedPath}`);
}

async function ensureLocalUpload(storedPath, opts = {}) {
    const { prefix = 'autograde-upload-', filename } = opts;
    const localPath = resolveLocalUploadPath(storedPath);
    if (localPath) return { path: localPath, isTemp: false, tmpDir: null };

    const buffer = await readStoredUpload(storedPath);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const targetName = filename || path.basename(storedPath) || 'upload.bin';
    const targetPath = path.join(tmpDir, targetName);
    fs.writeFileSync(targetPath, buffer);
    return { path: targetPath, isTemp: true, tmpDir };
}

module.exports = {
    uploadsDir,
    parseStoredFiles,
    findStoredFile,
    resolveLocalUploadPath,
    readStoredUpload,
    ensureLocalUpload,
};
