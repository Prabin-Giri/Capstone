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

function reuseOnUnchangedEnabled() {
    const configured = process.env.AI_REUSE_ON_UNCHANGED;
    if (configured == null || String(configured).trim() === '') return true;
    return parseBooleanEnv(configured);
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
        reuse_on_unchanged: reuseOnUnchangedEnabled(),
    };
}

function httpError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function readActorUserId(req) {
    const fromAuth = String(req.auth?.userId || '').trim();
    if (fromAuth) return fromAuth;
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
            s.student_id,
            s.file_name,
            s.file_path,
            s.content_hash,
            s.ai_analysis_state,
            s.ai_analyzed_at,
            s.ai_reused_from_submission_id,
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

function parseDetectorPayload(row) {
    try {
        return row.detector_payload ? JSON.parse(row.detector_payload) : null;
    } catch {
        return null;
    }
}

async function getLatestDetectionBySubmission(submissionId, allowedFileNames = null) {
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
        ORDER BY id DESC`,
        [submissionId]
    );

    const allowed = Array.isArray(allowedFileNames) && allowedFileNames.length > 0
        ? new Set(allowedFileNames.map((name) => String(name)))
        : null;
    const latestByFile = new Map();
    for (const row of rows || []) {
        if (allowed && !allowed.has(String(row.file_name))) {
            continue;
        }
        if (!latestByFile.has(row.file_name)) {
            latestByFile.set(row.file_name, row);
        }
    }
    return Array.from(latestByFile.values()).sort((a, b) => Number(a.id) - Number(b.id));
}

async function cloneDetectionRows({ sourceSubmissionId, targetSubmissionId, fileNames = null }) {
    const db = getDb();
    const sourceRows = await getLatestDetectionBySubmission(sourceSubmissionId, fileNames);
    if (sourceRows.length === 0) return [];

    for (const row of sourceRows) {
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
                targetSubmissionId,
                row.file_name,
                row.language,
                row.label,
                row.raw_score,
                row.calibrated_score,
                row.score_used,
                row.lower_threshold,
                row.upper_threshold,
                row.model_version,
                row.detector_payload,
            ]
        );
    }

    const clonedRows = await getLatestDetectionBySubmission(targetSubmissionId, fileNames);
    return clonedRows.map((row) => ({
        file_name: row.file_name,
        language: row.language,
        detection_id: row.id,
        recorded_at: row.created_at,
        detector_result: parseDetectorPayload(row),
        reused_from_submission_id: sourceSubmissionId,
    }));
}

async function findReusableSubmissionSource(submissionRow) {
    const contentHash = String(submissionRow?.content_hash || '').trim();
    if (!contentHash) return null;

    const db = getDb();
    const [rows] = await db.execute(
        `SELECT s.id
         FROM submissions s
         WHERE s.assignment_id = ?
           AND s.student_id = ?
           AND s.content_hash = ?
           AND s.id <> ?
           AND EXISTS (
             SELECT 1
             FROM submission_ai_detections d
             WHERE d.submission_id = s.id
           )
         ORDER BY s.submitted_at DESC, s.id DESC
         LIMIT 1`,
        [
            submissionRow.assignment_id,
            submissionRow.student_id,
            contentHash,
            submissionRow.id,
        ]
    );

    return rows && rows[0] ? Number(rows[0].id) : null;
}

async function updateSubmissionAnalysisState(submissionId, state, reusedFromSubmissionId = null) {
    const db = getDb();
    await db.execute(
        `UPDATE submissions
         SET ai_analysis_state = ?,
             ai_analyzed_at = CURRENT_TIMESTAMP,
             ai_reused_from_submission_id = ?
         WHERE id = ?`,
        [state, reusedFromSubmissionId, submissionId]
    );
}

function buildSubmissionAnalysisMeta(submissionRow) {
    return {
        analysis_state: submissionRow?.ai_analysis_state || 'pending',
        analyzed_at: submissionRow?.ai_analyzed_at || null,
        reused_from_submission_id: submissionRow?.ai_reused_from_submission_id != null
            ? Number(submissionRow.ai_reused_from_submission_id)
            : null,
    };
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

/**
 * Internal helper used by submission auto-processing.
 * Runs detector for one submission (single file or batch) and persists results.
 */
async function runSubmissionDetectionInternal(submissionId, options = {}) {
    const runtime = detectorRuntimeStatus();
    if (!runtime.enabled || !runtime.ready) {
        return {
            skipped: true,
            reason: runtime.reason || 'AI detector is not ready.',
            status: runtime,
        };
    }

    const idNum = Number(submissionId);
    if (!Number.isFinite(idNum)) {
        throw httpError('Invalid submission ID.', 400);
    }

    const submissionRow = await fetchSubmissionAccessRow(idNum);
    if (!submissionRow) {
        throw httpError('Submission not found.', 404);
    }

    const files = Array.isArray(options.preParsedFiles)
        ? options.preParsedFiles
        : parseStoredFiles(submissionRow.file_path, submissionRow.file_name);
    if (!Array.isArray(files) || files.length === 0) {
        throw httpError('Submission does not contain any stored files.', 400);
    }

    const isBatch = options.batch !== false;
    const requestedFilename = String(options.filename || '').trim();
    const force = options.force === true || parseBooleanEnv(options.force);
    const allowReuse = reuseOnUnchangedEnabled() && !force;
    const filesToProcess = [];

    if (isBatch) {
        for (const file of files) {
            const name = file?.name || path.basename(file?.path || '');
            const lang = detectLanguage(name);
            if (lang) filesToProcess.push({ file, language: lang });
        }
        if (filesToProcess.length === 0) {
            await updateSubmissionAnalysisState(idNum, 'skipped', null);
            return {
                skipped: true,
                mode: 'skipped',
                reason: 'No supported files (.py, .java) found in submission.',
                submission_id: idNum,
                count: 0,
                results: [],
                source_submission_id: null,
                model_version: detectorModelVersion(),
                ...buildSubmissionAnalysisMeta({
                    ai_analysis_state: 'skipped',
                    ai_analyzed_at: new Date().toISOString(),
                    ai_reused_from_submission_id: null,
                }),
                note: 'AI detector output is a review signal only, not proof of authorship.',
            };
        }
    } else {
        let selectedFile = null;
        if (requestedFilename) {
            selectedFile = findStoredFile(files, requestedFilename);
            if (!selectedFile) throw httpError(`File '${requestedFilename}' was not found in submission.`, 400);
        } else if (files.length === 1) {
            selectedFile = files[0];
        } else {
            throw httpError('Submission has multiple files and no filename was provided.', 400);
        }
        const selectedFilename = selectedFile?.name || path.basename(selectedFile?.path || '');
        const explicitLanguage = String(options.language || '').trim().toLowerCase();
        const language = explicitLanguage || detectLanguage(selectedFilename);
        if (!language || !['python', 'java'].includes(language)) {
            throw httpError(`Unsupported language for selected file '${selectedFilename}'.`, 400);
        }
        filesToProcess.push({ file: selectedFile, language });
    }

    if (allowReuse) {
        const sourceSubmissionId = await findReusableSubmissionSource(submissionRow);
        if (sourceSubmissionId) {
            const requestedFileNames = filesToProcess.map(
                (item) => item.file?.name || path.basename(item.file?.path || '')
            );
            const reusedResults = await cloneDetectionRows({
                sourceSubmissionId,
                targetSubmissionId: idNum,
                fileNames: requestedFileNames,
            });
            if (reusedResults.length > 0) {
                await updateSubmissionAnalysisState(idNum, 'reused', sourceSubmissionId);
                const refreshedSubmission = await fetchSubmissionAccessRow(idNum);
                return {
                    submission_id: idNum,
                    batch: isBatch,
                    mode: 'reused',
                    source_submission_id: sourceSubmissionId,
                    count: reusedResults.length,
                    results: reusedResults,
                    model_version: detectorModelVersion(),
                    ...buildSubmissionAnalysisMeta(refreshedSubmission),
                    note: 'AI detector output is a review signal only, not proof of authorship.',
                };
            }
        }
    }

    try {
        const results = [];
        for (const item of filesToProcess) {
            const currentFilename = item.file?.name || path.basename(item.file?.path || '');
            const contentBuffer = await readSubmissionFile(idNum, item.file);
            const code = contentBuffer.toString('utf8');
            const result = await runDetectorOnCode({ code, language: item.language });
            const persisted = await persistDetectorResult({
                submissionId: idNum,
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
        }

        await updateSubmissionAnalysisState(idNum, 'analyzed', null);
        const refreshedSubmission = await fetchSubmissionAccessRow(idNum);
        return {
            submission_id: idNum,
            batch: isBatch,
            mode: 'fresh',
            source_submission_id: null,
            count: results.length,
            results,
            model_version: detectorModelVersion(),
            ...buildSubmissionAnalysisMeta(refreshedSubmission),
            note: 'AI detector output is a review signal only, not proof of authorship.',
        };
    } catch (error) {
        try {
            await updateSubmissionAnalysisState(idNum, 'failed', null);
        } catch {
            // best effort only
        }
        throw error;
    }
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

        const isBatch = parseBooleanEnv(req.body?.batch || req.query?.batch);
        const requestedFilename = String(req.body?.filename || req.query?.filename || '').trim();
        const explicitLanguage = String(req.body?.language || '').trim().toLowerCase();
        const force = parseBooleanEnv(req.body?.force || req.query?.force);
        const result = await runSubmissionDetectionInternal(submissionId, {
            batch: isBatch,
            filename: requestedFilename || undefined,
            language: explicitLanguage || undefined,
            force,
        });

        return res.json({
            ...result,
            requested_by: actor?.id || null,
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
            ...buildSubmissionAnalysisMeta(submissionRow),
            results: (rows || []).map((row) => {
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
                    detector_result: parseDetectorPayload(row),
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

        // Include submission analysis state for every submission in the assignment,
        // plus latest detector result when available.
        const [rows] = await db.execute(
            `SELECT 
                s.id as submission_id,
                s.student_id,
                s.ai_analysis_state,
                s.ai_analyzed_at,
                s.ai_reused_from_submission_id,
                d.label,
                d.created_at,
                d.file_name,
                d.score_used,
                d.calibrated_score,
                d.raw_score
            FROM submissions s
            LEFT JOIN (
                SELECT submission_id, file_name, label, created_at, score_used, calibrated_score, raw_score,
                       ROW_NUMBER() OVER (PARTITION BY submission_id ORDER BY id DESC) as rn
                FROM submission_ai_detections
            ) d ON s.id = d.submission_id AND d.rn = 1
            WHERE s.assignment_id = ?`,
            [assignmentId]
        );

        const summary = {};
        const totals = {
            submissions: Array.isArray(rows) ? rows.length : 0,
            caution: 0,
            clean: 0,
            pending: 0,
            analyzed: 0,
            reused: 0,
            failed: 0,
            skipped: 0,
            no_results: 0,
        };
        rows.forEach(row => {
            const hasAi = String(row.label).toLowerCase().includes('likely ai');
            const hasUnclear = String(row.label).toLowerCase().includes('unclear');
            const clean = !hasAi && !hasUnclear && String(row.label).toLowerCase().includes('likely human');
            const analysisState = String(row.ai_analysis_state || 'pending').toLowerCase();

            if (hasAi || hasUnclear) totals.caution += 1;
            if (clean) totals.clean += 1;
            if (analysisState === 'pending') totals.pending += 1;
            else if (analysisState === 'analyzed') totals.analyzed += 1;
            else if (analysisState === 'reused') totals.reused += 1;
            else if (analysisState === 'failed') totals.failed += 1;
            else if (analysisState === 'skipped') totals.skipped += 1;
            if (!row.label) totals.no_results += 1;

            summary[row.submission_id] = {
                caution: hasAi || hasUnclear,
                clean,
                submission_id: row.submission_id,
                student_id: row.student_id,
                analysis_state: analysisState,
                analyzed_at: row.ai_analyzed_at,
                reused_from_submission_id: row.ai_reused_from_submission_id != null
                    ? Number(row.ai_reused_from_submission_id)
                    : null,
                last_run: row.ai_analyzed_at || row.created_at || null,
                latest_detection: row.label
                    ? {
                        file_name: row.file_name,
                        label: row.label,
                        score_used: row.score_used,
                        calibrated_score: row.calibrated_score,
                        raw_score: row.raw_score,
                        created_at: row.created_at,
                    }
                    : null,
            };
        });

        return res.json({
            assignment_id: assignmentId,
            totals,
            summary: summary,
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
module.exports.runSubmissionDetectionInternal = runSubmissionDetectionInternal;
