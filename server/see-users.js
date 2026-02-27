/**
 * Run from terminal: node see-users.js
 * Uses .env for DB connection and lists users.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });
  const [rows] = await c.execute(
    'SELECT id, name, email, role FROM users ORDER BY name'
  );
  console.table(rows);
  await c.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
