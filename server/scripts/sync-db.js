const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const AWS_CONFIG = {
    host: process.env.SYNC_SOURCE_HOST || process.env.MYSQL_HOST,
    port: parseInt(process.env.SYNC_SOURCE_PORT || process.env.MYSQL_PORT || '3306', 10),
    user: process.env.SYNC_SOURCE_USER || process.env.MYSQL_USER,
    password: process.env.SYNC_SOURCE_PASSWORD || process.env.MYSQL_PASSWORD,
    database: process.env.SYNC_SOURCE_DATABASE || process.env.MYSQL_DATABASE,
    ssl: process.env.SYNC_SOURCE_SSL === 'false'
        ? undefined
        : { rejectUnauthorized: process.env.SYNC_SOURCE_SSL_VERIFY !== 'false' }
};

const LOCAL_CONFIG = {
    host: process.env.SYNC_DEST_HOST || '127.0.0.1',
    port: parseInt(process.env.SYNC_DEST_PORT || '3306', 10),
    user: process.env.SYNC_DEST_USER || process.env.MYSQL_USER,
    password: process.env.SYNC_DEST_PASSWORD || process.env.MYSQL_PASSWORD,
    database: process.env.SYNC_DEST_DATABASE || process.env.MYSQL_DATABASE
};

async function sync() {
    let sourceConn, destConn;

    try {
        if (!AWS_CONFIG.host || !AWS_CONFIG.user || !AWS_CONFIG.database) {
            throw new Error('Missing source DB config. Set SYNC_SOURCE_* or MYSQL_* env vars.');
        }
        if (!LOCAL_CONFIG.user || !LOCAL_CONFIG.database) {
            throw new Error('Missing destination DB config. Set SYNC_DEST_* or MYSQL_* env vars.');
        }
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
