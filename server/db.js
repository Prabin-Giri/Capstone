const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

let pool = null;

const CONNECT_TIMEOUT_MS = 10000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

function getDbConfig() {
    const host = process.env.MYSQL_HOST || process.env.DB_HOST;
    const user = process.env.MYSQL_USER || process.env.DB_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
    const database = process.env.MYSQL_DATABASE || process.env.DB_NAME || 'intelligrade';
    const port = process.env.MYSQL_PORT || process.env.DB_PORT || '3306';
    const useSsl = process.env.MYSQL_SSL === '1' || process.env.USE_SSL === 'true' ||
        (host && host.includes('rds.amazonaws.com'));
    return { host, user, password, database, port, useSsl };
}

function formatDbError(err, config) {
    const code = err.code || '';
    const msg = err.message || '';
    const host = config?.host || process.env.MYSQL_HOST || process.env.DB_HOST;
    const port = config?.port || process.env.MYSQL_PORT || process.env.DB_PORT || '3306';
    if (code === 'ECONNREFUSED') {
        return `Cannot connect to MySQL at ${host}:${port}. ` +
            'Ensure MySQL is running and MYSQL_HOST (or DB_HOST) in .env is correct.';
    }
    if (code === 'ETIMEDOUT' || code === 'ECONNRESET') {
        return (
            `Connection to MySQL at ${host}:${port} timed out. ` +
            'If using cloud MySQL (e.g. AWS RDS), ensure the security group allows inbound TCP:3306 from your IP. ' +
            'Otherwise verify MySQL is running and MYSQL_HOST/DB_HOST are correct.'
        );
    }
    if (code === 'ER_ACCESS_DENIED_ERROR') {
        return 'MySQL access denied. Check MYSQL_USER/MYSQL_PASSWORD (or DB_USER/DB_PASSWORD) in .env.';
    }
    if (code === 'ER_BAD_DB_ERROR') {
        const db = config?.database || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'intelligrade';
        return `Database "${db}" not found. It will be created if the connection user has permission.`;
    }
    if (code === 'PROTOCOL_CONNECTION_LOST' || code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR') {
        return 'MySQL connection was lost. The server may have closed the connection.';
    }
    return msg;
}

/**
 * Initializes the MySQL connection pool and creates the database/tables if they don't exist.
 * Uses retries and timeouts to handle MySQL not ready or temporarily unavailable.
 */
async function initDb() {
    if (pool) return pool;

    const config = getDbConfig();
    const { host, user, password, database, port, useSsl } = config;
    if (!host) {
        throw new Error('MYSQL_HOST or DB_HOST is required in .env (e.g. your AWS RDS endpoint or Google Cloud SQL IP).');
    }

    const portNum = parseInt(port, 10);
    const baseOptions = {
        host,
        user,
        password,
        port: portNum,
        connectTimeout: CONNECT_TIMEOUT_MS,
        ...(useSsl && {
            ssl: {
                rejectUnauthorized: process.env.DB_SSL_VERIFY !== 'false'
            }
        })
    };

    let lastError;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        try {
            // 1. Initial connection without database to create it if missing
            const connection = await mysql.createConnection(baseOptions);

            await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
            await connection.end();

            // 2. Create the actual connection pool
            pool = mysql.createPool({
                ...baseOptions,
                database,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 0
            });

            console.log(`Database: Connected to MySQL at ${host}:${portNum} (Database: ${database})`);

            // 3. Initialize Schema
            await initializeSchema();

            return pool;
        } catch (err) {
            lastError = err;
            const friendly = formatDbError(err, { ...config, port: String(portNum) });
            console.error(`❌ Database attempt ${attempt}/${RETRY_ATTEMPTS} failed: ${friendly}`);
            if (attempt < RETRY_ATTEMPTS) {
                console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }
        }
    }

    console.error('Database Initialization Failed after', RETRY_ATTEMPTS, 'attempts.');
    const e = new Error(formatDbError(lastError, { ...config, port: String(portNum) }));
    e.original = lastError;
    throw e;
}

