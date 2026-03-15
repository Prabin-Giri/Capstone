const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runCode } = require('../grader/runCode');
const config = require('../grader/config');

const router = express.Router();

/**
 * Extract the first public class name from Java source so the file can be named accordingly.
 * Java requires the public class name to match the filename.
 * @param {string} source - Java source code
 * @returns {string|null} - Class name or null if not found
 */
function getJavaPublicClassName(source) {
    if (typeof source !== 'string') return null;
    const match = source.match(/\bpublic\s+class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[\{]/);
    return match ? match[1] : null;
}

/**
 * POST /api/code/run
 * Run user-provided code (Python or Java) with optional stdin.
 * Available to all authenticated users (instructors and students) for manual execution.
 * Body: { code: string, language: 'python' | 'java', stdin?: string }
 */
router.post('/run', async (req, res, next) => {
    try {
        const { code, language, stdin = '' } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'code is required' });
        }

        const lang = (language || 'python').toLowerCase();
        const supported = ['python', 'java'];
        if (!supported.includes(lang)) {
            return res.status(400).json({ error: 'language must be python or java' });
        }

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-run-'));
        const fileName = lang === 'python'
            ? 'main.py'
            : (getJavaPublicClassName(code) || 'Main') + '.java';
        const filePath = path.join(tmpDir, fileName);

        try {
            fs.writeFileSync(filePath, code, 'utf8');

            const timeoutMs = Math.min(Number(req.body.timeoutMs) || config.runTimeoutMs || 10000, 30000);

            const result = await runCode({
                sourceFilePath: filePath,
                language: lang,
                stdin: typeof stdin === 'string' ? stdin : '',
                timeoutMs,
            });

            res.json({
                stdout: result.stdout || '',
                stderr: result.stderr || '',
                exitCode: result.exitCode ?? -1,
                timedOut: result.timedOut || false,
            });
        } finally {
            try {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch (_) {}
        }
    } catch (err) {
        next(err);
    }
});

module.exports = router;
