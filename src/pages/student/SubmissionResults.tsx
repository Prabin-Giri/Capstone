import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAssignment, getSubmission, getSubmissionFileUrl } from '../../lib/api';
import type { Assignment, Submission, RubricConfig } from '../../lib/api';
import { getUser } from '../../lib/auth';
import './SubmissionResults.css';
import '../../components/ui/components.css';

type AutogradeTestRow = {
    testId?: string;
    passed?: boolean;
    points?: number;
    maxPoints?: number;
    actual?: string;
    expected?: string;
    timedOut?: boolean;
    exitCode?: number;
};

function parseAssignmentRubric(raw: string | RubricConfig | undefined | null): RubricConfig | null {
    let parsed: unknown;
    if (raw == null) return null;
    if (typeof raw === 'string') {
        if (!raw.trim()) return null;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return null;
        }
    } else {
        parsed = raw;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const p = parsed as RubricConfig;
    if (p.sections && Array.isArray(p.sections)) {
        return { title: p.title ?? '', weighted: !!p.weighted, sections: p.sections };
    }
    if (p.criteria && Array.isArray(p.criteria)) {
        return {
            title: p.title || '',
            weighted: !!p.weighted,
            sections: [{ id: 'sec-1', title: '', items: p.criteria }],
        };
    }
    return null;
}

function parseAutoFeedbackParts(raw?: string | null): { summaryLines: string[]; tests: AutogradeTestRow[] } {
    if (!raw?.trim()) return { summaryLines: [], tests: [] };
    const sep = '\n---\n';
    const idx = raw.indexOf(sep);
    const head = idx === -1 ? raw : raw.slice(0, idx);
    const tail = idx === -1 ? '' : raw.slice(idx + sep.length);
    const summaryLines = head.split('\n').map((l) => l.trim()).filter(Boolean);
    let tests: AutogradeTestRow[] = [];
    if (tail.trim()) {
        try {
            const parsed = JSON.parse(tail.trim()) as unknown;
            if (Array.isArray(parsed)) tests = parsed as AutogradeTestRow[];
        } catch {
            /* trailing block not JSON */
        }
    }
    return { summaryLines, tests };
}

