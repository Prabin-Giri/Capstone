const { initDb, getDb } = require('./server/db');

async function seed() {
    try {
        await initDb();
        const db = getDb();

        const students = [
            ['student-002', 'Alice Thompson', 'alice@example.edu', 'student'],
            ['student-003', 'Bob Wilson', 'bob@example.edu', 'student'],
            ['student-004', 'Charlie Brown', 'charlie@example.edu', 'student'],
            ['student-005', 'Diana Prince', 'diana@example.edu', 'student'],
            ['student-006', 'Ethan Hunt', 'ethan@example.edu', 'student'],
            ['student-007', 'Fiona Gallagher', 'fiona@example.edu', 'student'],
            ['student-008', 'Gaurav Rijal', 'gaurav@example.edu', 'student']
        ];

        console.log("Seeding more students...");
        for (const [id, name, email, role] of students) {
            try {
                // Check if already exists
                const [existing] = await db.query("SELECT id FROM users WHERE id = ? OR email = ?", [id, email]);
                if (existing.length === 0) {
                    await db.query("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
                        [id, name, email, 'password123', role]);
                    console.log(`Added: ${name}`);
                } else {
                    console.log(`Skipped (Exists): ${name}`);
                }
            } catch (err) {
                console.error(`Error adding ${name}:`, err.message);
            }
        }
        console.log("Seeding complete.");
    } catch (err) {
        console.error("Error seeding DB:", err);
    } finally {
        process.exit();
    }
}

seed();
