const { initDb, getDb, saveDb } = require('./db');

async function migrate() {
    console.log('Starting migration to add points column to assignments table...');

    // Initialize DB connection
    await initDb();
    const db = getDb();

    try {
        // Check if column already exists
        const tableInfo = db.exec('PRAGMA table_info(assignments)');
        const columns = tableInfo[0].values.map(col => col[1]);

        if (columns.includes('points')) {
            console.log('points column already exists. Skipping.');
            return;
        }

        // Add points column with default value 100
        db.run('ALTER TABLE assignments ADD COLUMN points INTEGER DEFAULT 100');
        console.log('Added points column to assignments table');

        saveDb();
        console.log('Migration successful.');

    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();
