#!/usr/bin/env node
/**
 * Full grader test: seed one assignment with test cases + a submission file, then run the grader.
 * Run from server/: node grader/scripts/fullGraderTest.js
 * With remote Docker: DOCKER_HOST=ssh://user@host node grader/scripts/fullGraderTest.js
 */
const path = require('path');
const fs = require('fs');

const serverDir = path.join(__dirname, '../..');
const uploadsDir = path.join(serverDir, 'uploads');

function getRows(db, sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

async function main() {
    const db = require(path.join(serverDir, 'db.js'));
    const { initDb, getDb, saveDb } = db;

    await initDb();
    const { initGraderSchema } = require(path.join(serverDir, 'grader/initGraderSchema.js'));
    initGraderSchema();

    const d = getDb();
    if (!d) throw new Error('DB not initialized');

    const assignmentId = 'intro-lab';
    const studentId = 'student-001';

    d.run("UPDATE assignments SET language = 'python' WHERE id = ?", [assignmentId]);

    const existingTests = getRows(d, 'SELECT id FROM test_cases WHERE assignment_id = ?', [assignmentId]);
    if (existingTests.length === 0) {
        d.run(
            "INSERT INTO test_cases (assignment_id, input, expected_output, points, is_public) VALUES (?, ?, ?, ?, ?)",
            [assignmentId, 'hello from test\n', 'hello from test', 50, 1]
        );
        d.run(
            "INSERT INTO test_cases (assignment_id, input, expected_output, points, is_public) VALUES (?, ?, ?, ?, ?)",
            [assignmentId, '42\n', '42', 50, 1]
        );
    }

    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const fileName = `grader-fulltest-${Date.now()}.py`;
    fs.writeFileSync(path.join(uploadsDir, fileName), 'import sys\nprint(sys.stdin.read().strip())');

    const existingSub = getRows(d, 'SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?', [assignmentId, studentId]);
    let submissionId;
    if (existingSub.length > 0) {
        submissionId = existingSub[0].id;
        d.run("UPDATE submissions SET file_path = ?, file_name = ?, status = 'pending', updated_at = datetime('now') WHERE id = ?", [fileName, fileName, submissionId]);
    } else {
        d.run(
            "INSERT INTO submissions (assignment_id, student_id, file_name, file_path, submitted_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
            [assignmentId, studentId, fileName, fileName]
        );
        const last = getRows(d, 'SELECT last_insert_rowid() as id', []);
        submissionId = last[0].id;
    }
    saveDb();

    console.log('Submission ID:', submissionId);
    console.log('Running grader...\n');

    const { gradeSubmission } = require(path.join(serverDir, 'grader/gradeSubmission.js'));
    const result = await gradeSubmission(submissionId);
    console.log('Grade:', result.grade);
    console.log('Raw score:', result.rawScore, '/', result.maxPossible);
    if (result.latePenaltyPercent) console.log('Late penalty %:', result.latePenaltyPercent);
    console.log('Feedback:', result.feedback || '(none)');
    if (result.results?.length) {
        console.log('Test results:', result.results.length);
        result.results.forEach((r, i) => console.log(`  ${i + 1}. passed=${r.passed} points=${r.points}${r.error ? ' error=' + r.error : ''}`));
    }
    console.log('\nFull grader test done.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
