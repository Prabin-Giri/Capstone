const express = require('express');
const router = express.Router();
const { getDb, queryToObjects } = require('../db');

// Get all table names
router.get('/tables', (req, res) => {
    try {
        const db = getDb();
        const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        const tables = queryToObjects(result).map(t => t.name);
        res.json(tables);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get table schema and data
router.get('/tables/:tableName', (req, res) => {
    const { tableName } = req.params;
    try {
        const db = getDb();

        // Get columns
        const schemaResult = db.exec(`PRAGMA table_info(${tableName})`);
        const columns = queryToObjects(schemaResult);

        // Get data
        const dataResult = db.exec(`SELECT * FROM ${tableName} LIMIT 100`);
        const rows = queryToObjects(dataResult);

        res.json({ tableName, columns, rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
