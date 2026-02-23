const express = require('express');
const router = express.Router();
const { query, isMySQL } = require('../db');

// Get all table names
router.get('/tables', async (req, res) => {
    try {
        if (isMySQL) {
            const rows = await query('SHOW TABLES');
            const tables = rows.map(r => Object.values(r)[0]).filter(Boolean);
            res.json(tables);
        } else {
            const rows = await query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            res.json(rows.map(t => t.name));
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get table schema and data
router.get('/tables/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    if (safeName !== tableName) return res.status(400).json({ error: 'Invalid table name' });
    try {
        if (isMySQL) {
            const columns = await query('SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [safeName]);
            const rows = await query(`SELECT * FROM \`${safeName}\` LIMIT 100`);
            res.json({ tableName: safeName, columns, rows });
        } else {
            const columns = await query(`PRAGMA table_info(${safeName})`);
            const rows = await query(`SELECT * FROM ${safeName} LIMIT 100`);
            res.json({ tableName: safeName, columns, rows });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
