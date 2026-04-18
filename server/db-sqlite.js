/**
 * SQLite adapter (sql.js) - default for local dev.
 * Exposes async query/run so the same code works with MySQL when deployed.
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { courseOfferingStorageId } = require('./courseOfferingKey');
const { migrateSqliteCourseOfferings } = require('./courseOfferingMigrate');

const dbPath = path.join(__dirname, 'autograde.db');
let db = null;

function shouldSeedSampleData() {
    const explicit = process.env.AUTO_SEED_SAMPLE_DATA;
    if (explicit != null) return /^(1|true|yes)$/i.test(String(explicit));
    return true;
}

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
            course_code TEXT,
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
        )`,
        `CREATE TABLE IF NOT EXISTS assignment_groups (
            id TEXT PRIMARY KEY,
            assignment_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS group_members (
            group_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            PRIMARY KEY (group_id, student_id),
            FOREIGN KEY (group_id) REFERENCES assignment_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT DEFAULT NULL,
            subject TEXT NOT NULL,
            created_by TEXT NOT NULL,
            is_starred INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS conversation_participants (
            conversation_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            last_read_at TEXT DEFAULT NULL,
            is_starred INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            PRIMARY KEY (conversation_id, user_id),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            sender_id TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS saved_rubrics (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL,
            name TEXT NOT NULL,
            rubric_json TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(course_id, name),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
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
        'ALTER TABLE assignments ADD COLUMN group_submission_type TEXT DEFAULT "one_for_all"',
        'ALTER TABLE assignments ADD COLUMN max_group_members INTEGER DEFAULT NULL',
        'ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 1',
        'ALTER TABLE submissions ADD COLUMN feedback TEXT DEFAULT NULL',
        'ALTER TABLE submissions ADD COLUMN auto_grade REAL DEFAULT NULL',
        'ALTER TABLE submissions ADD COLUMN auto_feedback TEXT DEFAULT NULL',
        'ALTER TABLE users ADD COLUMN student_id TEXT DEFAULT NULL',
        'ALTER TABLE courses ADD COLUMN course_code TEXT',
        `CREATE TABLE IF NOT EXISTS course_tas (
            course_id TEXT NOT NULL,
            ta_id TEXT NOT NULL,
            permissions TEXT,
            PRIMARY KEY (course_id, ta_id),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (ta_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS course_enrollments (
            course_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (course_id, student_id),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
    ];
    for (const sql of migrations) {
        try { db.run(sql); } catch (e) {
            if (!e.message || (!e.message.includes('duplicate') && !e.message.includes('already exists'))) {
                // ignore "already exists" / "duplicate column" errors, rethrow others
            }
        }
    }

    try {
        migrateSqliteCourseOfferings(db);
        saveDbSync();
    } catch (e) {
        console.error('[SQLite] course offering migrate:', e.message || e);
    }

    const result = db.exec('SELECT COUNT(*) as count FROM users');
    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
    if (count === 0 && shouldSeedSampleData()) {
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('student-001', 'Prabin Giri', 'prabin@example.edu', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('faculty-001', 'Dr. Smith', 'smith@example.edu', 'password123', 'faculty')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('admin-001', 'Admin User', 'faculty1@gmail.com', 'password123', 'admin')");
        const termSeed = 'Spring 2026';
        const id4060 = courseOfferingStorageId('CSCI4060', termSeed);
        const id2100 = courseOfferingStorageId('CSCI2100', termSeed);
        const id1100 = courseOfferingStorageId('CSCI1100', termSeed);
        db.run('INSERT INTO courses (id, course_code, name, term, instructor_id) VALUES (?, ?, ?, ?, ?)', [id4060, 'CSCI4060', 'Software Engineering', termSeed, 'faculty-001']);
        db.run('INSERT INTO courses (id, course_code, name, term, instructor_id) VALUES (?, ?, ?, ?, ?)', [id2100, 'CSCI2100', 'Data Structures', termSeed, 'faculty-001']);
        db.run('INSERT INTO courses (id, course_code, name, term, instructor_id) VALUES (?, ?, ?, ?, ?)', [id1100, 'CSCI1100', 'Intro to Computer Science', termSeed, 'faculty-001']);
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('lang-platform', ?, 'Language and Platform', '2026-02-19', 'active')", [id4060]);
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('sprint-1', ?, 'Sprint 1 Planning', '2026-03-02', 'closed')", [id4060]);
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('linked-lists', ?, 'Linked List Utilities', '2026-02-18', 'late')", [id2100]);
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('stacks-queues', ?, 'Stacks and Queues', '2026-03-01', 'active')", [id2100]);
        db.run("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('intro-lab', ?, 'Intro Lab', '2026-02-10', 'closed')", [id1100]);
        db.run("INSERT INTO todos (id, student_id, course_id, title, due_date) VALUES ('t1', 'student-001', ?, 'Review Sprint 1', '2026-02-18')", [id4060]);
        
        // --- Mock Data for Plagiarism Checker ---
        // 3 Students
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag1', 'Alice Coder', 'alice@b.c', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag2', 'Bob Copier', 'bob@b.c', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag3', 'Charlie Original', 'charlie@b.c', 'password123', 'student')");
        
        // Enroll in course CSCI4060 (offering id)
        db.run('INSERT INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [id4060, 'std-plag1']);
        db.run('INSERT INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [id4060, 'std-plag2']);
        db.run('INSERT INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [id4060, 'std-plag3']);
        
        // Submissions for assignment 'lang-platform'
        db.run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag1', 'plag1.py', 'plag1.py', 'pending')");
        db.run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag2', 'plag2.py', 'plag2.py', 'pending')");
        db.run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag3', 'plag3.py', 'plag3.py', 'pending')");

        // --- Additional Mock Data for Plagiarism Checker Extensions ---
        
        // Single File High/Moderate/Low Plagiarism students
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag4', 'Dave Clone', 'dave@b.c', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag5', 'Eve Mimic', 'eve@b.c', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag6', 'Frank Reorder', 'frank@b.c', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag7', 'Grace Mod', 'grace@b.c', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag8', 'Hank Unique', 'hank@b.c', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag9', 'Ivy Divergent', 'ivy@b.c', 'password123', 'student')");
        
        // Multi-File Plagiarism students
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag10', 'Jack Multi', 'jack@b.c', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag11', 'Karen Multi', 'karen@b.c', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag12', 'Leo Refactor', 'leo@b.c', 'password123', 'student')");
        db.run("INSERT INTO users (id, name, email, password, role) VALUES ('std-plag13', 'Mia Safe', 'mia@b.c', 'password123', 'student')");

        // Enroll everyone
        for(let i=4; i<=13; i++) {
            db.run('INSERT INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [id4060, `std-plag${i}`]);
        }

        // Add single-file submissions
        db.run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag4', 'plag4.py', 'plag4.py', 'pending')");
        db.run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag5', 'plag5.py', 'plag5.py', 'pending')");
        db.run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag6', 'plag6.py', 'plag6.py', 'pending')");
        db.run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag7', 'plag7.py', 'plag7.py', 'pending')");
        db.run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag8', 'plag8.py', 'plag8.py', 'pending')");
        db.run("INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag9', 'plag9.py', 'plag9.py', 'pending')");

        // Add multi-file submissions (using JSON array string for file_path)
        const jackFiles = JSON.stringify([{name: 'main.py', path:'plag10-main.py'}, {name: 'utils.py', path:'plag10-utils.py'}]);
        db.run(`INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag10', 'multi-files', '${jackFiles}', 'pending')`);
        
        const karenFiles = JSON.stringify([{name: 'app.py', path:'plag11-app.py'}, {name: 'helpers.py', path:'plag11-helpers.py'}]);
        db.run(`INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag11', 'multi-files', '${karenFiles}', 'pending')`);
        
        const leoFiles = JSON.stringify([{name: 'main.py', path:'plag12-main.py'}, {name: 'logic.py', path:'plag12-logic.py'}, {name: 'base.py', path:'plag12-base.py'}]);
        db.run(`INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag12', 'multi-files', '${leoFiles}', 'pending')`);
        
        const miaFiles = JSON.stringify([{name: 'script.py', path:'plag13-script.py'}, {name: 'functions.py', path:'plag13-functions.py'}]);
        db.run(`INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status) VALUES ('lang-platform', 'std-plag13', 'multi-files', '${miaFiles}', 'pending')`);

        console.log('Database initialized with sample data');
        saveDbSync();
    } else if (count === 0) {
        console.log('Users table is empty; sample data seeding skipped because AUTO_SEED_SAMPLE_DATA is disabled.');
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
