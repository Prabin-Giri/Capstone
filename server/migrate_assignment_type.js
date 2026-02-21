const { initDb, saveDb } = require('./db');

(async () => {
    try {
        const db = await initDb();
        console.log('Database loaded.');

        // Check if 'type' column exists using pragma
        const tableInfo = db.exec("PRAGMA table_info(assignments)");
        const columns = tableInfo[0].values.map(col => col[1]); // col[1] is name

        if (!columns.includes('type')) {
            console.log("Adding 'type' column to assignments table...");
            db.run("ALTER TABLE assignments ADD COLUMN type TEXT DEFAULT 'individual' CHECK(type IN ('individual', 'group'))");
            saveDb();
            console.log("Migration successful.");
        } else {
            console.log("'type' column already exists.");
        }

    } catch (err) {
        console.error('Migration failed:', err);
    }
})();
