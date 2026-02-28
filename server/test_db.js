const mysql = require('mysql2/promise');
require('dotenv').config();

async function test() {
    console.log('Testing connection to:', process.env.DB_HOST, 'as', process.env.DB_USER);
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT || 3306,
            connectTimeout: 10000
        });
        console.log('✅ SUCCESS! Connected to Cloud SQL.');
        await conn.end();
    } catch (err) {
        console.error('❌ FAILED:', err.code, '-', err.message);
    }
    process.exit(0);
}
test();
