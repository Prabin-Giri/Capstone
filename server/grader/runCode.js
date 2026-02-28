const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');
const { runInDocker } = require('./dockerRunner');
const config = require('./config');

/** If DOCKER_HOST is ssh://user@host, return { user, host }; else null */
function getRemoteDockerTarget() {
    const dh = process.env.DOCKER_HOST;
    if (!dh || typeof dh !== 'string' || !dh.startsWith('ssh://')) return null;
    const match = dh.match(/^ssh:\/\/(?:([^@/]+)@)?([^/]+)/);
    if (!match) return null;
    return {
        user: match[1] || process.env.USER || 'root',
        host: match[2],
    };
}

/** Copy localDir contents to remote at remoteDir (must exist). Uses scp. */
function syncLocalToRemote(localDir, remoteDir, { user, host }) {
    const opts = ['-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10'];
    const esc = (s) => String(s).replace(/'/g, "'\"'\"'");
    execSync(`ssh ${opts.join(' ')} ${user}@${host} "mkdir -p '${esc(remoteDir)}'"`, { stdio: 'pipe' });
    // Source must end in /. so scp copies directory *contents* (path.join normalizes away the dot)
    const sourceContents = localDir + path.sep + '.';
    const remoteTarget = `${user}@${host}:${remoteDir + '/'}`;
    execFileSync('scp', ['-r', ...opts, sourceContents, remoteTarget], { stdio: 'pipe' });
}

/** Remove remoteDir on the VM. */
function cleanupRemote(remoteDir, { user, host }) {
    try {
        const opts = '-o StrictHostKeyChecking=no -o ConnectTimeout=5';
        const esc = (s) => String(s).replace(/'/g, "'\"'\"'");
        execSync(`ssh ${opts} ${user}@${host} "rm -rf '${esc(remoteDir)}'"`, { stdio: 'pipe' });
    } catch (_) {}
}

