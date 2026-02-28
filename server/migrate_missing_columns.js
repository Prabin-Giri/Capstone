const { initDb, saveDb, getDb } = require('./db');

async function migrate() {
    try {
        await initDb();
        const db = getDb();

        console.log('Starting migration for missing columns...');

        // --- Courses Table ---
        const coursesInfo = db.exec("PRAGMA table_info(courses)");
        const coursesCols = coursesInfo[0].values.map(v => v[1]);

        if (!coursesCols.includes('is_archived')) {
            console.log('Adding is_archived to courses...');
            db.run("ALTER TABLE courses ADD COLUMN is_archived INTEGER DEFAULT 0");
        }

        if (!coursesCols.includes('updated_at')) {
            console.log('Adding updated_at to courses...');
            db.run("ALTER TABLE courses ADD COLUMN updated_at TEXT");
        }

        // --- Assignments Table ---
        const assignmentsInfo = db.exec("PRAGMA table_info(assignments)");
        const assignmentsCols = assignmentsInfo[0].values.map(v => v[1]);

        if (!assignmentsCols.includes('language')) {
            console.log('Adding language to assignments...');
            db.run("ALTER TABLE assignments ADD COLUMN language TEXT");
        }

        if (!assignmentsCols.includes('starter_code_path')) {
            console.log('Adding starter_code_path to assignments...');
            db.run("ALTER TABLE assignments ADD COLUMN starter_code_path TEXT");
        }

        if (!assignmentsCols.includes('type')) {
            console.log('Adding type to assignments...');
            db.run("ALTER TABLE assignments ADD COLUMN type TEXT DEFAULT 'individual'");
        }

        if (!assignmentsCols.includes('updated_at')) {
            console.log('Adding updated_at to assignments...');
            db.run("ALTER TABLE assignments ADD COLUMN updated_at TEXT");
        }

        saveDb();
        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
