/**
 * Test MySQL connection to Google Cloud SQL (or local).
 * Run: node check-db-connection.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function check() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME || 'intelligrade';
  const port = parseInt(process.env.DB_PORT || '3306', 10);

  if (!host) {
    console.error('❌ DB_HOST is required in .env (use your Google Cloud SQL public IP).');
    process.exit(1);
  }

  console.log('Checking database connection...');
  console.log('  Host:', host);
  console.log('  Port:', port);
  console.log('  User:', user);
  console.log('  Database:', database);
  console.log('');

  try {
    const conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      connectTimeout: 15000,
    });

    // Test query
    const [rows] = await conn.execute('SELECT 1 AS ok');
    console.log('✅ Connection successful. Server responded:', rows[0].ok === 1 ? 'OK' : rows[0]);

    // Optional: show database and table list
    const [dbs] = await conn.execute('SELECT DATABASE() AS db');
    console.log('  Current database:', dbs[0].db);

    const [tables] = await conn.execute("SHOW TABLES");
    console.log('  Tables in database:', tables.length);
    if (tables.length > 0) {
      const key = Object.keys(tables[0])[0];
      tables.forEach((t) => console.log('    -', t[key]));
    }

    await conn.end();
    console.log('\n✅ Database is connected (Google Cloud SQL or MySQL).');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Connection failed:', err.message);
    if (err.code) console.error('   Error code:', err.code);
    if (err.code === 'ETIMEDOUT') {
      console.error(
        '\nTip: If this is a Google Cloud SQL public IP, you must allow your client IP in Cloud SQL “Authorized networks” ' +
        'or connect via the Cloud SQL Auth Proxy (then set DB_HOST=127.0.0.1).'
      );
    }
    process.exit(1);
  }
}

check();
