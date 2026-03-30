const express = require('express');
const router = express.Router();
const { gradeSubmission } = require('../grader/gradeSubmission');

/**
 * POST /api/grader/submissions/:id/run
 * Run the auto-grader for this submission. Updates submission with grade, feedback, status.
 * Query: ?publicOnly=1 — public tests only (e.g. student run).
 * ?dryRun=1 — run tests, do not persist.
 * ?testResultsOnly=1 — persist auto_grade/auto_feedback; keep status pending (no final grade).
 */
router.post('/submissions/:id/run', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid submission ID' });
        const publicOnly = req.query.publicOnly === '1' || req.query.publicOnly === 'true';
        const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
        const testResultsOnly =
            !dryRun &&
            (req.query.testResultsOnly === '1' || req.query.testResultsOnly === 'true');
        const result = await gradeSubmission(id, { publicOnly, dryRun, testResultsOnly });

        if (dryRun) {
            return res.json({
                ...result,
                id // Include ID for frontend consistency
            });
        }

        // Return the full updated submission object to satisfy frontend expectation
        const { getDb, queryOne } = require('../db');
        const db = getDb();
        const subResult = await db.execute('SELECT * FROM submissions WHERE id = ?', [id]);
        const updatedSub = queryOne(subResult);

        res.json(updatedSub);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
