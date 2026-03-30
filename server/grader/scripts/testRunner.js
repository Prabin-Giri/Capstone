#!/usr/bin/env node
/**
 * Quick test that the Docker runner and runCode work.
 * Run from server/: node grader/scripts/testRunner.js
 * Requires: Docker installed and running.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

async function main() {
    // Skip blocking "docker version" check (it can hang >15s when Docker Desktop is slow).
    // Prove Docker works by actually running a container.
    if (process.platform === 'darwin' && fs.existsSync('/usr/local/bin/docker')) {
        process.env.DOCKER_CMD = '/usr/local/bin/docker';
    }
    const runCode = require('../runCode');
    const config = require('../config');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-test-'));
    const pyFile = path.join(tmpDir, 'main.py');
    fs.writeFileSync(pyFile, 'import sys\nprint(sys.stdin.read().strip())');
    try {
        const result = await runCode.runCode({
            sourceFilePath: pyFile,
            language: 'python',
            stdin: 'hello from test\n',
            timeoutMs: config.runTimeoutMs,
        });
        const expected = 'hello from test';
        const got = (result.stdout || '').trim();
        if (got === expected) {
            console.log('   Docker OK. RunCode test passed.');
        } else {
            console.log('   FAIL: expected stdout "%s", got "%s"', expected, got);
            if (result.stderr) console.log('   stderr:', result.stderr);
            process.exit(1);
        }
    } catch (err) {
        console.log('   Docker not found or not running.');
        console.log('   Error:', err && err.message ? err.message : err);
        console.log('\n   Start Docker Desktop, or run with: DOCKER_CMD=/usr/local/bin/docker node grader/scripts/testRunner.js');
        process.exit(1);
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
    }

    console.log('\n2. Grader runner test passed. Next: test full grader with a real submission.');
    console.log('   - Start server: npm run dev (from project root) or node index.js (from server/)');
    console.log('   - Ensure an assignment has test cases and a submission has a file, then:');
    console.log('   - curl -X POST http://localhost:3001/api/grader/submissions/<SUBMISSION_ID>/run');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
