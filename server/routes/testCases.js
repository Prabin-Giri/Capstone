const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, run, saveDb } = require('../db');

const uploadsDir = path.join(__dirname, '../uploads');
const upload = multer({ storage: multer.memoryStorage() });

/** Parse CSV with header "input,expected_output,points" or "input,expected_output"; rows can be quoted. */
function parseTestCasesCsv(buffer) {
    const text = buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').filter((l) => l.trim());
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const parts = [];
        let pos = 0;
        while (pos < line.length) {
            if (line[pos] === '"') {
                let end = pos + 1;
                while (end < line.length && (line[end] !== '"' || line[end + 1] === '"')) {
                    if (line[end] === '"' && line[end + 1] === '"') end += 2;
                    else end += 1;
                }
                parts.push(line.slice(pos + 1, end).replace(/""/g, '"'));
                pos = line[end] === '"' ? end + 1 : end + 2;
            } else {
                const comma = line.indexOf(',', pos);
                const slice = comma === -1 ? line.slice(pos) : line.slice(pos, comma);
                parts.push(slice.trim());
                pos = comma === -1 ? line.length : comma + 1;
            }
        }
        const input = parts[0] != null ? String(parts[0]).trim() : '';
        const expected = parts[1] != null ? String(parts[1]).trim() : '';
        const points = parts[2] != null ? (parseInt(parts[2], 10) || 0) : 0;
        if (input === 'input' && expected === 'expected_output' && parts[2] === 'points') continue; // skip header
        rows.push({ input, expected_output: expected, points, is_public: 1 });
    }
    return rows;
}

// POST /api/test-cases/import?assignmentId=xxx
router.post('/import', upload.single('file'), async (req, res, next) => {
    try {
        const assignmentId = req.query.assignmentId || (req.body && req.body.assignmentId);
        if (!assignmentId) return res.status(400).json({ error: 'assignmentId required (query or body)' });
        if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'CSV file required' });
        const rows = parseTestCasesCsv(req.file.buffer);
        if (rows.length === 0) return res.status(400).json({ error: 'No valid test case rows (use CSV with input, expected_output, points)' });
        for (const r of rows) {
            await run('INSERT INTO test_cases (assignment_id, input, expected_output, points, is_public) VALUES (?, ?, ?, ?, ?)', [assignmentId, r.input, r.expected_output, r.points, r.is_public]);
        }
        await saveDb();
        res.status(201).json({ message: `Imported ${rows.length} test case(s)`, count: rows.length });
    } catch (err) {
        next(err);
    }
});

// GET /api/test-cases/:assignmentId
router.get('/:assignmentId', async (req, res, next) => {
    try {
        const rows = await query('SELECT * FROM test_cases WHERE assignment_id = ? ORDER BY id', [req.params.assignmentId]);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// POST /api/test-cases
router.post('/', async (req, res, next) => {
    try {
        const { assignment_id, input, expected_output, points = 0, is_public = 1, input_type, input_filename, output_filename, run_args, output_filename_2, expected_output_2, compare_mode, stdin } = req.body;
        if (!assignment_id || expected_output === undefined) return res.status(400).json({ error: 'Missing required fields' });
        await run(
            'INSERT INTO test_cases (assignment_id, input, expected_output, points, is_public, input_type, input_filename, output_filename, run_args, output_filename_2, expected_output_2, compare_mode, stdin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [assignment_id, input, expected_output, points, is_public, input_type != null ? input_type : 'stdin', input_filename ?? null, output_filename ?? null, run_args ?? null, output_filename_2 ?? null, expected_output_2 ?? null, compare_mode != null ? compare_mode : 'exact', stdin ?? null]
        );
        await saveDb();
        res.status(201).json({ message: 'Test case created successfully' });
    } catch (err) {
        next(err);
    }
});

// PUT /api/test-cases/:id
router.put('/:id', async (req, res, next) => {
    try {
        const { input, expected_output, points, is_public, input_type, input_filename, output_filename, run_args, output_filename_2, expected_output_2, compare_mode, stdin } = req.body;
        const id = req.params.id;
        const updates = [];
        const values = [];
        if (input !== undefined) { updates.push('input = ?'); values.push(input); }
        if (expected_output !== undefined) { updates.push('expected_output = ?'); values.push(expected_output); }
        if (points !== undefined) { updates.push('points = ?'); values.push(points); }
        if (is_public !== undefined) { updates.push('is_public = ?'); values.push(is_public); }
        if (input_type !== undefined) { updates.push('input_type = ?'); values.push(input_type); }
        if (input_filename !== undefined) { updates.push('input_filename = ?'); values.push(input_filename); }
        if (output_filename !== undefined) { updates.push('output_filename = ?'); values.push(output_filename); }
        if (run_args !== undefined) { updates.push('run_args = ?'); values.push(run_args); }
        if (output_filename_2 !== undefined) { updates.push('output_filename_2 = ?'); values.push(output_filename_2); }
        if (expected_output_2 !== undefined) { updates.push('expected_output_2 = ?'); values.push(expected_output_2); }
        if (compare_mode !== undefined) { updates.push('compare_mode = ?'); values.push(compare_mode); }
        if (stdin !== undefined) { updates.push('stdin = ?'); values.push(stdin); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(id);
        await run(`UPDATE test_cases SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
        await saveDb();
        res.json({ message: 'Test case updated successfully' });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/test-cases/:id
router.delete('/:id', async (req, res, next) => {
    try {
        await run('DELETE FROM test_cases WHERE id = ?', [req.params.id]);
        await saveDb();
        res.json({ message: 'Test case deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
