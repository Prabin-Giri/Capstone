/**
 * Add grader-related columns to existing tables (SQLite). MySQL schema already includes these in CREATE TABLE.
 * Safe to run multiple times (ignores "duplicate column").
 */
async function initGraderSchema() {
    const db = require('../db');
    if (db.isMySQL) return;

    const assignmentColumns = [
        ['late_penalty_enabled', 'INTEGER DEFAULT 0'],
        ['late_penalty_type', 'TEXT DEFAULT "per_day"'],
        ['late_penalty_value', 'REAL DEFAULT 10'],
        ['late_penalty_cap', 'REAL DEFAULT 50'],
        ['allow_partial', 'INTEGER DEFAULT 0'],
        ['partial_pct', 'INTEGER DEFAULT 0'],
        ['style_points_possible', 'REAL DEFAULT 0'],
        ['efficiency_points_possible', 'REAL DEFAULT 0'],
        ['java_main_class', 'TEXT DEFAULT NULL'],
        ['run_mode', 'TEXT DEFAULT "program"'],
    ];

    for (const [col, def] of assignmentColumns) {
        try {
            await db.run(`ALTER TABLE assignments ADD COLUMN ${col} ${def}`);
        } catch (e) {
            if (!e.message || !e.message.includes('duplicate')) throw e;
        }
    }

    const submissionColumns = [
        ['grade_published', 'INTEGER DEFAULT 0'],
        ['correctness_score', 'REAL DEFAULT NULL'],
        ['style_points', 'REAL DEFAULT NULL'],
        ['efficiency_points', 'REAL DEFAULT NULL'],
        ['deduction_points', 'REAL DEFAULT 0'],
        ['file_name_2', 'TEXT DEFAULT NULL'],
        ['file_path_2', 'TEXT DEFAULT NULL'],
    ];
    for (const [col, def] of submissionColumns) {
        try {
            await db.run(`ALTER TABLE submissions ADD COLUMN ${col} ${def}`);
        } catch (e) {
            if (!e.message || !e.message.includes('duplicate')) throw e;
        }
    }

    const testCaseColumns = [
        ['input_type', 'TEXT DEFAULT "stdin"'],
        ['input_filename', 'TEXT DEFAULT NULL'],
        ['output_filename', 'TEXT DEFAULT NULL'],
        ['run_args', 'TEXT DEFAULT NULL'],
        ['output_filename_2', 'TEXT DEFAULT NULL'],
        ['expected_output_2', 'TEXT DEFAULT NULL'],
        ['compare_mode', 'TEXT DEFAULT "exact"'],
        ['stdin', 'TEXT DEFAULT NULL'],
    ];
    for (const [col, def] of testCaseColumns) {
        try {
            await db.run(`ALTER TABLE test_cases ADD COLUMN ${col} ${def}`);
        } catch (e) {
            if (!e.message || !e.message.includes('duplicate')) throw e;
        }
    }

    await db.saveDb();
}

module.exports = { initGraderSchema };