/** Read file content from the VM via ssh cat. */
function readRemoteFile(remoteFilePath, { user, host }) {
    const opts = ['-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10'];
    const esc = (s) => String(s).replace(/'/g, "'\"'\"'");
    return execSync(`ssh ${opts.join(' ')} ${user}@${host} "cat '${esc(remoteFilePath)}'"`, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
}

/** Python harness for LeetCode-style: reads stdin, calls solution(input_str), prints return value. */
const PYTHON_FUNCTION_HARNESS = `import sys
try:
    from solution import solution
except Exception as e:
    print("Error: could not import solution - define a function: def solution(input_str): ...", file=sys.stderr)
    sys.exit(1)
input_data = sys.stdin.read()
try:
    result = solution(input_data)
    print(result if result is not None else "")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;

/** Java harness: reads stdin, calls Solution.solution(input), prints result. Student must have class Solution with public static String solution(String input). */
const JAVA_FUNCTION_HARNESS = `import java.util.Scanner;
public class GraderRunner {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        sc.useDelimiter("\\\\A");
        String input = sc.hasNext() ? sc.next() : "";
        sc.close();
        try {
            String result = Solution.solution(input);
            if (result != null) System.out.print(result);
        } catch (Throwable t) {
            System.err.println("Error: " + t.getMessage());
            System.exit(1);
        }
    }
}
`;

/** JavaScript/Node harness: reads stdin, requires solution module and calls solution(input_str). */
const NODE_FUNCTION_HARNESS = `const fs = require('fs');
try {
    const solution = require('./solution').solution || require('./solution');
    if (typeof solution !== 'function') throw new Error('Export a function: module.exports = function solution(input_str) { ... }');
    const input = fs.readFileSync(0, 'utf8');
    const result = solution(input);
    process.stdout.write(result != null ? String(result) : '');
} catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
}
`;

/**
 * Get the command to run for a given language and entry file.
 * runArgs: optional array of CLI args (e.g. ["input.txt", "output.txt"]).
 * javaMainClass: optional main class name for Java (e.g. "LoadShipping"); overrides inference from filename.
 */
function getRunCommand(language, entryFileName, { runArgs = [], javaMainClass = null } = {}) {
    const lang = (language || 'python').toLowerCase();
    const image = config.images[lang] || config.images.python;
    const args = Array.isArray(runArgs) ? runArgs : [];

    switch (lang) {
        case 'python':
            return { image, steps: [{ cmd: ['python3', entryFileName, ...args] }] };
        case 'javascript':
        case 'node':
            return { image, steps: [{ cmd: ['node', entryFileName, ...args] }] };
        case 'php':
            return { image, steps: [{ cmd: ['php', entryFileName, ...args] }] };
        case 'java': {
            const mainClass = (javaMainClass && String(javaMainClass).trim()) || entryFileName.replace(/\.java$/i, '') || 'Main';
            return {
                image,
                steps: [
                    { cmd: ['sh', '-c', 'javac *.java'] },
                    { cmd: ['java', mainClass, ...args] },
                ],
            };
        }
        default:
            return { image, steps: [{ cmd: ['python3', entryFileName, ...args] }] };
    }
}

/**
 * Run student code in Docker with the given stdin. Uses a temp copy of the submission.
 * @param {Object} opts
 * @param {string} opts.sourceFilePath - Absolute path to the single submission file (or dir for multi-file later)
 * @param {string} opts.language - python | java | javascript | php
 * @param {string} opts.stdin
 * @param {number} [opts.timeoutMs]
 * @param {{ filename: string, content: string }} [opts.inputFile] - When set, write content to workDir/filename before run and use empty stdin
 * @param {string} [opts.outputFileName] - When set, after run read workDir/outputFileName and return as outputFileContent
 * @param {string} [opts.outputFileName2] - Optional second output file to read (returned as outputFileContent2)
 * @param {string[]} [opts.runArgs] - CLI arguments to pass to the program (e.g. ["input.txt", "output.txt"])
 * @param {string} [opts.javaMainClass] - For Java, main class name (e.g. "LoadShipping"); overrides inference from filename
 * @returns {Promise<{ stdout, stderr, exitCode, timedOut, outputFileContent?, outputFileContent2? }>}
 */
async function runCode({ sourceFilePath, language, stdin = '', timeoutMs = config.runTimeoutMs, inputFile, outputFileName, outputFileName2, runArgs, javaMainClass, runMode = 'program' }) {
    const stat = fs.statSync(sourceFilePath);
    const isDir = stat.isDirectory();
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autograde-'));
    const remote = getRemoteDockerTarget();
    const remoteWorkDir = remote ? `/tmp/autograde-remote/${crypto.randomUUID()}` : null;
    let effectiveWorkDir = workDir;
    const isFunctionMode = (runMode || 'program').toLowerCase() === 'function';

    try {
        let entryFileName;
        if (isDir) {
            const entries = fs.readdirSync(sourceFilePath, { withFileTypes: true });
            for (const e of entries) {
                const src = path.join(sourceFilePath, e.name);
                const dest = path.join(workDir, e.name);
                if (e.isFile()) fs.copyFileSync(src, dest);
            }
            entryFileName = inferEntryFile(workDir, language);
        } else {
            entryFileName = path.basename(sourceFilePath);
            fs.copyFileSync(sourceFilePath, path.join(workDir, entryFileName));
        }

        if (isFunctionMode) {
            const lang = (language || 'python').toLowerCase();
            if (lang === 'python') {
                fs.copyFileSync(path.join(workDir, entryFileName), path.join(workDir, 'solution.py'));
                fs.writeFileSync(path.join(workDir, 'harness.py'), PYTHON_FUNCTION_HARNESS, 'utf8');
                entryFileName = 'harness.py';
            } else if (lang === 'javascript' || lang === 'node') {
                fs.copyFileSync(path.join(workDir, entryFileName), path.join(workDir, 'solution.js'));
                fs.writeFileSync(path.join(workDir, 'runner.js'), NODE_FUNCTION_HARNESS, 'utf8');
                entryFileName = 'runner.js';
            } else if (lang === 'java') {
                fs.writeFileSync(path.join(workDir, 'GraderRunner.java'), JAVA_FUNCTION_HARNESS, 'utf8');
                entryFileName = 'GraderRunner';
            }
        }

        if (!isFunctionMode && inputFile && inputFile.filename && inputFile.content !== undefined) {
            fs.writeFileSync(path.join(workDir, inputFile.filename), inputFile.content, 'utf8');
        }

        if (remote && remoteWorkDir) {
            syncLocalToRemote(workDir, remoteWorkDir, remote);
            effectiveWorkDir = remoteWorkDir;
        }

        let image, steps;
        if (isFunctionMode) {
            const lang = (language || 'python').toLowerCase();
            image = config.images[lang] || config.images.python;
            if (lang === 'java') {
                steps = [
                    { cmd: ['sh', '-c', 'javac *.java'] },
                    { cmd: ['java', entryFileName] },
                ];
            } else {
                steps = [{ cmd: lang === 'python' ? ['python3', entryFileName] : ['node', entryFileName] }];
            }
        } else {
            const runArgsList = Array.isArray(runArgs) ? runArgs : (runArgs != null && runArgs !== '' ? [String(runArgs)] : []);
            const cmd = getRunCommand(language, entryFileName, { runArgs: runArgsList, javaMainClass });
            image = cmd.image;
            steps = cmd.steps;
        }

        let lastResult = { stdout: '', stderr: '', exitCode: 0, timedOut: false };
        const runStdin = stdin; // use provided stdin on run step (supports file + stdin when grader sends both)

        for (const step of steps) {
            lastResult = await runInDocker({
                image,
                cmd: step.cmd,
                workDir: effectiveWorkDir,
                stdin: step === steps[steps.length - 1] ? runStdin : '',
                timeoutMs,
            });
            if (lastResult.exitCode !== 0 && lastResult.exitCode !== null) {
                break;
            }
        }

        const readOut = (name) => {
            if (!name) return '';
            try {
                if (remote && remoteWorkDir) {
                    const remotePath = path.join(remoteWorkDir, name).replace(/\\/g, '/');
                    return readRemoteFile(remotePath, remote);
                }
                return fs.readFileSync(path.join(workDir, name), 'utf8');
            } catch (e) {
                return '';
            }
        };
        if (outputFileName && lastResult) {
            lastResult.outputFileContent = readOut(outputFileName);
        }
        if (outputFileName2 && lastResult) {
            lastResult.outputFileContent2 = readOut(outputFileName2);
        }

        return lastResult;
    } finally {
        try {
            fs.rmSync(workDir, { recursive: true, force: true });
        } catch (_) {}
        if (remote && remoteWorkDir) {
            cleanupRemote(remoteWorkDir, remote);
        }
    }
}

function inferEntryFile(workDir, language) {
    const lang = (language || 'python').toLowerCase();
    const names = fs.readdirSync(workDir);
    if (lang === 'python') {
        const main = names.find(n => /^main\.py$/i.test(n)) || names.find(n => n.endsWith('.py'));
        return main || 'main.py';
    }
    if (lang === 'java') {
        const main = names.find(n => /^main\.java$/i.test(n)) || names.find(n => n.endsWith('.java'));
        return main || 'Main.java';
    }
    if (lang === 'javascript' || lang === 'node') {
        const main = names.find(n => /^index\.js$/i.test(n)) || names.find(n => n.endsWith('.js'));
        return main || 'index.js';
    }
    if (lang === 'php') {
        const main = names.find(n => /^index\.php$/i.test(n)) || names.find(n => n.endsWith('.php'));
        return main || 'index.php';
    }
    return names[0] || 'main.py';
}

module.exports = { runCode, getRunCommand, inferEntryFile };
