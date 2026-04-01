const { spawn } = require('child_process');
const path = require('path');
const config = require('./config');

/**
 * Run a command inside a hardened Docker container.
 *
 * Security/resource flags applied:
 *   --rm                          auto-remove container on exit
 *   --network=none                no outbound internet access
 *   --memory=<Mb>m                hard memory cap (default from config)
 *   --cpus=<n>                    CPU share limit
 *   --pids-limit=64               cap the number of processes that can fork
 *   --read-only                   container filesystem is read-only
 *   --tmpfs /tmp                  writable /tmp scratch space (in-memory, not persisted)
 *   --security-opt=no-new-privileges  prevent privilege escalation via setuid binaries
 *   --ulimit cpu=<s>              hard kernel CPU-time limit (seconds)
 *   -v <workDir>:/work:ro         submission files mounted read-only
 *
 * NOTE: Java compilation requires a writable working directory (javac writes .class files).
 *       With --read-only + --tmpfs /tmp the container cannot write to /work.
 *       To handle this we set the working dir to /tmp for Java (javac -d /tmp ... && java -cp /tmp ...),
 *       but the simplest safe approach used here is to allow /tmp as writable scratch via --tmpfs.
 *       If your Java images need to write .class files next to the .java sources, pass rw=true.
 *
 * @param {Object} opts
 * @param {string}   opts.image      - Docker image name (e.g. 'python:3.12-slim')
 * @param {string[]} opts.cmd        - Command and args inside the container
 * @param {string}   opts.workDir    - Absolute host path to mount at /work (read-only)
 * @param {string}  [opts.stdin]     - Input piped to process stdin
 * @param {number}  [opts.timeoutMs] - Kill container after this many ms (default from config)
 * @param {number}  [opts.memoryMb]  - Memory limit in MB (default from config)
 * @param {boolean} [opts.writable]  - Mount /work rw instead of ro (e.g. Java compile step)
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean }>}
 */
function runInDocker({
    image,
    cmd,
    workDir,
    stdin = '',
    timeoutMs = config.runTimeoutMs,
    memoryMb = config.memoryMb,
    writable = false,
}) {
    const workDirAbs = path.resolve(workDir);
    const mountMode = writable ? 'rw' : 'ro';
    const ulimitCpuSec = config.ulimitCpuSec || 10;
    const pidsLimit = config.pidsLimit || 64;

    const args = [
        'run', '--rm',

        // ── Network isolation ─────────────────────────────────────────
        '--network=none',

        // ── Resource limits ───────────────────────────────────────────
        '--memory', `${memoryMb}m`,
        '--cpus', String(config.cpus),
        `--pids-limit=${pidsLimit}`,
        '--ulimit', `cpu=${ulimitCpuSec}`,

        // ── Filesystem hardening ───────────────────────────────────────
        '--read-only',             // container root FS is read-only
        '--tmpfs', '/tmp:size=64m', // writable in-memory /tmp (64 MB cap)

        // ── Privilege escalation prevention ───────────────────────────
        '--security-opt=no-new-privileges',

        // ── Submission volume (read-only) ─────────────────────────────
        '-v', `${workDirAbs}:/work:${mountMode}`,
        '-w', '/work',
    ];

    if (stdin) args.push('-i'); // attach stdin pipe
    args.push(image, ...cmd);

    const dockerCmd = config.dockerCmd || 'docker';

    // ── Debug: print the exact command for EC2 logs ───────────────────
    console.log(`[docker] ${dockerCmd} ${args.join(' ')}`);

    return new Promise((resolve) => {
        const proc = spawn(dockerCmd, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        // Cap total output size to prevent memory exhaustion from runaway output
        const MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB
        let stdoutBytes = 0;
        let stderrBytes = 0;

        proc.stdout.on('data', (chunk) => {
            stdoutBytes += chunk.length;
            if (stdoutBytes <= MAX_OUTPUT_BYTES) stdout += chunk.toString();
        });
        proc.stderr.on('data', (chunk) => {
            stderrBytes += chunk.length;
            if (stderrBytes <= MAX_OUTPUT_BYTES) stderr += chunk.toString();
        });

        // ── Node-side timeout: kills the container if Docker's own limits miss it ──
        const timer = setTimeout(() => {
            timedOut = true;
            console.warn(`[docker] Container timed out after ${timeoutMs}ms — sending SIGKILL`);
            proc.kill('SIGKILL');
        }, timeoutMs);

        proc.on('close', (code, signal) => {
            clearTimeout(timer);
            const exitCode = code !== null ? code : (signal ? -1 : -1);
            if (stdoutBytes > MAX_OUTPUT_BYTES) {
                stdout += `\n[Output truncated — exceeded ${Math.round(MAX_OUTPUT_BYTES / 1024)}KB limit]`;
            }
            if (stderrBytes > MAX_OUTPUT_BYTES) {
                stderr += `\n[Stderr truncated — exceeded ${Math.round(MAX_OUTPUT_BYTES / 1024)}KB limit]`;
            }
            resolve({
                stdout: stdout.trimEnd(),
                stderr: stderr.trimEnd(),
                exitCode,
                timedOut,
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            let msg = err.message || 'Failed to run Docker';
            if (err.code === 'ENOENT') {
                msg = [
                    "Docker command not found ('spawn docker ENOENT').",
                    'If running on a cloud platform without Docker, set GRADER_RUN_MODE=local.',
                    `Attempted: ${dockerCmd} run ${image}`,
                ].join(' ');
            }
            console.error(`[docker] spawn error: ${msg}`);
            resolve({
                stdout: '',
                stderr: msg,
                exitCode: -1,
                timedOut: false,
            });
        });

        // ── Write stdin after the container has started reading ───────
        setImmediate(() => {
            if (stdin) {
                proc.stdin.write(stdin, (err) => {
                    if (!err) proc.stdin.end();
                    else {
                        // Container may have already exited (e.g. syntax error); just close
                        try { proc.stdin.end(); } catch (_) {}
                    }
                });
            } else {
                proc.stdin.end();
            }
        });
    });
}

module.exports = { runInDocker };
