const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const AWS_CONFIG = {
    host: 'autograde-db.c7y2ewkoshjo.us-east-2.rds.amazonaws.com',
    port: 3306,
    user: 'admin',
    password: 'LonSuddo-69',
    database: 'autograde-db',
    ssl: { rejectUnauthorized: false }
};

const LOCAL_CONFIG = {
    host: '127.0.0.1',
    port: 3306,
    user: 'admin',
    password: 'LonSuddo-69',
    database: 'autograde-db'
};

async function sync() {
    let sourceConn, destConn;

    try {
        console.log('Connecting to AWS RDS...');
        sourceConn = await mysql.createConnection(AWS_CONFIG);
        console.log('Connected to AWS RDS.');

        console.log('Connecting to Local MySQL...');
        destConn = await mysql.createConnection(LOCAL_CONFIG);
        console.log('Connected to Local MySQL.');

        // 1. Get all tables
        const [tables] = await sourceConn.query('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);
        console.log(`Found ${tableNames.length} tables: ${tableNames.join(', ')}`);

        // Disable foreign key checks for clean restore
        await destConn.query('SET FOREIGN_KEY_CHECKS = 0');

        for (const tableName of tableNames) {
            console.log(`\nSyncing table: ${tableName}...`);

            // 2. Get Create Table statement
            const [[{ 'Create Table': createSql }]] = await sourceConn.query(`SHOW CREATE TABLE \`${tableName}\``);
            
            // 3. Recreate table locally
            await destConn.query(`DROP TABLE IF EXISTS \`${tableName}\``);
            await destConn.query(createSql);
            console.log(`- Schema created.`);

            // 4. Fetch data
            const [rows] = await sourceConn.query(`SELECT * FROM \`${tableName}\``);
            if (rows.length > 0) {
                const keys = Object.keys(rows[0]);
                const placeholders = keys.map(() => '?').join(', ');
                const columns = keys.map(k => `\`${k}\``).join(', ');
                const insertSql = `INSERT INTO \`${tableName}\` (${columns}) VALUES (${placeholders})`;

                for (const row of rows) {
                    const values = keys.map(k => {
                        const val = row[k];
                        return (val !== null && typeof val === 'object' && !(val instanceof Date)) ? JSON.stringify(val) : val;
                    });
                    await destConn.query(insertSql, values);
                }
                console.log(`- ${rows.length} rows inserted.`);
            } else {
                console.log(`- Table is empty.`);
            }
        }

        // Re-enable foreign key checks
        await destConn.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('\nSync completed successfully!');

    } catch (err) {
        if (err.code === 'ECONNREFUSED' && err.address === '127.0.0.1') {
            console.error('FAILED: Local MySQL is not running. Please run "docker-compose up -d" first.');
        } else {
            console.error('Error during sync:', err);
        }
    } finally {
        if (sourceConn) await sourceConn.end();
        if (destConn) await destConn.end();
    }
}

sync();
