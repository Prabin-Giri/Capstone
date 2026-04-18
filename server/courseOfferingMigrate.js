const { courseOfferingStorageId } = require('./courseOfferingKey');

const FK_TABLES = [
    ['assignments', 'course_id'],
    ['todos', 'course_id'],
    ['course_settings', 'course_id'],
    ['course_documents', 'course_id'],
    ['course_enrollments', 'course_id'],
    ['course_tas', 'course_id'],
    ['conversations', 'course_id'],
];

/**
 * One-time style migration: legacy courses.id was the catalog code only.
 * Rewrites to catalog::term-slug and fills course_code.
 */
async function migrateMysqlCourseOfferings(pool) {
    try {
        await pool.execute('ALTER TABLE courses MODIFY COLUMN id VARCHAR(500) NOT NULL');
    } catch (_) {
        /* ignore if not supported or already widened */
    }
    // Older beta used "::" — bad for Windows paths; normalize to "~"
    for (const [table, col] of FK_TABLES) {
        await pool.execute(
            `UPDATE \`${table}\` SET \`${col}\` = REPLACE(\`${col}\`, '::', '~') WHERE \`${col}\` LIKE '%::%'`
        );
    }
    await pool.execute("UPDATE courses SET id = REPLACE(id, '::', '~') WHERE id LIKE '%::%'");

    try {
        await pool.execute('ALTER TABLE courses ADD COLUMN course_code VARCHAR(255) NULL');
    } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME' && !String(e.message || '').includes('Duplicate column')) {
            throw e;
        }
    }

    await pool.execute(
        "UPDATE courses SET course_code = SUBSTRING_INDEX(id, '~', 1) WHERE (course_code IS NULL OR course_code = '') AND id LIKE '%~%'"
    );
    await pool.execute(
        "UPDATE courses SET course_code = id WHERE (course_code IS NULL OR course_code = '') AND id NOT LIKE '%~%'"
    );

    const [legacy] = await pool.execute(
        "SELECT id, term, course_code FROM courses WHERE id NOT LIKE '%~%'"
    );
    if (!legacy.length) {
        return;
    }

    await pool.execute('SET FOREIGN_KEY_CHECKS=0');
    try {
        for (const row of legacy) {
            const oldId = row.id;
            const code = row.course_code || row.id;
            const newId = courseOfferingStorageId(code, row.term);
            if (oldId === newId) {
                await pool.execute('UPDATE courses SET course_code = ? WHERE id = ?', [code, oldId]);
                continue;
            }
            const [exists] = await pool.execute('SELECT id FROM courses WHERE id = ?', [newId]);
            if (exists.length > 0) {
                console.warn(`[course migrate] Skip "${oldId}" → "${newId}" (target id already exists)`);
                continue;
            }
            for (const [table, col] of FK_TABLES) {
                await pool.execute(`UPDATE \`${table}\` SET \`${col}\` = ? WHERE \`${col}\` = ?`, [newId, oldId]);
            }
            await pool.execute('UPDATE courses SET id = ?, course_code = ? WHERE id = ?', [newId, code, oldId]);
        }
    } finally {
        await pool.execute('SET FOREIGN_KEY_CHECKS=1');
    }
    console.log('[Agnos DB] Course offering id migration finished.');
}

/** sql.js: same migration using db.run */
function migrateSqliteCourseOfferings(db) {
    try {
        db.run('ALTER TABLE courses ADD COLUMN course_code TEXT');
    } catch (_) {
        /* duplicate column */
    }

    for (const [table, col] of FK_TABLES) {
        db.run(`UPDATE "${table}" SET "${col}" = replace("${col}", '::', '~') WHERE "${col}" LIKE '%::%'`);
    }
    db.run(`UPDATE courses SET id = replace(id, '::', '~') WHERE id LIKE '%::%'`);

    db.run(
        `UPDATE courses SET course_code = CASE
            WHEN instr(id, '~') > 0 THEN substr(id, 1, instr(id, '~') - 1)
            WHEN instr(id, '::') > 0 THEN substr(id, 1, instr(id, '::') - 1)
            ELSE id
        END WHERE course_code IS NULL OR course_code = ''`
    );

    const stmt = db.prepare("SELECT id, term, course_code FROM courses WHERE id NOT LIKE '%~%' AND id NOT LIKE '%::%'");
    const legacy = [];
    while (stmt.step()) {
        legacy.push(stmt.getAsObject());
    }
    stmt.free();
    if (!legacy.length) {
        return;
    }

    db.run('PRAGMA foreign_keys = OFF');
    try {
        for (const row of legacy) {
            const oldId = row.id;
            const code = row.course_code || row.id;
            let newId;
            try {
                newId = courseOfferingStorageId(code, row.term);
            } catch (_) {
                continue;
            }
            if (oldId === newId) {
                db.run('UPDATE courses SET course_code = ? WHERE id = ?', [code, oldId]);
                continue;
            }
            const chk = db.prepare('SELECT 1 FROM courses WHERE id = ?');
            chk.bind([newId]);
            const taken = chk.step();
            chk.free();
            if (taken) {
                console.warn(`[course migrate sqlite] Skip "${oldId}" → "${newId}"`);
                continue;
            }
            for (const [table, col] of FK_TABLES) {
                db.run(`UPDATE "${table}" SET "${col}" = ? WHERE "${col}" = ?`, [newId, oldId]);
            }
            db.run('UPDATE courses SET id = ?, course_code = ? WHERE id = ?', [newId, code, oldId]);
        }
    } finally {
        db.run('PRAGMA foreign_keys = ON');
    }
    console.log('[SQLite] Course offering id migration finished.');
}

module.exports = { migrateMysqlCourseOfferings, migrateSqliteCourseOfferings, FK_TABLES };
