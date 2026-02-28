const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function migrate() {
    console.log('Starting migration from SQLite to MySQL...');

    // 1. Initialize SQLite
    const SQL = await initSqlJs();
    const dbPath = path.join(__dirname, 'autograde.db');
    if (!fs.existsSync(dbPath)) {
        console.error('SQLite database file not found at:', dbPath);
        return;
    }
    const fileBuffer = fs.readFileSync(dbPath);
    const sqliteDb = new SQL.Database(fileBuffer);

    // 2. Initialize MySQL
    const mysqlConfig = {
        host: '127.0.0.1', // Connect to local Docker
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER || 'admin',
        password: process.env.MYSQL_PASSWORD || 'LonSuddo-69',
        database: process.env.MYSQL_DATABASE || 'autograde-db',
    };

    let mysqlConn;
    try {
        mysqlConn = await mysql.createConnection(mysqlConfig);
        console.log('Connected to MySQL');
    } catch (err) {
        console.error('Failed to connect to MySQL:', err.message);
        return;
    }

    const tables = ['users', 'courses', 'assignments', 'submissions', 'todos', 'course_settings', 'course_documents', 'test_cases'];

    for (const table of tables) {
        console.log(`Migrating table: ${table}...`);

        try {
            const res = sqliteDb.exec(`SELECT * FROM ${table}`);
            if (res.length === 0) {
                console.log(`Table ${table} is empty in SQLite.`);
                continue;
            }

            const columns = res[0].columns;
            const values = res[0].values;

            // Prepare the INSERT IGNORE statement
            const colCsv = columns.map(c => `\`${c}\``).join(', ');
            const placeholders = columns.map(() => '?').join(', ');
            const sql = `INSERT IGNORE INTO \`${table}\` (${colCsv}) VALUES (${placeholders})`;

            let count = 0;
            for (const row of values) {
                // MySQL doesn't like TEXT dates as objects; but SQLite strings should be fine.
                // One edge case: MySQL TINYINT(1) for BOOLEAN works with 0/1.
                await mysqlConn.execute(sql, row);
                count++;
            }
            console.log(`Successfully migrated ${count} rows for ${table}.`);
        } catch (err) {
            console.error(`Error migrating table ${table}:`, err.message);
        }
    }

    await mysqlConn.end();
    console.log('Migration finished.');
}

migrate().catch(console.error);
