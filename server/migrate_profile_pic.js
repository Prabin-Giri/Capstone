const { getDb } = require('./db');
const { initDb } = require('./db');

async function migrate() {
    await initDb();
    const db = getDb();
    try {
        console.log('Adding profile_picture column to users table...');
        await db.execute('ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255) DEFAULT NULL AFTER role');
        console.log('Successfully updated users table.');
    } catch (err) {
        if (err.code === 'ER_DUP_COLUMN_NAME') {
            console.log('Column profile_picture already exists.');
        } else {
            console.error('Migration failed:', err);
        }
    }
    process.exit(0);
}

migrate();
