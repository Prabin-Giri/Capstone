const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function patch() {
    const config = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'admin',
        password: process.env.DB_PASSWORD || 'LonSuddo-69',
        database: process.env.DB_NAME || 'autograde-db',
    };

    console.log('Connecting to MySQL for schema patch...');
    const conn = await mysql.createConnection(config);

    try {
        console.log('Patching users table...');
        const [userCols] = await conn.execute('SHOW COLUMNS FROM users');
        const hasPassword = userCols.some(col => col.Field === 'password');

        if (!hasPassword) {
            console.log('Adding password column to users...');
            await conn.execute('ALTER TABLE users ADD COLUMN password VARCHAR(255) AFTER email');
            console.log('Setting default password for existing users...');
            await conn.execute('UPDATE users SET password = ? WHERE password IS NULL', ['password123']);
        }

        console.log('Patching courses table...');
        const [courseCols] = await conn.execute('SHOW COLUMNS FROM courses');
        const hasInstructor = courseCols.some(col => col.Field === 'instructor_id');

        if (!hasInstructor) {
            console.log('Adding instructor_id to courses...');
            await conn.execute('ALTER TABLE courses ADD COLUMN instructor_id VARCHAR(255) AFTER term');
            await conn.execute('ALTER TABLE courses ADD CONSTRAINT fk_instructor FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE SET NULL');

            // Set a default instructor for existing courses if possible
            console.log('Assigning faculty-001 as default instructor for existing courses...');
            await conn.execute('UPDATE courses SET instructor_id = ? WHERE instructor_id IS NULL', ['faculty-001']);
        }

        console.log('Seeding course enrollments...');
        const [enrollmentRows] = await conn.execute('SELECT COUNT(*) as count FROM course_enrollments');
        if (enrollmentRows[0].count === 0) {
            console.log('Enrolling student-001 in sample courses...');
            const enrollments = [
                ['CSCI4060', 'student-001'],
                ['CSCI2100', 'student-001'],
                ['CSCI1100', 'student-001']
            ];
            for (const [courseId, studentId] of enrollments) {
                await conn.execute('INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [courseId, studentId]);
            }
        }

        console.log('Schema patch completed successfully.');
    } catch (err) {
        console.error('Patch failed:', err.message);
    } finally {
        await conn.end();
    }
}

patch();
