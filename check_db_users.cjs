const { initDb, getDb } = require('./server/db');

async function check() {
    try {
        await initDb();
        const db = getDb();
        const [rows] = await db.query("SELECT id, name, email, role FROM users");
        console.log("Current Users in DB:");
        console.table(rows);
    } catch (err) {
        console.error("Error checking DB:", err);
    } finally {
        process.exit();
    }
}

check();
