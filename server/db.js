const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'autograde.db');

let db = null;

// Initialize database
async function initDb() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // --- Schema Definition ---
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
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
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
        )`
    ];

    tables.forEach(sql => db.run(sql));

    // Insert sample data if users table is empty
    const result = db.exec('SELECT COUNT(*) as count FROM users');
    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;

    if (count === 0) {
        // Users
        db.run("INSERT INTO users (id, name, email, role) VALUES ('student-001', 'Prabin Giri', 'prabin@example.edu', 'student')");
        db.run("INSERT INTO users (id, name, email, role) VALUES ('faculty-001', 'Dr. Smith', 'smith@example.edu', 'faculty')");

        // Courses
        db.run("INSERT INTO courses (id, name, term) VALUES ('CSCI4060', 'Software Engineering', 'Spring 2026')");
        db.run("INSERT INTO courses (id, name, term) VALUES ('CSCI2100', 'Data Structures', 'Spring 2026')");
        db.run("INSERT INTO courses (id, name, term) VALUES ('CSCI1100', 'Intro to Computer Science', 'Spring 2026')");

        // Assignments
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('lang-platform', 'CSCI4060', 'Language and Platform', '2026-02-19', 'active')");
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('sprint-1', 'CSCI4060', 'Sprint 1 Planning', '2026-03-02', 'closed')");
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('linked-lists', 'CSCI2100', 'Linked List Utilities', '2026-02-18', 'late')");
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('stacks-queues', 'CSCI2100', 'Stacks and Queues', '2026-03-01', 'active')");
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('intro-lab', 'CSCI1100', 'Intro Lab', '2026-02-10', 'closed')");

        // Todos
        db.run("INSERT INTO todos (id, student_id, course_id, title, due_date) VALUES ('t1', 'student-001', 'CSCI4060', 'Review Sprint 1', '2026-02-18')");

        console.log('Database initialized with sample data');
        saveDb();
    }

    return db;
}

// Save database to file
function saveDb() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

// Helper to convert sql.js results to array of objects
function queryToObjects(result) {
    if (!result || result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    });
}

// Get single row as object
function queryOne(result) {
    const rows = queryToObjects(result);
    return rows.length > 0 ? rows[0] : null;
}

module.exports = { initDb, getDb: () => db, saveDb, queryToObjects, queryOne };
