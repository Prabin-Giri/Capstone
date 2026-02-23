const { initDb, getDb, saveDb } = require('./db');

async function migrate() {
    console.log('Starting migration to remove UNIQUE constraint from submissions table...');

    // Initialize DB connection
    await initDb();
    const db = getDb();

    try {
        // 1. Rename existing table
        db.run('ALTER TABLE submissions RENAME TO submissions_old');
        console.log('Renamed submissions to submissions_old');

        // 2. Create new table WITHOUT unique constraint
        db.run(`
            CREATE TABLE IF NOT EXISTS submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                assignment_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'graded', 'returned')),
                grade REAL DEFAULT NULL,
                feedback TEXT DEFAULT NULL,
                FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
            )
        `);
        console.log('Created new submissions table');

        // 3. Copy data
        db.run(`
            INSERT INTO submissions (id, assignment_id, student_id, file_name, file_path, submitted_at, updated_at, status, grade, feedback)
            SELECT id, assignment_id, student_id, file_name, file_path, submitted_at, updated_at, status, grade, feedback
            FROM submissions_old
        `);
        console.log('Copied data to new table');

        // 4. Verify count
        const oldStart = db.exec('SELECT COUNT(*) FROM submissions_old')[0].values[0][0];
        const newCount = db.exec('SELECT COUNT(*) FROM submissions')[0].values[0][0];

        if (oldStart === newCount) {
            // 5. Drop old table
            db.run('DROP TABLE submissions_old');
            console.log('Dropped old table. Migration successful.');
            saveDb();
        } else {
            console.error(`Mismatch in row counts! Old: ${oldStart}, New: ${newCount}. Aborting drop.`);
        }

    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();
