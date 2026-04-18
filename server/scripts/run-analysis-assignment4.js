const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function readEnv(envPath) {
    const content = fs.readFileSync(envPath, 'utf8');
    const out = {};
    for (const line of content.split(/\r?\n/)) {
        if (!line || line.trim().startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx === -1) continue;
        out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return out;
}

async function main() {
    const repoRoot = path.join(__dirname, '..', '..');
    const env = readEnv(path.join(repoRoot, '.env'));
    const conn = await mysql.createConnection({
        host: env.MYSQL_HOST,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        database: env.MYSQL_DATABASE,
        port: Number(env.MYSQL_PORT || 3306),
    });

    const [aRows] = await conn.query(
        `SELECT a.id, c.instructor_id
         FROM assignments a
         JOIN courses c ON c.id = a.course_id
         JOIN users u ON u.id = c.instructor_id
         WHERE a.title = ? AND u.email = ?
         ORDER BY a.id DESC LIMIT 1`,
        ['Assignment4', 'f1@gmail.com']
    );
    if (!aRows.length) throw new Error('Assignment4 not found for f1@gmail.com');
    const assignmentId = aRows[0].id;
    const instructorId = aRows[0].instructor_id;

    const [sRows] = await conn.query(
        `SELECT s.id
         FROM submissions s
         WHERE s.assignment_id = ?
         ORDER BY s.id DESC`,
        [assignmentId]
    );
    await conn.end();

    for (const row of sRows) {
        const res = await fetch(`http://localhost:3001/api/ai-detector/submissions/${row.id}/run?batch=true&user_id=${encodeURIComponent(instructorId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch: true, user_id: instructorId }),
        });
        if (!res.ok) {
            const text = await res.text();
            console.warn(`AI detection failed for submission ${row.id}: ${res.status} ${text}`);
        }
    }

    const pRes = await fetch(`http://localhost:3001/api/assignments/${encodeURIComponent(assignmentId)}/plagiarism-check`, {
        method: 'POST',
    });
    const report = await pRes.json();
    if (!pRes.ok) {
        throw new Error(`Plagiarism check failed: ${JSON.stringify(report)}`);
    }

    console.log(`Assignment ${assignmentId} plagiarism pairs: ${report.flaggedPairs?.length || 0}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
