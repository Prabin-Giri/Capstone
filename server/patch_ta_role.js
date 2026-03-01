const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function patchTARole() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'intelligrade',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            waitForConnections: true,
            connectionLimit: 1
        });

        console.log('Connecting to database to patch users table ENUM...');
        // Alter the ENUM to formally include 'ta'
        await pool.query(`ALTER TABLE users MODIFY COLUMN role ENUM('student', 'faculty', 'admin', 'ta') NOT NULL`);
        console.log('Successfully added "ta" to users role ENUM!');

        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('Failed to patch database:', err);
        process.exit(1);
    }
}

patchTARole();