async function initializeSchema() {
    const schema = [
        `CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE,
            password VARCHAR(255),
            role ENUM('student', 'faculty', 'admin', 'ta') NOT NULL,
            profile_picture VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS courses(
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        term VARCHAR(255) NOT NULL,
        instructor_id VARCHAR(255),
        is_archived TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY(instructor_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
        `CREATE TABLE IF NOT EXISTS course_enrollments(
        course_id VARCHAR(255) NOT NULL,
        student_id VARCHAR(255) NOT NULL,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(course_id, student_id),
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS assignments(
        id VARCHAR(255) PRIMARY KEY,
        course_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date DATETIME NOT NULL,
        status ENUM('active', 'closed', 'late') DEFAULT 'active',
        points INTEGER DEFAULT 100,
        language VARCHAR(50),
        starter_code_path VARCHAR(255),
        test_case_file_path VARCHAR(255),
        type ENUM('individual', 'group') DEFAULT 'individual',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS submissions(
        id INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id VARCHAR(255) NOT NULL,
        student_id VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        status ENUM('pending', 'graded', 'returned') DEFAULT 'pending',
        grade FLOAT DEFAULT NULL,
        feedback TEXT DEFAULT NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY(assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
        FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS todos(
        id VARCHAR(255) PRIMARY KEY,
        student_id VARCHAR(255) NOT NULL,
        course_id VARCHAR(255),
        title VARCHAR(255) NOT NULL,
        due_date DATETIME,
        completed TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE SET NULL
    )`,
        `CREATE TABLE IF NOT EXISTS course_settings(
        student_id VARCHAR(255) NOT NULL,
        course_id VARCHAR(255) NOT NULL,
        color VARCHAR(50) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY(student_id, course_id),
        FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS course_documents(
        course_id VARCHAR(255) PRIMARY KEY,
        syllabus_path VARCHAR(255),
        schedule_path VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS test_cases(
        id INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id VARCHAR(255) NOT NULL,
        input TEXT,
        expected_output TEXT NOT NULL,
        points INTEGER DEFAULT 0,
        is_public TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY(assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    )`
    ];

    for (const sql of schema) {
        await pool.query(sql);
    }

    // Seed initial data if users table is empty
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM users');
    if (rows[0].count === 0) {
        console.log('Seeding initial data...');
        await pool.query("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
            ['admin-001', 'Admin User', 'faculty1@gmail.com', 'password123', 'admin']);
        await pool.query("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
            ['faculty-001', 'Dr. Smith', 'smith@example.edu', 'password123', 'faculty']);
        await pool.query("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
            ['student-001', 'Prabin Giri', 'prabin@example.edu', 'password123', 'student']);

        await pool.query("INSERT INTO courses (id, name, term, instructor_id) VALUES (?, ?, ?, ?)",
            ['CSCI4060', 'Software Engineering', 'Spring 2026', 'faculty-001']);
        await pool.query("INSERT INTO assignments (id, course_id, title, due_date) VALUES (?, ?, ?, ?)",
            ['lang-platform', 'CSCI4060', 'Language and Platform', '2026-02-19 00:00:00']);
    }

    // Late penalty columns (faculty-configured; used by autograder with submission submitted_at vs due_date)
    const [lateCols] = await pool.query("SHOW COLUMNS FROM assignments LIKE 'late_penalty_enabled'");
    if (!lateCols || lateCols.length === 0) {
        await pool.query("ALTER TABLE assignments ADD COLUMN late_penalty_enabled TINYINT(1) DEFAULT 0");
        await pool.query("ALTER TABLE assignments ADD COLUMN late_penalty_type VARCHAR(50) DEFAULT 'per_day'");
        await pool.query("ALTER TABLE assignments ADD COLUMN late_penalty_value DOUBLE DEFAULT 10");
        await pool.query("ALTER TABLE assignments ADD COLUMN late_penalty_cap DOUBLE DEFAULT 50");
    }
}

function queryToObjects(result) {
    return result[0];
}

function queryOne(result) {
    const rows = result[0];
    return rows.length > 0 ? rows[0] : null;
}

function getDb() {
    if (!pool) {
        throw new Error('Database not initialized. Ensure the server started successfully and MySQL is running.');
    }
    return pool;
}

async function query(sql, params) {
    const db = getDb();
    const [results] = await db.execute(sql, params);
    return results;
}

async function run(sql, params) {
    const db = getDb();
    await db.execute(sql, params);
}

async function saveDb() {
    // MySQL is persistent; no-op for compatibility
}

module.exports = {
    initDb,
    getDb,
    query,
    run,
    saveDb,
    queryToObjects,
    queryOne,
    isMySQL: true
};