export default function SubmissionResults() {
    const { courseId, assignmentId, submissionId } = useParams();
    const user = getUser();
    const studentId = user?.id || 'student-001';

    const [submission, setSubmission] = useState<Submission | null>(null);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);

    const rubric = useMemo(() => parseAssignmentRubric(assignment?.rubric_config ?? null), [assignment?.rubric_config]);
    const rubricScores = useMemo(() => {
        if (!submission?.rubric_scores) return null;
        try {
            if (typeof submission.rubric_scores === 'string') {
                return JSON.parse(submission.rubric_scores);
            }
            return submission.rubric_scores;
        } catch {
            return null;
        }
    }, [submission?.rubric_scores]);
    const autoParts = useMemo(
        () => parseAutoFeedbackParts(submission?.auto_feedback),
        [submission?.auto_feedback]
    );

    useEffect(() => {
        let cancelled = false;

        async function loadSubmission() {
            if (!submissionId || !assignmentId || !studentId) return;
            setLoading(true);
            try {
                const [subData, assignData] = await Promise.all([
                    getSubmission(parseInt(submissionId, 10)),
                    getAssignment(assignmentId),
                ]);
                if (cancelled) return;
                if (subData.student_id !== studentId) {
                    setSubmission(null);
                    setAssignment(null);
                    return;
                }
                setSubmission(subData);
                setAssignment(assignData);
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setSubmission(null);
                    setAssignment(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadSubmission();
        return () => {
            cancelled = true;
        };
    }, [submissionId, assignmentId, studentId]);

    if (loading) {
        return (
            <div className="submission-results-page">
                <div className="loading-spinner">Loading submission...</div>
            </div>
        );
    }

    if (!submission || !assignment) {
        return (
            <div className="submission-results-page">
                <div className="error-message">Submission not found or access denied.</div>
                <Link to={`/student/courses/${courseId}/grades`} className="btn-secondary">
                    Back to Grades
                </Link>
            </div>
        );
    }

    const assignmentPoints = assignment.points ?? 100;
    const hasInstructorFeedback = Boolean(submission.feedback?.trim());
    const hasAutoNarrative =
        autoParts.summaryLines.length > 0 || autoParts.tests.length > 0 || Boolean(submission.auto_feedback?.trim());
    const breakdown =
        submission.correctness_score != null ||
        submission.style_points != null ||
        submission.efficiency_points != null ||
        submission.deduction_points != null;

    return (
        <div className="submission-results-page">
            <div className="results-header">
                <div className="header-top">
                    <Link to={`/student/courses/${courseId}/assignments`} className="back-link">
                        ← Back to Assignments
                    </Link>
                    <Link to={`/student/courses/${courseId}/grades`} className="back-link grades-back">
                        Grades
                    </Link>
                </div>
                <h1>{assignment.title}</h1>
                <p className="assignment-meta">
                    Submitted on {new Date(submission.submitted_at).toLocaleString()}
                </p>
            </div>

            <div className="results-content">
                <div className="report-card grade-report-card">
                    <h2>Grade report</h2>
                    <div className="grade-report-grid">
                        <div className="grade-report-item highlight">
                            <span className="label">Final grade</span>
                            <span className="value">
                                {submission.grade != null
                                    ? `${submission.grade} / ${assignmentPoints}`
                                    : 'Not graded yet'}
                            </span>
                        </div>
                        {submission.auto_grade != null && (
                            <div className="grade-report-item">
                                <span className="label">Autograder suggested</span>
                                <span className="value">
                                    {submission.auto_grade} / {assignmentPoints}
                                </span>
                            </div>
                        )}
                        <div className="grade-report-item">
                            <span className="label">Status</span>
                            <span className={`value status-badge status-${submission.status}`}>
                                {submission.status}
                            </span>
                        </div>
                    </div>
                    {breakdown && (
                        <div className="breakdown-grid">
                            {submission.correctness_score != null && (
                                <div className="grade-report-item">
                                    <span className="label">Correctness</span>
                                    <span className="value">{String(submission.correctness_score)}</span>
                                </div>
                            )}
                            {submission.style_points != null && (
                                <div className="grade-report-item">
                                    <span className="label">Style</span>
                                    <span className="value">{String(submission.style_points)}</span>
                                </div>
                            )}
                            {submission.efficiency_points != null && (
                                <div className="grade-report-item">
                                    <span className="label">Efficiency</span>
                                    <span className="value">{String(submission.efficiency_points)}</span>
                                </div>
                            )}
                            {submission.deduction_points != null && (
                                <div className="grade-report-item">
                                    <span className="label">Deductions</span>
                                    <span className="value">{String(submission.deduction_points)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {hasInstructorFeedback && (
                    <div className="report-card feedback-card">
                        <h2>Instructor feedback</h2>
                        <div className="feedback-content">{submission.feedback}</div>
                    </div>
                )}

                {hasAutoNarrative && (
                    <div className="report-card auto-feedback-card">
                        <h2>Autograder report</h2>
                        {autoParts.summaryLines.length > 0 && (
                            <ul className="auto-summary-list">
                                {autoParts.summaryLines.map((line, i) => (
                                    <li key={i}>{line}</li>
                                ))}
                            </ul>
                        )}
                        {autoParts.tests.length > 0 && (
                            <div className="test-results">
                                <h3>Tests</h3>
                                {autoParts.tests.map((test, idx) => (
                                    <div
                                        key={test.testId ?? idx}
                                        className={`test-item ${test.passed ? 'passed' : 'failed'}`}
                                    >
                                        <div className="test-header">
                                            <span className="test-name">{test.testId ?? `Test ${idx + 1}`}</span>
                                            <span className="test-points">
                                                {test.points != null && test.maxPoints != null
                                                    ? `${test.points} / ${test.maxPoints}`
                                                    : test.passed
                                                      ? 'Passed'
                                                      : 'Failed'}
                                            </span>
                                        </div>
                                        {test.timedOut && <div className="test-detail warn">Timed out</div>}
                                        {test.exitCode != null && (
                                            <div className="test-detail">Exit code: {test.exitCode}</div>
                                        )}
                                        {test.actual != null && (
                                            <div className="test-detail">
                                                <strong>Actual:</strong> <code>{test.actual}</code>
                                            </div>
                                        )}
                                        {test.expected != null && (
                                            <div className="test-detail">
                                                <strong>Expected:</strong> <code>{test.expected}</code>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {autoParts.summaryLines.length === 0 &&
                            autoParts.tests.length === 0 &&
                            submission.auto_feedback?.trim() && (
                                <pre className="auto-feedback-raw">{submission.auto_feedback}</pre>
                            )}
                    </div>
                )}

                {rubric && rubric.sections && rubric.sections.length > 0 && (
                    <div className="report-card rubric-readonly-card">
                        <h2>Grading rubric{rubric.title?.trim() ? `: ${rubric.title}` : ''}</h2>
                        <p className="rubric-note">
                            {rubricScores 
                                ? 'Your scored points per criterion are shown below based on instructor grading.'
                                : 'Criteria and maximum points for this assignment. Scores will appear here when graded.'}
                        </p>
                        {rubric.sections.map((section) => {
                            const sectionTotal = section.items.reduce((sum, item) =>  {
                                const max = item.maxPoints ?? 0;
                                return sum + (max || 0);
                            }, 0);
                            const sectionEarned = section.items.reduce((sum, item) => {
                                const score = item.id && rubricScores ? (rubricScores[item.id] ?? 0) : 0;
                                return sum + (Number(score) || 0);
                            }, 0);
                            return (
                                <div key={section.id} className="rubric-section-readonly">
                                    {section.title?.trim() && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                            <h3 style={{ margin: 0 }}>{section.title}</h3>
                                            {rubricScores && (
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary-color)' }}>
                                                    {sectionEarned.toFixed(0)} / {sectionTotal}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <table className="rubric-readonly-table">
                                        <thead>
                                            <tr>
                                                <th>Criterion</th>
                                                <th style={{ textAlign: 'right', width: rubricScores ? '100px' : '80px' }}>Max Points</th>
                                                {rubricScores && <th style={{ textAlign: 'right', width: '100px', color: 'var(--primary-color)', fontWeight: 700 }}>Your Score</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {section.items.map((c) => {
                                                const score = c.id && rubricScores ? rubricScores[c.id] : null;
                                                const isAfar = score !== null && score !== undefined && score !== '';
                                                return (
                                                    <tr key={c.id} style={isAfar ? { backgroundColor: 'var(--bg-body)' } : {}}>
                                                        <td style={{ fontWeight: isAfar ? 600 : 'normal' }}>{c.name || '—'}</td>
                                                        <td style={{ textAlign: 'right' }}>{c.maxPoints ?? '—'}</td>
                                                        {rubricScores && (
                                                            <td style={{ textAlign: 'right', fontWeight: 600, color: isAfar ? 'var(--primary-color)' : 'var(--text-tertiary)' }}>
                                                                {isAfar ? `${score}` : '—'}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="files-section">
                    <h2>Submitted files</h2>
                    <div className="file-list">
                        {submission.files && submission.files.length > 0 ? (
                            submission.files.map((file, index) => (
                                <div key={index} className="file-item">
                                    <span className="file-icon">📄</span>
                                    <span className="file-name">{file.name || file.path?.split('/').pop() || 'file'}</span>
                                    <a
                                        href={getSubmissionFileUrl(submission.id, String(file.path || file.name || ''))}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="download-btn"
                                    >
                                        Download
                                    </a>
                                </div>
                            ))
                        ) : (
                            <div className="file-item">
                                <span className="file-icon">📄</span>
                                <span className="file-name">{submission.file_name}</span>
                                <a
                                    href={getSubmissionFileUrl(submission.id, submission.file_name)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="download-btn"
                                >
                                    Download
                                </a>
                            </div>
                        )}
                    </div>
                </div>

                <div className="actions-section">
                    <Link
                        to={`/student/courses/${courseId}/assignments/${assignmentId}/submit`}
                        className="btn-resubmit"
                    >
                        Submit New Version
                    </Link>
                </div>

                <div className="submission-history">
                    <h3>Submission History</h3>
                    <p>Version 1 (Current)</p>
                </div>
            </div>
        </div>
    );
}
