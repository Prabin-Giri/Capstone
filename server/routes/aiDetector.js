const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { getDb } = require('../db');
const { getFromS3, s3Enabled } = require('../s3');

const router = express.Router();
const execFileAsync = promisify(execFile);

const uploadsDir = path.join(__dirname, '../uploads');
const detectorRootDefault = path.join(__dirname, '../../offline_ai_detector');
const detectorScriptDefault = path.join(detectorRootDefault, 'scripts/run_inference.py');
const detectorConfigDefault = path.join(detectorRootDefault, 'configs/inference.yaml');
const DETECTOR_ALLOWED_ROLES = new Set(['faculty', 'ta', 'admin']);
const DETECTOR_LABEL = 'offline_ai_detector';

function parseBooleanEnv(value) {
    return /^(1|true|yes)$/i.test(String(value || ''));
}

function isDetectorEnabled() {
    return parseBooleanEnv(process.env.AI_DETECTOR_ENABLED);
}

function requireDetectorUserContext() {
    return process.env.AI_DETECTOR_REQUIRE_USER !== 'false';
}

function detectorTimeoutMs() {
    const raw = parseInt(process.env.AI_DETECTOR_TIMEOUT_MS || '45000', 10);
    if (!Number.isFinite(raw) || raw <= 0) return 45000;
    return raw;
}

function detectorPythonBin() {
    const envValue = String(process.env.AI_DETECTOR_PYTHON_BIN || '').trim();
    if (envValue) {
        const looksLikePath = envValue.includes('/') || envValue.includes('\\');
        if (!looksLikePath) return envValue;
        if (fs.existsSync(envValue)) return envValue;
    }

    const rootPath = detectorRootPath();
    const localVenvCandidates = [
        path.join(rootPath, '.venv/bin/python'),
        path.join(rootPath, '.venv/Scripts/python.exe'),
    ];
    const localVenvPython = localVenvCandidates.find((candidate) => fs.existsSync(candidate));
    if (localVenvPython) return localVenvPython;

    return 'python3';
}

function detectorRootPath() {
    const envValue = process.env.AI_DETECTOR_ROOT;
    if (!envValue) return detectorRootDefault;
    const candidate = path.isAbsolute(envValue) ? envValue : path.resolve(path.join(__dirname, '..'), envValue);
    if (fs.existsSync(candidate)) return candidate;
    return detectorRootDefault;
}

function detectorScriptPath() {
    const envValue = process.env.AI_DETECTOR_SCRIPT_PATH;
    if (!envValue) return detectorScriptDefault;
    const candidate = path.isAbsolute(envValue) ? envValue : path.resolve(detectorRootPath(), envValue);
    if (fs.existsSync(candidate)) return candidate;
    return detectorScriptDefault;
}

function detectorConfigPath() {
    const envValue = process.env.AI_DETECTOR_CONFIG_PATH;
    if (!envValue) return detectorConfigDefault;
    const candidate = path.isAbsolute(envValue) ? envValue : path.resolve(detectorRootPath(), envValue);
    if (fs.existsSync(candidate)) return candidate;
    return detectorConfigDefault;
}

