/**
 * MySQL adapter for deployment (e.g. PlanetScale, AWS RDS, Google Cloud SQL).
 * Set DATABASE_URL (e.g. mysql://user:pass@host:3306/dbname) or MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');

let pool = null;
let activePoolConfig = null;

function shouldSeedSampleData() {
    const explicit = process.env.AUTO_SEED_SAMPLE_DATA;
    if (explicit != null) return /^(1|true|yes)$/i.test(String(explicit));
    return process.env.NODE_ENV !== 'production';
}

function resolveSeedPassword() {
    const configured = String(process.env.SEED_DEFAULT_PASSWORD || '').trim();
    if (configured) return configured;
    const generated = crypto.randomBytes(9).toString('base64url');
    console.warn(`[db] SEED_DEFAULT_PASSWORD not set; generated one-time sample password: ${generated}`);
    return generated;
}

function getConfig() {
    if (process.env.DATABASE_URL) {
        const url = process.env.DATABASE_URL;
        const useSsl = process.env.MYSQL_SSL === '1' || /rds\.amazonaws\.com/.test(url);
        const rejectUnauthorized = process.env.DB_SSL_VERIFY !== 'false';
        return useSsl ? { uri: url, ssl: { rejectUnauthorized } } : url;
    }
    const host = process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost';
    const useSsl = process.env.MYSQL_SSL === '1' || (host && host.includes('rds.amazonaws.com'));
    const config = {
        host,
        port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
        user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
        password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || '',
        database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'autograde',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
    };
    if (useSsl) {
        const rejectUnauthorized = process.env.DB_SSL_VERIFY !== 'false';
        config.ssl = { rejectUnauthorized };
    }
    return config;
}

function buildPoolConfig(config) {
    if (typeof config === 'string') {
        return config;
    }

    return {
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        connectTimeout: parseInt(process.env.MYSQL_CONNECT_TIMEOUT || '10000', 10),
        ...config,
    };
}

function isRetryableConnectionError(error) {
    const code = error && error.code;
    const message = String((error && error.message) || '');

    return code === 'ECONNRESET'
        || code === 'PROTOCOL_CONNECTION_LOST'
        || code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'
        || code === 'EPIPE'
        || code === 'ETIMEDOUT'
        || /ECONNRESET|Connection lost|closed state/i.test(message);
}

async function recreatePool() {
    const previousPool = pool;
    pool = mysql.createPool(activePoolConfig);

    if (previousPool) {
        try {
            await previousPool.end();
        } catch (_) {
            // Ignore errors while replacing a broken pool.
        }
    }
}

async function runWithReconnect(method, sql, params = [], attempt = 0) {
    if (!pool) {
        throw new Error('Database not initialized');
    }

    try {
        return await pool[method](sql, params);
    } catch (error) {
        if (attempt > 0 || !isRetryableConnectionError(error)) {
            throw error;
        }

        console.error(`MySQL ${method} failed with ${error.code || error.message}. Recreating pool and retrying once.`);
        await recreatePool();
        return runWithReconnect(method, sql, params, attempt + 1);
    }
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
        id VARCHAR(500) PRIMARY KEY,
        course_code VARCHAR(255) NULL,
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
        group_submission_type VARCHAR(50) DEFAULT 'one_for_all',
        max_group_members INT DEFAULT NULL,
        rubric_config TEXT,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS assignment_groups (
        id VARCHAR(255) PRIMARY KEY,
        assignment_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS group_members (
        group_id VARCHAR(255) NOT NULL,
        student_id VARCHAR(255) NOT NULL,
        PRIMARY KEY (group_id, student_id),
        FOREIGN KEY (group_id) REFERENCES assignment_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id VARCHAR(255) NOT NULL,
        student_id VARCHAR(255) NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        content_hash VARCHAR(64) DEFAULT NULL,
        ai_analysis_state VARCHAR(32) DEFAULT 'pending',
        ai_analyzed_at DATETIME DEFAULT NULL,
        ai_reused_from_submission_id INT DEFAULT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        grade DOUBLE DEFAULT NULL,
        feedback TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        grade_published INT DEFAULT 0,
        correctness_score DOUBLE DEFAULT NULL,
        auto_grade DOUBLE DEFAULT NULL,
        auto_feedback TEXT DEFAULT NULL,
        style_points DOUBLE DEFAULT NULL,
        efficiency_points DOUBLE DEFAULT NULL,
        deduction_points DOUBLE DEFAULT 0,
        file_name_2 VARCHAR(500),
        file_path_2 VARCHAR(500),
        rubric_scores JSON DEFAULT NULL,
        INDEX idx_submissions_assignment_student_time (assignment_id, student_id, submitted_at),
        INDEX idx_submissions_content_hash (assignment_id, student_id, content_hash),
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS submission_ai_detections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        submission_id INT NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        language VARCHAR(50) NOT NULL,
        label VARCHAR(80) NOT NULL,
        raw_score DOUBLE DEFAULT NULL,
        calibrated_score DOUBLE DEFAULT NULL,
        score_used DOUBLE DEFAULT NULL,
        lower_threshold DOUBLE DEFAULT NULL,
        upper_threshold DOUBLE DEFAULT NULL,
        model_version VARCHAR(255) DEFAULT NULL,
        detector_payload LONGTEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_detections_submission_created (submission_id, created_at),
        FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
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
    `CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        course_id VARCHAR(255) DEFAULT NULL,
        subject VARCHAR(500) NOT NULL,
        created_by VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id INT NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        last_read_at DATETIME DEFAULT NULL,
        is_starred TINYINT DEFAULT 0,
        is_archived TINYINT DEFAULT 0,
        is_deleted TINYINT DEFAULT 0,
        PRIMARY KEY (conversation_id, user_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        sender_id VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS saved_rubrics (
        id VARCHAR(255) PRIMARY KEY,
        course_id VARCHAR(500) NOT NULL,
        name VARCHAR(255) NOT NULL,
        rubric_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY saved_rubrics_course_name (course_id, name),
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS login_audit (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NULL,
        outcome VARCHAR(32) NOT NULL,
        reason VARCHAR(64) NULL,
        ip VARCHAR(128) NULL,
        user_agent VARCHAR(512) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_login_audit_created (created_at),
        INDEX idx_login_audit_email (email(191))
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NULL,
        action VARCHAR(128) NOT NULL,
        detail TEXT NULL,
        ip VARCHAR(128) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_activity_user_time (user_id, created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(128) PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
];

async function initDb() {
    if (pool) return;

    const config = getConfig();
    activePoolConfig = buildPoolConfig(config);
    const host = activePoolConfig.host || activePoolConfig.uri;
    console.log(`[Agnos DB] Initializing MySQL pool for host: ${host}`);
    
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

    pool = mysql.createPool(activePoolConfig);

    try {
        console.log('[Agnos DB] Testing connection...');
        await pool.execute('SELECT 1');
        console.log('[Agnos DB] Connection successful.');

        for (const tableSql of CREATE_TABLES) {
            await pool.execute(tableSql);
        }
        console.log('[Agnos DB] Tables initialized.');
    } catch (error) {
        console.error('[Agnos DB] Initialization FAILED:', error.message);
        console.error('[Agnos DB] Error Code:', error.code);
        // Do not rethrow, let the app start but it will fail on queries which we catch in diag
    }

    // Migration: Ensure conversations.course_id is nullable (for support messages)
    try {
        // Check if column is already nullable to avoid repeated execution
        const [columns] = await pool.execute('SHOW COLUMNS FROM conversations LIKE "course_id"');
        if (columns && columns.length > 0 && columns[0].Null === 'NO') {
            console.log('Migrating conversations.course_id to be NULLABLE...');
            await pool.execute('ALTER TABLE conversations MODIFY course_id VARCHAR(255) NULL');
        }
    } catch (err) {
        console.error('Migration failed for conversations table (MySQL):', err.message);
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
    // Ensure users.student_id exists
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN student_id VARCHAR(255) DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure users.profile_picture exists (avatar uploads / login session)
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN profile_picture VARCHAR(500) DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure users.email_verified exists
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN email_verified TINYINT DEFAULT 0');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure users.email_verification_token exists
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(255) DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure submissions.auto_grade exists
    try {
        await pool.execute('ALTER TABLE submissions ADD COLUMN auto_grade DOUBLE DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure submissions.auto_feedback exists
    try {
        await pool.execute('ALTER TABLE submissions ADD COLUMN auto_feedback TEXT DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure assignments.hide_student_names exists (blind grading for GAs)
    try {
        await pool.execute('ALTER TABLE assignments ADD COLUMN hide_student_names TINYINT DEFAULT 0');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure users.email_verification_otp exists
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN email_verification_otp VARCHAR(255) DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure OTP/token columns can store hashed values
    try {
        await pool.execute('ALTER TABLE users MODIFY COLUMN email_verification_otp VARCHAR(255) DEFAULT NULL');
    } catch (e) {
        // Ignore when current type/charset doesn't allow direct alter on managed providers.
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_BAD_FIELD_ERROR' && !String(e.message || '').includes('Duplicate column'))) {
            throw e;
        }
    }
    // Ensure users.email_verification_expires exists
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN email_verification_expires DATETIME DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure users.password_reset_token exists
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255) DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure users.password_reset_expires exists
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN password_reset_expires DATETIME DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Bulk / CSV provisional accounts must set a new password on first login
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN must_change_password TINYINT DEFAULT 0');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    try {
        await pool.execute('ALTER TABLE users ADD COLUMN last_seen_at DATETIME NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure assignments.group_submission_type exists
    try {
        await pool.execute('ALTER TABLE assignments ADD COLUMN group_submission_type VARCHAR(50) DEFAULT "one_for_all"');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure assignments.max_group_members exists
    try {
        await pool.execute('ALTER TABLE assignments ADD COLUMN max_group_members INT DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure submissions.content_hash exists
    try {
        await pool.execute('ALTER TABLE submissions ADD COLUMN content_hash VARCHAR(64) DEFAULT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure submissions.ai_analysis_state exists
    try {
        await pool.execute('ALTER TABLE submissions ADD COLUMN ai_analysis_state VARCHAR(32) DEFAULT "pending"');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure submissions.ai_analyzed_at exists
    try {
        await pool.execute('ALTER TABLE submissions ADD COLUMN ai_analyzed_at DATETIME NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure submissions.ai_reused_from_submission_id exists
    try {
        await pool.execute('ALTER TABLE submissions ADD COLUMN ai_reused_from_submission_id INT NULL');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column'))) throw e;
    }
    // Ensure indexes for hash-based detector result reuse
    try {
        await pool.execute('CREATE INDEX idx_submissions_assignment_student_time ON submissions (assignment_id, student_id, submitted_at)');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_KEYNAME' && !String(e.message || '').includes('Duplicate key name'))) throw e;
    }
    try {
        await pool.execute('CREATE INDEX idx_submissions_content_hash ON submissions (assignment_id, student_id, content_hash)');
    } catch (e) {
        if (!e || (e.code !== 'ER_DUP_KEYNAME' && !String(e.message || '').includes('Duplicate key name'))) throw e;
    }

    const { migrateMysqlCourseOfferings } = require('./courseOfferingMigrate');
    try {
        await migrateMysqlCourseOfferings(pool);
    } catch (e) {
        console.error('[Agnos DB] Course offering migration failed:', e.message);
    }

    const [rows] = await pool.execute('SELECT COUNT(*) AS count FROM users');
    const count = rows[0]?.count ?? 0;
    if (count === 0 && shouldSeedSampleData()) {
        const { hashPassword } = require('./passwords');
        const seedPasswordHash = await hashPassword(resolveSeedPassword());
        await pool.execute(
            "INSERT INTO users (id, name, email, password, role) VALUES ('student-001', 'Prabin Giri', 'prabin@example.edu', ?, 'student')",
            [seedPasswordHash]
        );
        await pool.execute(
            "INSERT INTO users (id, name, email, password, role) VALUES ('faculty-001', 'Dr. Smith', 'smith@example.edu', ?, 'faculty')",
            [seedPasswordHash]
        );
        await pool.execute(
            "INSERT INTO users (id, name, email, password, role) VALUES ('admin-001', 'Admin User', 'faculty1@gmail.com', ?, 'admin')",
            [seedPasswordHash]
        );
        try {
            await pool.execute("UPDATE users SET must_change_password = 1 WHERE id IN ('student-001','faculty-001','admin-001')");
        } catch {
            /* older schemas may not have must_change_password */
        }
        const { courseOfferingStorageId: offeringId } = require('./courseOfferingKey');
        const termSeed = 'Spring 2026';
        const id4060 = offeringId('CSCI4060', termSeed);
        const id2100 = offeringId('CSCI2100', termSeed);
        const id1100 = offeringId('CSCI1100', termSeed);
        await pool.execute(
            'INSERT INTO courses (id, course_code, name, term, instructor_id) VALUES (?, ?, ?, ?, ?)',
            [id4060, 'CSCI4060', 'Software Engineering', termSeed, 'faculty-001']
        );
        await pool.execute(
            'INSERT INTO courses (id, course_code, name, term, instructor_id) VALUES (?, ?, ?, ?, ?)',
            [id2100, 'CSCI2100', 'Data Structures', termSeed, 'faculty-001']
        );
        await pool.execute(
            'INSERT INTO courses (id, course_code, name, term, instructor_id) VALUES (?, ?, ?, ?, ?)',
            [id1100, 'CSCI1100', 'Intro to Computer Science', termSeed, 'faculty-001']
        );
        await pool.execute("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('lang-platform', ?, 'Language and Platform', '2026-02-19', 'active')", [id4060]);
        await pool.execute("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('sprint-1', ?, 'Sprint 1 Planning', '2026-03-02', 'closed')", [id4060]);
        await pool.execute("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('linked-lists', ?, 'Linked List Utilities', '2026-02-18', 'late')", [id2100]);
        await pool.execute(`INSERT INTO assignments (id, course_id, title, due_date, status, rubric_config) VALUES ('stacks-queues', ?, 'Stacks and Queues', '2026-03-01', 'active', '{"weighted":false,"criteria":[{"id":"c1","name":"Code Correctness","maxPoints":50},{"id":"c2","name":"Code Style","maxPoints":25},{"id":"c3","name":"Efficiency","maxPoints":25}]}')`, [id2100]);
        await pool.execute("INSERT INTO assignments (id, course_id, title, due_date, status) VALUES ('intro-lab', ?, 'Intro Lab', '2026-02-10', 'closed')", [id1100]);
        await pool.execute("INSERT INTO todos (id, student_id, course_id, title, due_date) VALUES ('t1', 'student-001', ?, 'Review Sprint 1', '2026-02-18')", [id4060]);
        await pool.execute('INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [id4060, 'student-001']);
        await pool.execute('INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [id2100, 'student-001']);
        await pool.execute('INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [id1100, 'student-001']);
        console.log('Database initialized with sample data (MySQL)');
    } else if (count === 0) {
        console.log('Users table is empty; sample data seeding skipped because AUTO_SEED_SAMPLE_DATA is disabled.');
    }

    return pool;
}

function getDb() {
    return {
        execute(sql, params = []) {
            return runWithReconnect('execute', sql, params);
        },
        query(sql, params = []) {
            return runWithReconnect('query', sql, params);
        },
        end() {
            return pool ? pool.end() : Promise.resolve();
        },
    };
}

async function query(sql, params = []) {
    const [rows] = await runWithReconnect('execute', sql, params);
    return Array.isArray(rows) ? rows : [];
}

async function run(sql, params = []) {
    await runWithReconnect('execute', sql, params);
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
