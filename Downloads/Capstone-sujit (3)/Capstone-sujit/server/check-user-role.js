/**
 * One-off script to check a user's role by email.
 * Run from project root: node server/check-user-role.js
 * Or with an email: node server/check-user-role.js "a3@gmail.com"
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const emailArg = process.argv[2] || 'a3@gmail';
const searchEmail = emailArg.includes('@') ? emailArg : `${emailArg}@gmail.com`;

async function main() {
    const config = {
        host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
        user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
        password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'intelligrade',
        port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
    };

    let conn;
    try {
        conn = await mysql.createConnection(config);
        const [rows] = await conn.execute(
            'SELECT id, name, email, role FROM users WHERE LOWER(email) LIKE ? OR email LIKE ?',
            [`%${searchEmail.replace('@', '%')}%`, `%${emailArg}%`]
        );
        if (rows.length === 0) {
            console.log('No user found for email pattern:', searchEmail, '/', emailArg);
            return;
        }
        console.log('User(s) found:');
        rows.forEach((u, i) => {
            console.log(`  ${i + 1}. id="${u.id}" name="${u.name}" email="${u.email}" role=${u.role === null ? 'NULL' : `"${u.role}"`}`);
        });
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (conn) await conn.end();
    }
}

main();