function detectorModelVersion() {
    const fromEnv = String(process.env.AI_DETECTOR_MODEL_VERSION || '').trim();
    if (fromEnv) return fromEnv;

    try {
        const configText = fs.readFileSync(detectorConfigPath(), 'utf8');
        const modelLine = configText
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.startsWith('model_dir:'));
        if (!modelLine) return null;
        const raw = modelLine.split(':').slice(1).join(':').trim();
        const clean = raw.replace(/^["']|["']$/g, '').trim();
        if (!clean) return null;
        return path.basename(clean);
    } catch {
        return null;
    }
}

function readInferenceRuntimeModelDir(configPath) {
    try {
        const configText = fs.readFileSync(configPath, 'utf8');
        const modelLine = configText
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.startsWith('model_dir:'));
        if (!modelLine) return null;
        const raw = modelLine.split(':').slice(1).join(':').trim();
        const clean = raw.replace(/^["']|["']$/g, '').trim();
        if (!clean) return null;
        return path.isAbsolute(clean) ? clean : path.resolve(detectorRootPath(), clean);
    } catch {
        return null;
    }
}

function detectorRuntimeStatus() {
    const enabled = isDetectorEnabled();
    const rootPath = detectorRootPath();
    const scriptPath = detectorScriptPath();
    const configPath = detectorConfigPath();
    const pythonBin = detectorPythonBin();
    const modelDir = readInferenceRuntimeModelDir(configPath);
    const modelConfigPath = modelDir ? path.join(modelDir, 'config.json') : null;
    const ready = Boolean(
        enabled
        && fs.existsSync(rootPath)
        && fs.existsSync(scriptPath)
        && fs.existsSync(configPath)
        && modelConfigPath
        && fs.existsSync(modelConfigPath)
    );

    let reason = null;
    if (!enabled) reason = 'AI detector is disabled.';
    else if (!fs.existsSync(rootPath)) reason = `Detector root path does not exist: ${rootPath}`;
    else if (!fs.existsSync(scriptPath)) reason = `Detector script is missing: ${scriptPath}`;
    else if (!fs.existsSync(configPath)) reason = `Detector config is missing: ${configPath}`;
    else if (!modelDir) reason = 'Could not resolve model_dir from detector config.';
    else if (!modelConfigPath || !fs.existsSync(modelConfigPath)) {
        reason = `Model checkpoint is missing: ${modelConfigPath || '(unknown model path)'}`;
    }

    return {
        enabled,
        ready,
        reason,
        detector: DETECTOR_LABEL,
        paths: {
            root: rootPath,
            script: scriptPath,
            config: configPath,
            model_dir: modelDir,
            python_bin: pythonBin,
        },
        model_version: detectorModelVersion(),
    };
}

function httpError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function readActorUserId(req) {
    const fromBody = String(req.body?.user_id || '').trim();
    if (fromBody) return fromBody;
    const fromQuery = String(req.query?.user_id || '').trim();
    if (fromQuery) return fromQuery;
    const fromHeader = String(req.get('x-user-id') || '').trim();
    if (fromHeader) return fromHeader;
    return '';
}

async function resolveActor(req, res) {
    if (!requireDetectorUserContext()) {
        return null;
    }

    const actorUserId = readActorUserId(req);
    if (!actorUserId) {
        res.status(401).json({
            error: 'Missing user context. Provide user_id in query/body or x-user-id header.',
        });
        return null;
    }

    const db = getDb();
    const [rows] = await db.execute(
        'SELECT id, role, verified FROM users WHERE id = ? LIMIT 1',
        [actorUserId]
    );

    if (!rows || rows.length === 0) {
        res.status(401).json({ error: 'User not found.' });
        return null;
    }

    const actor = rows[0];
    if (!DETECTOR_ALLOWED_ROLES.has(String(actor.role || ''))) {
        res.status(403).json({ error: 'Only faculty, TA, or admin can run AI detection.' });
        return null;
    }
    if (String(actor.role) === 'faculty' && Number(actor.verified || 0) === 0) {
        res.status(403).json({ error: 'Faculty account is pending verification.' });
        return null;
    }
    return actor;
}

async function fetchSubmissionAccessRow(submissionId) {
    const db = getDb();
    const [rows] = await db.execute(
        `SELECT
            s.id,
            s.assignment_id,
            s.file_name,
            s.file_path,
            a.course_id,
            c.instructor_id
        FROM submissions s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN courses c ON c.id = a.course_id
        WHERE s.id = ?
        LIMIT 1`,
        [submissionId]
    );
    return rows && rows[0] ? rows[0] : null;
}

async function assertSubmissionAccess({ actor, submissionRow }) {
    if (!submissionRow) return false;
    if (!requireDetectorUserContext() || !actor) return true;

    if (String(actor.role) === 'admin') return true;
    if (String(actor.role) === 'faculty') {
        return String(submissionRow.instructor_id || '') === String(actor.id || '');
    }
    if (String(actor.role) === 'ta') {
        const db = getDb();
        const [rows] = await db.execute(
            'SELECT 1 AS ok FROM course_tas WHERE course_id = ? AND ta_id = ? LIMIT 1',
            [submissionRow.course_id, actor.id]
        );
        return Array.isArray(rows) && rows.length > 0;
    }
    return false;
}

function parseStoredFiles(filePath, fileName) {
    try {
        let parsed = JSON.parse(filePath);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        // Legacy rows can store plain string paths.
    }
    return [{ name: fileName, path: filePath }];
}

function findStoredFile(files, filename) {
    return files.find((file) => (
        file?.name === filename
        || file?.path === filename
        || path.basename(file?.path || '') === filename
    ));
}

function submissionKey(submissionId, filename) {
    return `submissions/${submissionId}/${filename}`;
}

function detectLanguage(filename) {
    const ext = String(path.extname(filename || '')).toLowerCase();
    if (ext === '.py') return 'python';
    if (ext === '.java') return 'java';
    return null;
}

async function readSubmissionFile(submissionId, selectedFile) {
    const storedPath = selectedFile?.path;
    const filename = selectedFile?.name || path.basename(selectedFile?.path || '');

    if (s3Enabled) {
        const candidateKeys = [
            storedPath,
            submissionKey(submissionId, filename),
        ].filter((value, index, all) => value && all.indexOf(value) === index);

        for (const key of candidateKeys) {
            try {
                return await getFromS3(key);
            } catch {
                // Try next key and then fallback to local.
            }
        }
    }

    const localCandidates = [
        storedPath,
        storedPath ? path.basename(storedPath) : null,
        filename,
    ]
        .filter((value, index, all) => value && all.indexOf(value) === index)
        .map((value) => path.join(uploadsDir, value));

    const localPath = localCandidates.find((candidate) => fs.existsSync(candidate));
    if (!localPath) {
        throw new Error('Submission file content could not be found in S3 or local uploads storage.');
    }
    return fs.readFileSync(localPath);
}

async function runDetectorOnCode({ code, language }) {
    const scriptPath = detectorScriptPath();
    const configPath = detectorConfigPath();
    const rootPath = detectorRootPath();
    const timeout = detectorTimeoutMs();
    const pythonBin = detectorPythonBin();

    if (!fs.existsSync(scriptPath)) {
        throw httpError(`AI detector script not found at ${scriptPath}`, 503);
    }
    if (!fs.existsSync(configPath)) {
        throw httpError(`AI detector config not found at ${configPath}`, 503);
    }

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ai-detector-'));
    const tmpExt = language === 'java' ? '.java' : '.py';
    const tmpFile = path.join(tmpDir, `submission${tmpExt}`);

    try {
        await fs.promises.writeFile(tmpFile, code, 'utf8');
        const args = [
            scriptPath,
            '--config',
            configPath,
            '--file',
            tmpFile,
            '--language',
            language,
            '--output-format',
            'json',
        ];
        const { stdout, stderr } = await execFileAsync(pythonBin, args, {
            cwd: rootPath,
            timeout,
            maxBuffer: 2 * 1024 * 1024,
        });

        const payload = JSON.parse(String(stdout || '{}').trim() || '{}');
        if (stderr && String(stderr).trim()) {
            payload.detector_logs = String(stderr).trim();
        }
        return payload;
    } catch (error) {
        if (error?.killed || error?.signal === 'SIGTERM') {
            throw httpError(`AI detector timed out after ${timeout}ms`, 504);
        }
        const stderr = String(error?.stderr || '').trim();
        const stdout = String(error?.stdout || '').trim();
        const detail = stderr || stdout || error.message || 'Unknown detector failure';
        throw httpError(`AI detector execution failed: ${detail}`, 502);
    } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
}

async function persistDetectorResult({
    submissionId,
    fileName,
    language,
    detectorResult,
}) {
    const db = getDb();
    const thresholds = detectorResult?.thresholds || {};
    const lowerThreshold = Number.isFinite(Number(thresholds?.lower))
        ? Number(thresholds.lower)
        : null;
    const upperThreshold = Number.isFinite(Number(thresholds?.upper))
        ? Number(thresholds.upper)
        : null;
    const rawScore = Number.isFinite(Number(detectorResult?.raw_score))
        ? Number(detectorResult.raw_score)
        : null;
    const calibratedScore = Number.isFinite(Number(detectorResult?.calibrated_score))
        ? Number(detectorResult.calibrated_score)
        : null;
    const scoreUsed = Number.isFinite(Number(detectorResult?.score_used))
        ? Number(detectorResult.score_used)
        : null;
    const label = String(detectorResult?.label || 'unclear');
    const modelVersion = detectorModelVersion();
    const detectorPayload = JSON.stringify(detectorResult || {});

    await db.execute(
        `INSERT INTO submission_ai_detections (
            submission_id,
            file_name,
            language,
            label,
            raw_score,
            calibrated_score,
            score_used,
            lower_threshold,
            upper_threshold,
            model_version,
            detector_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            submissionId,
            fileName,
            language,
            label,
            rawScore,
            calibratedScore,
            scoreUsed,
            lowerThreshold,
            upperThreshold,
            modelVersion,
            detectorPayload,
        ]
    );

    const [rows] = await db.execute(
        `SELECT id, created_at
         FROM submission_ai_detections
         WHERE submission_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [submissionId]
    );
    return rows && rows[0] ? rows[0] : null;
}

router.post('/submissions/:id/run', async (req, res, next) => {
    try {
        const runtime = detectorRuntimeStatus();
        if (!runtime.enabled || !runtime.ready) {
            return res.status(503).json({
                error: runtime.reason || 'AI detector is not ready.',
                status: runtime,
            });
        }
        const actor = await resolveActor(req, res);
        if (requireDetectorUserContext() && !actor) return;

        const submissionId = parseInt(req.params.id, 10);
        if (Number.isNaN(submissionId)) {
            return res.status(400).json({ error: 'Invalid submission ID.' });
        }

        const submissionRow = await fetchSubmissionAccessRow(submissionId);
        if (!submissionRow) {
            return res.status(404).json({ error: 'Submission not found.' });
        }
        const accessAllowed = await assertSubmissionAccess({ actor, submissionRow });
        if (!accessAllowed) {
            return res.status(403).json({ error: 'You do not have permission to access this submission.' });
        }

        const files = parseStoredFiles(submissionRow.file_path, submissionRow.file_name);
        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ error: 'Submission does not contain any stored files.' });
        }

        const isBatch = parseBooleanEnv(req.body?.batch || req.query?.batch);
        const requestedFilename = String(req.body?.filename || req.query?.filename || '').trim();
        
        const filesToProcess = [];

        if (isBatch) {
            // Filter only supported files (.py, .java)
            for (const file of files) {
                const name = file?.name || path.basename(file?.path || '');
                const lang = detectLanguage(name);
                if (lang) {
                    filesToProcess.push({ file, language: lang });
                }
            }
            if (filesToProcess.length === 0) {
                return res.status(400).json({ error: 'No supported files (.py, .java) found in this submission for batch processing.' });
            }
        } else {
            let selectedFile = null;
            if (requestedFilename) {
                selectedFile = findStoredFile(files, requestedFilename);
                if (!selectedFile) {
                    return res.status(400).json({
                        error: `File '${requestedFilename}' was not found in this submission.`,
                        available_files: files.map((file) => file?.name || path.basename(file?.path || '')).filter(Boolean),
                    });
                }
            } else if (files.length === 1) {
                selectedFile = files[0];
            } else {
                return res.status(400).json({
                    error: 'Submission has multiple files. Provide `filename` in request body or `batch=true`.',
                    available_files: files.map((file) => file?.name || path.basename(file?.path || '')).filter(Boolean),
                });
            }
            const selectedFilename = selectedFile?.name || path.basename(selectedFile?.path || '');
            const explicitLanguage = String(req.body?.language || '').trim().toLowerCase();
            const language = explicitLanguage || detectLanguage(selectedFilename);
            if (!language || !['python', 'java'].includes(language)) {
                return res.status(400).json({
                    error: 'Could not determine a supported language for the selected file.',
                    selected_file: selectedFilename,
                });
            }
            filesToProcess.push({ file: selectedFile, language });
        }

        const results = [];
        for (const item of filesToProcess) {
            const currentFilename = item.file?.name || path.basename(item.file?.path || '');
            try {
                const contentBuffer = await readSubmissionFile(submissionId, item.file);
                const code = contentBuffer.toString('utf8');
                const result = await runDetectorOnCode({ code, language: item.language });
                const persisted = await persistDetectorResult({
                    submissionId,
                    fileName: currentFilename,
                    language: item.language,
                    detectorResult: result,
                });
                results.push({
                    file_name: currentFilename,
                    language: item.language,
                    detection_id: persisted?.id,
                    recorded_at: persisted?.created_at,
                    detector_result: result,
                });
            } catch (err) {
                if (isBatch) {
                    results.push({
                        file_name: currentFilename,
                        language: item.language,
                        error: err.message || 'Detection failed for this file.',
                    });
                } else {
                    throw err;
                }
            }
        }

        return res.json({
            submission_id: submissionId,
            batch: isBatch,
            count: results.length,
            results: results,
            model_version: detectorModelVersion(),
            requested_by: actor?.id || null,
            note: 'AI detector output is a review signal only, not proof of authorship.',
        });
    } catch (err) {
        next(err);
    }
});

