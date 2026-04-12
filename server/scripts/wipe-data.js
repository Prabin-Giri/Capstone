const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { initDb, run, saveDb, isMySQL } = require('../db');
const { deletePrefixFromS3, s3Enabled } = require('../s3');

const args = new Set(process.argv.slice(2));
const confirmed = args.has('--yes');
const keepLocalUploads = args.has('--keep-local-uploads');
const keepS3Uploads = args.has('--keep-s3-uploads');

const TABLES_IN_DELETE_ORDER = [
    'messages',
    'conversation_participants',
    'conversations',
    'group_members',
    'assignment_groups',
    'course_tas',
    'course_enrollments',
    'todos',
    'course_settings',
    'course_documents',
    'test_cases',
    'submissions',
    'assignments',
    'courses',
    'users',
];

const AUTO_INCREMENT_TABLES = ['messages', 'conversations', 'test_cases', 'submissions'];
const LOCAL_UPLOADS_DIR = path.join(__dirname, '../uploads');

function printUsageAndExit() {
    console.error('This script permanently deletes application data but preserves the schema.');
    console.error('It clears users, courses, assignments, submissions, conversations, enrollments, and related records.');
    console.error('It also clears local uploads and S3-backed uploads unless you opt out.');
    console.error('');
    console.error('Before running against an environment you want to stay empty, set AUTO_SEED_SAMPLE_DATA=0 in that environment.');
    console.error('');
    console.error('Usage: node server/scripts/wipe-data.js --yes [--keep-local-uploads] [--keep-s3-uploads]');
    process.exit(1);
}

async function wipeTables() {
    if (isMySQL) {
        await run('SET FOREIGN_KEY_CHECKS = 0');
        try {
            for (const table of TABLES_IN_DELETE_ORDER) {
                await run(`DELETE FROM ${table}`);
            }
            for (const table of AUTO_INCREMENT_TABLES) {
                await run(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
            }
        } finally {
            await run('SET FOREIGN_KEY_CHECKS = 1');
        }
        return;
    }

    await run('PRAGMA foreign_keys = OFF');
    try {
        for (const table of TABLES_IN_DELETE_ORDER) {
            await run(`DELETE FROM ${table}`);
        }
        await run(`DELETE FROM sqlite_sequence WHERE name IN (${AUTO_INCREMENT_TABLES.map(() => '?').join(', ')})`, AUTO_INCREMENT_TABLES);
        await saveDb();
    } finally {
        await run('PRAGMA foreign_keys = ON');
        await saveDb();
    }
}

function wipeLocalUploads() {
    if (!fs.existsSync(LOCAL_UPLOADS_DIR)) return 0;
    let removed = 0;
    for (const entry of fs.readdirSync(LOCAL_UPLOADS_DIR, { withFileTypes: true })) {
        const target = path.join(LOCAL_UPLOADS_DIR, entry.name);
        fs.rmSync(target, { recursive: true, force: true });
        removed += 1;
    }
    return removed;
}

async function wipeS3Uploads() {
    let deleted = 0;
    for (const prefix of ['uploads/', 'submissions/']) {
        deleted += await deletePrefixFromS3(prefix);
    }
    return deleted;
}

async function main() {
    if (!confirmed) printUsageAndExit();

    await initDb();
    await wipeTables();

    let localRemoved = 0;
    if (!keepLocalUploads) {
        localRemoved = wipeLocalUploads();
    }

    let s3Removed = 0;
    if (!keepS3Uploads && s3Enabled) {
        s3Removed = await wipeS3Uploads();
    }

    console.log(`Wiped application data (${isMySQL ? 'MySQL' : 'SQLite'}) while preserving schema.`);
    console.log(`Local upload entries removed: ${keepLocalUploads ? 'skipped' : localRemoved}`);
    console.log(`S3 objects removed: ${keepS3Uploads ? 'skipped' : (s3Enabled ? s3Removed : 'S3 not configured')}`);
    console.log('Reminder: set AUTO_SEED_SAMPLE_DATA=0 before restarting if you want the database to stay empty.');
}

main().catch((err) => {
    console.error('Wipe failed:', err);
    process.exit(1);
});
