const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function seedTA() {
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

        console.log('Connecting to database to seed assistant@example.edu...');

        // Use UPSERT to safely insert or ignore if the account already exists
        await pool.query(
            "INSERT IGNORE INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
            ['ta-001', 'Teaching Assistant', 'assistant@example.edu', 'password123', 'ta']
        );

        console.log('Successfully seeded TA account!');

        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('Failed to seed TA account:', err);
        process.exit(1);
    }
}

seedTA();