router.get('/status', async (req, res) => {
    const status = detectorRuntimeStatus();
    const code = status.ready ? 200 : 503;
    return res.status(code).json(status);
});

router.get('/submissions/:id/results', async (req, res, next) => {
    try {
        const actor = await resolveActor(req, res);
        if (requireDetectorUserContext() && !actor) return;

        const submissionId = parseInt(req.params.id, 10);
        if (Number.isNaN(submissionId)) {
            return res.status(400).json({ error: 'Invalid submission ID.' });
        }
        const submissionRow = await fetchSubmissionAccessRow(submissionId);
        if (!submissionRow) {
            return res.status(404).json({ error: 'Submission not found.' });
        }
        const accessAllowed = await assertSubmissionAccess({ actor, submissionRow });
        if (!accessAllowed) {
            return res.status(403).json({ error: 'You do not have permission to access this submission.' });
        }

        const rawLimit = parseInt(req.query.limit, 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

        const db = getDb();
        const [rows] = await db.execute(
            `SELECT
                id,
                submission_id,
                file_name,
                language,
                label,
                raw_score,
                calibrated_score,
                score_used,
                lower_threshold,
                upper_threshold,
                model_version,
                detector_payload,
                created_at
            FROM submission_ai_detections
            WHERE submission_id = ?
            ORDER BY id DESC
            LIMIT ${limit}`,
            [submissionId]
        );

        return res.json({
            submission_id: submissionId,
            requested_by: actor?.id || null,
            count: Array.isArray(rows) ? rows.length : 0,
            results: (rows || []).map((row) => {
                let payload = null;
                try {
                    payload = row.detector_payload ? JSON.parse(row.detector_payload) : null;
                } catch {
                    payload = null;
                }
                return {
                    id: row.id,
                    submission_id: row.submission_id,
                    file_name: row.file_name,
                    language: row.language,
                    label: row.label,
                    raw_score: row.raw_score,
                    calibrated_score: row.calibrated_score,
                    score_used: row.score_used,
                    thresholds: {
                        lower: row.lower_threshold,
                        upper: row.upper_threshold,
                    },
                    model_version: row.model_version,
                    detector_result: payload,
                    created_at: row.created_at,
                };
            }),
        });
    } catch (err) {
        next(err);
    }
});

router.get('/assignments/:assignmentId/summary', async (req, res, next) => {
    try {
        const actor = await resolveActor(req, res);
        if (requireDetectorUserContext() && !actor) return;

        const assignmentId = req.params.assignmentId;
        const db = getDb();

        // Get the latest detection label for each submission in this assignment
        const [rows] = await db.execute(
            `SELECT 
                s.id as submission_id,
                d.label,
                d.created_at
            FROM submissions s
            JOIN (
                SELECT submission_id, label, created_at,
                       ROW_NUMBER() OVER (PARTITION BY submission_id ORDER BY id DESC) as rn
                FROM submission_ai_detections
            ) d ON s.id = d.submission_id AND d.rn = 1
            WHERE s.assignment_id = ?`,
            [assignmentId]
        );

        const summary = {};
        rows.forEach(row => {
            const hasAi = String(row.label).toLowerCase().includes('likely ai');
            const hasUnclear = String(row.label).toLowerCase().includes('unclear');
            
            summary[row.submission_id] = {
                caution: hasAi || hasUnclear,
                clean: !hasAi && !hasUnclear && String(row.label).toLowerCase().includes('likely human'),
                last_run: row.created_at
            };
        });

        return res.json({
            assignment_id: assignmentId,
            summary: summary
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
