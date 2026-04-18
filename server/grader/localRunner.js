const { spawn } = require('child_process');
const config = require('./config');

/**
 * Run a command directly on the host machine (no Docker).
 * @param {Object} opts
 * @param {string[]} opts.cmd - Command and args (e.g. ['python3', 'main.py'])
 * @param {string} opts.workDir - Absolute path to the working directory
 * @param {string} [opts.stdin] - Input to feed to the process
 * @param {number} [opts.timeoutMs] - Kill process after this many ms
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean }>}
 */
function runLocally({ cmd, workDir, stdin = '', timeoutMs = config.runTimeoutMs }) {
    return new Promise((resolve) => {
        let command = cmd[0];
        let args = cmd.slice(1);

        // Windows has no POSIX `sh` on PATH — Custom Run / local grader would fail with spawn sh ENOENT.
        // Run one-liners (e.g. javac *.java && java Main) via cmd.exe instead.
        if (
            process.platform === 'win32'
            && command === 'sh'
            && args[0] === '-c'
            && typeof args[1] === 'string'
        ) {
            command = process.env.ComSpec || 'cmd.exe';
            args = ['/d', '/s', '/c', args[1]];
        }

        const proc = spawn(command, args, {
            cwd: workDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, SOURCE_DATE_EPOCH: '0' }, // Use host env, maybe clear some stuff
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGKILL');
        }, timeoutMs);

        proc.on('close', (code, signal) => {
            clearTimeout(timer);
            resolve({
                stdout: stdout.trimEnd ? stdout.trimEnd() : stdout.replace(/\s+$/, ''),
                stderr: stderr.trimEnd ? stderr.trimEnd() : stderr.replace(/\s+$/, ''),
                exitCode: code !== null ? code : (signal === 'SIGKILL' ? -1 : -1),
                timedOut,
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                stdout: '',
                stderr: err.message || 'Failed to run local command',
                exitCode: -1,
                timedOut: false,
            });
        });

        if (stdin) {
            proc.stdin.write(stdin, (err) => {
                if (!err) proc.stdin.end();
            });
        } else {
            proc.stdin.end();
        }
    });
}

module.exports = { runLocally };
