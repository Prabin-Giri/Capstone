const { initDb, saveDb } = require('./db');

(async () => {
    try {
        const db = await initDb();

        console.log("Creating new_submissions table without the UNIQUE constraint...");
        db.run(`CREATE TABLE new_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'graded', 'returned')),
            grade REAL DEFAULT NULL,
            feedback TEXT DEFAULT NULL,
            submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        console.log("Copying data to new table...");
        db.run(`INSERT INTO new_submissions (id, assignment_id, student_id, file_name, file_path, status, grade, feedback, submitted_at, updated_at)
                SELECT id, assignment_id, student_id, file_name, file_path, status, grade, feedback, submitted_at, updated_at FROM submissions`);

        console.log("Dropping old submissions table...");
        db.run(`DROP TABLE submissions`);

        console.log("Renaming new_submissions to submissions...");
        db.run(`ALTER TABLE new_submissions RENAME TO submissions`);

        saveDb();
        console.log("Migration complete! You can now have multiple submission rows per student.");
    } catch (e) {
        console.error("Migration failed:", e);
    }
})();
