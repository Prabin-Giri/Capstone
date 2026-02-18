const { initDb, saveDb, getDb } = require('./db');

async function migrate() {
    try {
        await initDb();
        const db = getDb();
        console.log('Adding is_archived column to courses table...');

        // Check if column already exists
        const tableInfo = db.exec("PRAGMA table_info(courses)");
        const columns = tableInfo[0].values.map(v => v[1]);

        if (columns.includes('is_archived')) {
            console.log('Column is_archived already exists.');
        } else {
            db.run("ALTER TABLE courses ADD COLUMN is_archived INTEGER DEFAULT 0");
            saveDb();
            console.log('Column is_archived added successfully.');
        }
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
