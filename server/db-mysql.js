/**
 * MySQL adapter for deployment (e.g. PlanetScale, AWS RDS, Google Cloud SQL).
 * Set DATABASE_URL (e.g. mysql://user:pass@host:3306/dbname) or MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.
 */
const mysql = require('mysql2/promise');

let pool = null;

function getConfig() {
    if (process.env.DATABASE_URL) {
        const url = process.env.DATABASE_URL;
        const useSsl = process.env.MYSQL_SSL === '1' || /rds\.amazonaws\.com/.test(url);
        return useSsl ? { uri: url, ssl: { rejectUnauthorized: true } } : url;
    }
    const host = process.env.MYSQL_HOST || 'localhost';
    const useSsl = process.env.MYSQL_SSL === '1' || (host && host.includes('rds.amazonaws.com'));
    const config = {
        host,
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'autograde',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
    };
    if (useSsl) config.ssl = { rejectUnauthorized: true };
    return config;
}

const CREATE_TABLES = [
    `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        profile_picture VARCHAR(500) DEFAULT NULL,
        role VARCHAR(50) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS courses (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        term VARCHAR(255) NOT NULL,
        instructor_id VARCHAR(255),
        is_archived TINYINT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS assignments (
        id VARCHAR(255) PRIMARY KEY,
        course_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date DATETIME NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        points INT DEFAULT 100,
        language VARCHAR(50),
        starter_code_path VARCHAR(500),
        test_case_file_path VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        late_penalty_enabled INT DEFAULT 0,
        late_penalty_type VARCHAR(50) DEFAULT 'per_day',
        late_penalty_value DOUBLE DEFAULT 10,
        late_penalty_cap DOUBLE DEFAULT 50,
        allow_partial INT DEFAULT 0,
        partial_pct INT DEFAULT 0,
        style_points_possible DOUBLE DEFAULT 0,
        efficiency_points_possible DOUBLE DEFAULT 0,
        java_main_class VARCHAR(255),
        run_mode VARCHAR(50) DEFAULT 'program',
        type VARCHAR(50) DEFAULT 'individual',
        rubric_config TEXT,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id VARCHAR(255) NOT NULL,
        student_id VARCHAR(255) NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        grade DOUBLE DEFAULT NULL,
        feedback TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        grade_published INT DEFAULT 0,
        correctness_score DOUBLE DEFAULT NULL,
        style_points DOUBLE DEFAULT NULL,
        efficiency_points DOUBLE DEFAULT NULL,
        deduction_points DOUBLE DEFAULT 0,
        file_name_2 VARCHAR(500),
        file_path_2 VARCHAR(500),
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS todos (
        id VARCHAR(255) PRIMARY KEY,
        student_id VARCHAR(255) NOT NULL,
        course_id VARCHAR(255),
        title VARCHAR(500) NOT NULL,
        due_date DATETIME,
        completed TINYINT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS course_settings (
        student_id VARCHAR(255) NOT NULL,
        course_id VARCHAR(255) NOT NULL,
        color VARCHAR(50) NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (student_id, course_id),
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS course_documents (
        course_id VARCHAR(255) PRIMARY KEY,
        syllabus_path VARCHAR(500),
        schedule_path VARCHAR(500),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS test_cases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id VARCHAR(255) NOT NULL,
        input TEXT,
        expected_output TEXT NOT NULL,
        points INT DEFAULT 0,
        is_public TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        input_type VARCHAR(50) DEFAULT 'stdin',
        input_filename VARCHAR(255),
        output_filename VARCHAR(255),
        run_args TEXT,
        output_filename_2 VARCHAR(255),
        expected_output_2 TEXT,
        compare_mode VARCHAR(50) DEFAULT 'exact',
        stdin TEXT,
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS course_enrollments (
        course_id VARCHAR(255) NOT NULL,
        student_id VARCHAR(255) NOT NULL,
        enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (course_id, student_id),
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS course_tas (
        course_id VARCHAR(255) NOT NULL,
        ta_id VARCHAR(255) NOT NULL,
        permissions JSON,
        enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (course_id, ta_id),
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY (ta_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
];

async function initDb() {
    const config = getConfig();
    const poolConfig = typeof config === 'string' ? { uri: config } : config;

    // When using MYSQL_* vars, create the database if it doesn't exist (no manual step needed)
    if (typeof config === 'object' && config.database) {
        const dbName = config.database;
        try {
            const tempConn = await mysql.createConnection({ ...config, database: undefined });
            await tempConn.execute(`CREATE DATABASE IF NOT EXISTS \`${String(dbName).replace(/`/g, '``')}\``);
            await tempConn.end();
        } catch (e) {
            if (e.code !== 'ER_ACCESS_DENIED_ERROR' && e.code !== 'ER_BAD_DB_ERROR') throw e;
        }
    }

    pool = mysql.createPool(poolConfig);

    for (const sql of CREATE_TABLES) {
        await pool.execute(sql);
    }

    // Ensure rubric_config column exists even on older databases
    try {
        await pool.execute('ALTER TABLE assignments ADD COLUMN rubric_config TEXT');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure users.verified exists (faculty pending admin approval)
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN verified TINYINT DEFAULT 1');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }

    const [rows] = await pool.execute('SELECT COUNT(*) AS count FROM users');
    const count = rows[0]?.count ?? 0;
    if (count === 0) {
        await pool.execute("INSERT INTO users (id, name, email, password, role) VALUES ('student-001', 'Prabin Giri', 'prabin@example.edu', 'password123', 'student')");
        await pool.execute("INSERT INTO users (id, name, email, password, role) VALUES ('faculty-001', 'Dr. Smith', 'smith@example.edu', 'password123', 'faculty')");
        await pool.execute("INSERT INTO users (id, name, email, password, role) VALUES ('admin-001', 'Admin User', 'faculty1@gmail.com', 'password123', 'admin')");
        await pool.execute("INSERT INTO courses (id, name, term, instructor_id) VALUES ('CSCI4060', 'Software Engineering', 'Spring 2026', 'faculty-001')");
        await pool.execute("INSERT INTO courses (id, name, term, instructor_id) VALUES ('CSCI2100', 'Data Structures', 'Spring 2026', 'faculty-001')");
        await pool.execute("INSERT INTO courses (id, name, term, instructor_id) VALUES ('CSCI1100', 'Intro to Computer Science', 'Spring 2026', 'faculty-001')");
        await pool.execute("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('lang-platform', 'CSCI4060', 'Language and Platform', '2026-02-19', 'active')");
        await pool.execute("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('sprint-1', 'CSCI4060', 'Sprint 1 Planning', '2026-03-02', 'closed')");
        await pool.execute("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('linked-lists', 'CSCI2100', 'Linked List Utilities', '2026-02-18', 'late')");
        await pool.execute("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('stacks-queues', 'CSCI2100', 'Stacks and Queues', '2026-03-01', 'active')");
        await pool.execute("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('intro-lab', 'CSCI1100', 'Intro Lab', '2026-02-10', 'closed')");
        await pool.execute("INSERT INTO todos (id, student_id, course_id, title, due_date) VALUES ('t1', 'student-001', 'CSCI4060', 'Review Sprint 1', '2026-02-18')");
        await pool.execute("INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES ('CSCI4060', 'student-001')");
        await pool.execute("INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES ('CSCI2100', 'student-001')");
        await pool.execute("INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES ('CSCI1100', 'student-001')");
        console.log('Database initialized with sample data (MySQL)');
    }

    return pool;
}

function getDb() {
    return pool;
}

async function query(sql, params = []) {
    if (!pool) throw new Error('Database not initialized');
    const [rows] = await pool.execute(sql, params);
    return Array.isArray(rows) ? rows : [];
}

async function run(sql, params = []) {
    if (!pool) throw new Error('Database not initialized');
    await pool.execute(sql, params);
}

async function saveDb() {
    return Promise.resolve();
}

async function fetchOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

function queryOne(result) {
    const rows = queryToObjects(result);
    return rows.length > 0 ? rows[0] : null;
}

function queryToObjects(result) {
    if (!result) return [];
    // If it's the [rows, fields] array from mysql2
    if (Array.isArray(result) && Array.isArray(result[0])) {
        return result[0];
    }
    // If it's just the rows array
    return Array.isArray(result) ? result : [];
}

module.exports = { initDb, getDb, query, run, saveDb, queryOne, fetchOne, queryToObjects, isMySQL: true };
