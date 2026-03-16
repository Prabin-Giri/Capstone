const { spawn } = require('child_process');
const path = require('path');
const config = require('./config');

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
function runInDocker({ image, cmd, workDir, stdin = '', timeoutMs = config.runTimeoutMs, memoryMb = config.memoryMb }) {
    const workDirAbs = path.resolve(workDir);
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
            let msg = err.message || 'Failed to run Docker';
            if (err.code === 'ENOENT') {
                msg = "Docker command not found ('spawn docker ENOENT'). If you are running on a cloud platform (Render/Vercel) without Docker installed, please set the environment variable GRADER_RUN_MODE=local in your platform settings.";
            }
            resolve({
                stdout: '',
                stderr: msg,
                exitCode: -1,
                timedOut: false,
            });
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
