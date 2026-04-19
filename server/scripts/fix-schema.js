const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixSchema() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    user: process.env.MYSQL_USER || 'admin',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'autograde-db',
  });

  try {
    console.log('Checking assignments table schema...');
    const [columns] = await connection.query('SHOW COLUMNS FROM assignments');
    const columnNames = columns.map(c => c.Field);
    
    if (!columnNames.includes('points')) {
      console.log('Adding column "points" to assignments table...');
      await connection.query('ALTER TABLE assignments ADD COLUMN points INT DEFAULT 100 AFTER status');
    } else {
      console.log('Column "points" already exists.');
    }

    if (!columnNames.includes('language')) {
      console.log('Adding column "language" to assignments table...');
      await connection.query('ALTER TABLE assignments ADD COLUMN language VARCHAR(50) DEFAULT "python" AFTER points');
    }

    console.log('Schema update complete.');
  } catch (err) {
    console.error('Error updating schema:', err.message);
  } finally {
    await connection.end();
  }
}

fixSchema();
