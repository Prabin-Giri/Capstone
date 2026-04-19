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
        // Official openjdk:* tags were removed from Docker Hub; Temurin is the usual replacement (includes javac).
        java: process.env.DOCKER_JAVA_IMAGE || 'eclipse-temurin:17-jdk-jammy',
        javascript: 'node:20-slim',
        php: 'php:8.2-cli',
    },

    /**
     * Max wall-clock time per program run (ms). Java in Docker often needs compile + JVM startup.
     * Override with GRADER_RUN_TIMEOUT_MS (1000–600000).
     */
    runTimeoutMs: (() => {
        const v = parseInt(process.env.GRADER_RUN_TIMEOUT_MS, 10);
        if (Number.isFinite(v) && v >= 1000 && v <= 600000) return v;
        return 30000;
    })(),

    /** Docker run: memory limit (MB) */
    memoryMb: 128,

    /** Docker run: CPU limit (e.g. 0.5 = half a CPU) */
    cpus: 0.5,

    /** Docker run: Maximum number of processes/threads in container */
    pidsLimit: 64,

    /** Docker run: Hard kernel CPU-time limit (seconds) */
    ulimitCpuSec: 10,

    /** Default late penalty when enabled and no assignment-specific value */
    defaultLatePenaltyPercentPerDay: 10,
    defaultLatePenaltyCapPercent: 50,

    /** Default partial credit % when allow_partial and no exact match but program ran */
    defaultPartialCreditPercent: 0,

    /** Run untrusted code in docker by default in production. */
    runMode: (() => {
        const configured = String(process.env.GRADER_RUN_MODE || '').trim().toLowerCase();
        if (configured === 'local' || configured === 'docker') return configured;
        return process.env.NODE_ENV === 'production' ? 'docker' : 'local';
    })(),
};
