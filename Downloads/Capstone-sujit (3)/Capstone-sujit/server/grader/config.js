/**
 * Auto-grader configuration: Docker images, timeouts, resource limits.
 * Faculty can override some of these via assignment settings (read in gradeSubmission).
 */
module.exports = {
    /** Docker binary (use DOCKER_CMD env if "docker" is not in PATH, e.g. /usr/local/bin/docker) */
    dockerCmd: process.env.DOCKER_CMD || 'docker',

    /** Docker image per language (must have the runtime installed) */
    images: {
        python: 'python:3.11-slim',
        java: 'openjdk:17-slim',
        javascript: 'node:20-slim',
        php: 'php:8.2-cli',
    },

    /** Default timeout per test run (ms) */
    runTimeoutMs: 10000,

    /** Docker run: memory limit */
    memoryMb: 256,

    /** Docker run: CPU limit (e.g. 0.5 = half a CPU) */
    cpus: 0.5,

    /** Default late penalty when enabled and no assignment-specific value */
    defaultLatePenaltyPercentPerDay: 10,
    defaultLatePenaltyCapPercent: 50,

    /** Default partial credit % when allow_partial and no exact match but program ran */
    defaultPartialCreditPercent: 0,
};
