/**
 * SQLite adapter (sql.js) - default for local dev.
 * Exposes async query/run so the same code works with MySQL when deployed.
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'autograde.db');
let db = null;

async function initDb() {
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }
    db.run('PRAGMA foreign_keys = ON');

    const tables = [
        `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            role TEXT NOT NULL CHECK(role IN ('student', 'faculty', 'admin')),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS courses (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            term TEXT NOT NULL,
            is_archived INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS assignments (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            due_date TEXT NOT NULL,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'closed', 'late')),
            points INTEGER DEFAULT 100,
            language TEXT,
            starter_code_path TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            rubric_config TEXT,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'graded', 'returned')),
            grade REAL DEFAULT NULL,
            feedback TEXT DEFAULT NULL,
            submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            course_id TEXT,
            title TEXT NOT NULL,
            due_date TEXT,
            completed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
        )`,
        `CREATE TABLE IF NOT EXISTS course_settings (
            student_id TEXT NOT NULL,
            course_id TEXT NOT NULL,
            color TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (student_id, course_id),
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS course_documents (
            course_id TEXT PRIMARY KEY,
            syllabus_path TEXT,
            schedule_path TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS test_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id TEXT NOT NULL,
            input TEXT,
            expected_output TEXT NOT NULL,
            points INTEGER DEFAULT 0,
            is_public INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
        )`
    ];
    tables.forEach(sql => db.run(sql));

    // Add columns that may be missing (MySQL schema additions not in original SQLite schema)
    const migrations = [
        'ALTER TABLE users ADD COLUMN password TEXT',
        'ALTER TABLE users ADD COLUMN profile_picture TEXT DEFAULT NULL',
        'ALTER TABLE courses ADD COLUMN instructor_id TEXT',
        'ALTER TABLE assignments ADD COLUMN test_case_file_path TEXT',
        'ALTER TABLE assignments ADD COLUMN type TEXT DEFAULT "individual"',
        'ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 1',
        'ALTER TABLE submissions ADD COLUMN feedback TEXT DEFAULT NULL',
        `CREATE TABLE IF NOT EXISTS course_enrollments (
            course_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (course_id, student_id),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS course_tas (
            course_id TEXT NOT NULL,
            ta_id TEXT NOT NULL,
            permissions TEXT,
            enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (course_id, ta_id),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (ta_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
    ];
    for (const sql of migrations) {
        try { db.run(sql); } catch (e) {
            if (!e.message || (!e.message.includes('duplicate') && !e.message.includes('already exists'))) {
                // ignore "already exists" / "duplicate column" errors, rethrow others
            }
        }
    }

    const result = db.exec('SELECT COUNT(*) as count FROM users');
    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
    if (count === 0) {
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('student-001', 'Prabin Giri', 'prabin@example.edu', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('faculty-001', 'Dr. Smith', 'smith@example.edu', 'password123', 'faculty')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('admin-001', 'Admin User', 'faculty1@gmail.com', 'password123', 'admin')");
        db.run("INSERT INTO courses (id, name, term, instructor_id) VALUES ('CSCI4060', 'Software Engineering', 'Spring 2026', 'faculty-001')");
        db.run("INSERT INTO courses (id, name, term, instructor_id) VALUES ('CSCI2100', 'Data Structures', 'Spring 2026', 'faculty-001')");
        db.run("INSERT INTO courses (id, name, term, instructor_id) VALUES ('CSCI1100', 'Intro to Computer Science', 'Spring 2026', 'faculty-001')");
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('lang-platform', 'CSCI4060', 'Language and Platform', '2026-02-19', 'active')");
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('sprint-1', 'CSCI4060', 'Sprint 1 Planning', '2026-03-02', 'closed')");
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('linked-lists', 'CSCI2100', 'Linked List Utilities', '2026-02-18', 'late')");
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('stacks-queues', 'CSCI2100', 'Stacks and Queues', '2026-03-01', 'active')");
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('intro-lab', 'CSCI1100', 'Intro Lab', '2026-02-10', 'closed')");
        db.run("INSERT INTO todos (id, student_id, course_id, title, due_date) VALUES ('t1', 'student-001', 'CSCI4060', 'Review Sprint 1', '2026-02-18')");
        console.log('Database initialized with sample data');
        saveDbSync();
    }
    return db;
}

// MySQL-compatible wrapper so routes calling getDb().execute() work unchanged
function getDbWrapper() {
    return {
        execute(sql, params = []) {
            if (!db) return Promise.reject(new Error('Database not initialized'));
            const trimmed = sql.trim().toUpperCase();
            const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('PRAGMA');
            if (isSelect) {
                return Promise.resolve([query(sql, params), []]).then(async ([p]) => {
                    const rows = await p;
                    return [rows, []];
                });
            } else {
                return run(sql, params).then(() => {
                    saveDbSync();
                    return [{ affectedRows: db.getRowsModified() }, []];
                });
            }
        },
        end() { return Promise.resolve(); },
    };
}

function queryOne(result) {
    const rows = queryToObjects(result);
    return rows.length > 0 ? rows[0] : null;
}

function getDb() {
    return getDbWrapper();
}

function saveDbSync() {
    if (db) {
        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
    }
}

function saveDb() {
    saveDbSync();
    return Promise.resolve();
}

// Async API (same shape as MySQL so one codebase works)
function query(sql, params = []) {
    if (!db) return Promise.reject(new Error('Database not initialized'));
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return Promise.resolve(rows);
}

async function fetchOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

function run(sql, params = []) {
    if (!db) return Promise.reject(new Error('Database not initialized'));
    try {
        db.run(sql, params);
    } catch (e) {
        return Promise.reject(e);
    }
    return Promise.resolve();
}

async function queryOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

function queryToObjects(result) {
    if (!result) return [];
    // If it's a raw array (from our wrapper's execute)
    if (Array.isArray(result)) {
        return Array.isArray(result[0]) ? result[0] : result;
    }
    // If it's the sql.js result object { columns, values }
    if (result.columns && result.values) {
        const columns = result.columns;
        return result.values.map(row => {
            const obj = {};
            columns.forEach((col, i) => { obj[col] = row[i]; });
            return obj;
        });
    }
    return [];
}

module.exports = { initDb, getDb, saveDb, saveDbSync, query, run, queryOne, fetchOne, queryToObjects, isMySQL: false };
