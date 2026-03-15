const { spawn } = require('child_process');
const path = require('path');
const config = require('./config');

/**
 * Run the command directly on the host machine (no Docker).
 * Used for local development when LOCAL_NO_DOCKER=1.
 * On Windows, use Python Launcher 'py -3' when python3/python are not in PATH.
 */
function runLocally({ cmd, workDir, stdin = '', timeoutMs = config.runTimeoutMs }) {
    let [exe, ...args] = cmd;
    if (process.platform === 'win32' && exe === 'python3') {
        // Windows: python3 and python are often not in PATH; 'py -3' (Python Launcher) usually is
        exe = 'py';
        args = ['-3', ...args];
    }
    if (process.platform === 'win32' && exe === 'sh' && args[0] === '-c') {
        // Windows has no 'sh'; run the command via cmd /c (e.g. "javac *.java")
        exe = 'cmd';
        args = ['/c', args[1]];
    }
    return new Promise((resolve) => {
    const proc = spawn(exe, args, {
            cwd: workDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
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
                stderr: err.message || 'Failed to run program locally',
                exitCode: -1,
                timedOut: false,
            });
        });

        const sendStdin = () => {
            if (stdin) {
                proc.stdin.write(stdin, (err) => {
                    if (!err) proc.stdin.end();
                });
            } else {
                proc.stdin.end();
            }
        };
        setImmediate(sendStdin);
    });
}

/**
 * Run a command inside a Docker container with no network, resource limits, and stdin.
 * @param {Object} opts
 * @param {string} opts.image - Docker image name
 * @param {string[]} opts.cmd - Command and args (e.g. ['python3', 'main.py'])
 * @param {string} opts.workDir - Absolute path on host to mount at /work (read-only)
 * @param {string} [opts.stdin] - Input to feed to the process
 * @param {number} [opts.timeoutMs] - Kill container after this many ms
 * @param {number} [opts.memoryMb] - Memory limit in MB
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean }>}
 */
async function runInDocker({ image, cmd, workDir, stdin = '', timeoutMs = config.runTimeoutMs, memoryMb = config.memoryMb }) {
    const workDirAbs = path.resolve(workDir);

    // Local dev mode: run directly on host without Docker
    if (process.env.LOCAL_NO_DOCKER === '1') {
        return runLocally({ cmd, workDir: workDirAbs, stdin, timeoutMs });
    }

    // Mount work dir (rw so Java can compile); no network, resource limits
    const args = [
        'run', '--rm',
        '--network', 'none',
        '--memory', `${memoryMb}m`,
        '--cpus', String(config.cpus),
        '-v', `${workDirAbs}:/work`,
        '-w', '/work',
    ];
    if (stdin) args.push('-i'); // attach stdin so the process inside the container can read it
    args.push(image, ...cmd);

    const dockerCmd = config.dockerCmd || 'docker';

    // Helper to fall back gracefully when Docker is unavailable
    const fallbackToLocal = async (reason) => {
        console.warn('[autograde] Falling back to local run (Docker unavailable):', reason);
        return runLocally({ cmd, workDir: workDirAbs, stdin, timeoutMs });
    };

    return new Promise((resolve) => {
        const proc = spawn(dockerCmd, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
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

        proc.on('close', async (code, signal) => {
            clearTimeout(timer);
            const exitCode = code !== null ? code : (signal === 'SIGKILL' ? -1 : -1);

            // If Docker failed to start (common on Windows dev machines), transparently fall back
            if (exitCode !== 0 && /docker|daemon|connect|ENOENT/i.test(stderr)) {
                const result = await fallbackToLocal(stderr || `docker exit code ${exitCode}`);
                return resolve(result);
            }

            resolve({
                stdout: stdout.trimEnd ? stdout.trimEnd() : stdout.replace(/\s+$/, ''),
                stderr: stderr.trimEnd ? stderr.trimEnd() : stderr.replace(/\s+$/, ''),
                exitCode,
                timedOut,
            });
        });

        proc.on('error', async (err) => {
            clearTimeout(timer);
            // If spawning docker itself failed, also fall back to local execution
            const result = await fallbackToLocal(err.message || 'Failed to run Docker');
            resolve(result);
        });

        // Write stdin after a tick so the container process has started and is reading
        const sendStdin = () => {
            if (stdin) {
                proc.stdin.write(stdin, (err) => {
                    if (!err) proc.stdin.end();
                });
            } else {
                proc.stdin.end();
            }
        };
        setImmediate(sendStdin);
    });
}

module.exports = { runInDocker };
