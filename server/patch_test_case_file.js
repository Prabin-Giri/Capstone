const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function patch() {
    const config = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'admin',
        password: process.env.DB_PASSWORD || 'LonSuddo-69',
        database: process.env.DB_NAME || 'autograde-db',
    };

    console.log('Connecting to MySQL for testCaseFile patch...');
    const conn = await mysql.createConnection(config);

    try {
        console.log('Patching assignments table...');
        const [cols] = await conn.execute('SHOW COLUMNS FROM assignments');
        const hasTestCaseFile = cols.some(col => col.Field === 'test_case_file_path');

        if (!hasTestCaseFile) {
            console.log('Adding test_case_file_path to assignments...');
            await conn.execute('ALTER TABLE assignments ADD COLUMN test_case_file_path VARCHAR(255) AFTER starter_code_path');
            console.log('Column added successfully.');
        } else {
            console.log('test_case_file_path already exists.');
        }

        console.log('Schema patch completed successfully.');
    } catch (err) {
        console.error('Patch failed:', err.message);
    } finally {
        await conn.end();
    }
}

patch();
