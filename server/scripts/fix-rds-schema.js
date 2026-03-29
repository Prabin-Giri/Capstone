const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixRdsSchema() {
  const host = process.env.RDS_HOST || process.argv[2];
  if (!host) {
    console.error('Usage: node fix-rds-schema.js <rds-host>');
    console.error('Example: node fix-rds-schema.js autograde-db.c7y2ewkoshjo.us-east-2.rds.amazonaws.com');
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: host,
    user: process.env.MYSQL_USER || 'admin',
    password: process.env.MYSQL_PASSWORD || 'LonSuddo-69',
    database: process.env.MYSQL_DATABASE || 'autograde-db',
    ssl: { rejectUnauthorized: false } // Required for AWS RDS in most cases
  });

  try {
    console.log(`Connecting to RDS: ${host}...`);
    const [columns] = await connection.query('SHOW COLUMNS FROM assignments');
    const columnNames = columns.map(c => c.Field);
    
    console.log('Current assignment columns:', columnNames.join(', '));

    const missingColumns = [
      { name: 'points', definition: 'INT DEFAULT 100 AFTER status' },
      { name: 'language', definition: 'VARCHAR(50) DEFAULT "python" AFTER points' },
      { name: 'late_penalty_enabled', definition: 'INT DEFAULT 0 AFTER updated_at' },
      { name: 'late_penalty_type', definition: 'VARCHAR(50) DEFAULT "per_day" AFTER late_penalty_enabled' },
      { name: 'late_penalty_value', definition: 'DOUBLE DEFAULT 10 AFTER late_penalty_type' },
      { name: 'late_penalty_cap', definition: 'DOUBLE DEFAULT 50 AFTER late_penalty_value' }
    ];

    for (const col of missingColumns) {
      if (!columnNames.includes(col.name)) {
        console.log(`Adding column "${col.name}" to RDS assignments table...`);
        await connection.query(`ALTER TABLE assignments ADD COLUMN ${col.name} ${col.definition}`);
      }
    }

    console.log('RDS Schema update complete.');
  } catch (err) {
    console.error('Error updating RDS schema:', err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('HINT: Access denied. Make sure the RDS Security Group allows connections from your IP.');
    }
  } finally {
    await connection.end();
  }
}

fixRdsSchema();
