import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { getAssignment, getSubmissions, getTestCases, runAutoGrader } from '../../lib/api';
import type { Assignment, Submission, TestCase, AutoGradeResult } from '../../lib/api';
import { Code, Download, Eye, Play, Check, X } from 'lucide-react';
import './AssignmentDetails.css';

import { getUser } from '../../lib/auth';

const AssignmentDetails: React.FC = () => {
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const { assignmentId } = useParams();
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [publicTestRunning, setPublicTestRunning] = useState(false);
    const [publicTestResult, setPublicTestResult] = useState<AutoGradeResult | null>(null);

    useEffect(() => {
        async function loadAssignment() {
            if (!assignmentId) return;
            try {
                const [assignmentData, submissionsData, testCaseData] = await Promise.all([
                    getAssignment(assignmentId),
                    getSubmissions({ assignment_id: assignmentId, student_id: studentId }),
                    getTestCases(assignmentId)
                ]);
                setAssignment(assignmentData);
                setSubmission(submissionsData.length > 0 ? submissionsData[0] : null);
                setTestCases(testCaseData.filter(tc => tc.is_public));
            } catch (err) {
                console.error(err);
                setError('Failed to load assignment details.');
            } finally {
                setLoading(false);
            }
        }
        loadAssignment();
    }, [assignmentId]);

    if (loading) {
        return <div className="assignment-details"><div className="state-card">Loading...</div></div>;
    }

    if (error || !assignment) {
        return (
            <div className="assignment-details">
                <div className="state-card">
                    <h1 className="details-title">Assignment not found</h1>
                    <p className="details-subtitle">{error || 'Invalid assignment ID'}</p>
                    <Link to="/student" className="link-primary">Back to Dashboard</Link>
                </div>
            </div>
        );
    }

    // Use assignment.points if available, falling back to 100
    const points = assignment.points || 100;
    const rubric = [
        { criteria: 'Correctness (Public Tests)', points: 40 },
        { criteria: 'Edge Cases', points: 20 },
        { criteria: 'Time Complexity O(log n)', points: 20 },
        { criteria: 'Code Style', points: 20 },
    ];
    const description = assignment.description || 'No description provided.';

    const displayDate = new Date(assignment.due_date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
    });

    return (
        <div className="assignment-details">
            <div className="details-header">
                <div>
                    <h1 className="details-title">{assignment.title}</h1>
                    <div className="details-meta" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Due:</span>
                            <span style={{ fontWeight: 600 }}>{displayDate}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Points:</span>
                            <span style={{ fontWeight: 600 }}>{points}</span>
                        </div>
                        {assignment.language && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Code size={16} color="var(--primary-color)" />
                                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{assignment.language}</span>
                            </div>
                        )}
                        <StatusBadge status={assignment.status} />
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Current Grade</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
                        {submission && submission.grade !== undefined && submission.grade !== null
                            ? `${submission.grade}/${points}`
                            : `-/${points}`}
                    </div>
                </div>
            </div>

            <div className="section">
                <h2 className="section-title">Instructions</h2>
                <div className="description-text">{description}</div>
            </div>

            {testCases.length > 0 && (
                <div className="section">
                    <h2 className="section-title">
                        <Eye size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                        Sample Test Cases (Public)
                    </h2>
                    <div className="test-cases-display">
                        {testCases.map((tc, idx) => (
                            <div key={tc.id} className="test-case-card-student">
                                <div className="tc-card-header">Test Case {idx + 1} ({tc.points} pts)</div>
                                <div className="tc-io-grid">
                                    <div className="io-group">
                                        <div className="io-label">Input</div>
                                        <pre className="io-content">{tc.input || '(None)'}</pre>
                                    </div>
                                    <div className="io-group">
                                        <div className="io-label">Expected Output</div>
                                        <pre className="io-content">{tc.expected_output}</pre>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {submission && (
                        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn btn-outline"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                                disabled={publicTestRunning}
                                onClick={async () => {
                                    if (!submission) return;
                                    setPublicTestRunning(true);
                                    setPublicTestResult(null);
                                    try {
                                        const result = await runAutoGrader(submission.id, true);
                                        setPublicTestResult(result);
                                    } catch (e) {
                                        setPublicTestResult({
                                            grade: null,
                                            feedback: e instanceof Error ? e.message : 'Run failed',
                                            results: [],
                                            rawScore: 0,
                                            maxPossible: 0,
                                            latePenaltyPercent: 0,
                                        });
                                    } finally {
                                        setPublicTestRunning(false);
                                    }
                                }}
                            >
                                <Play size={18} />
                                {publicTestRunning ? 'Running public tests…' : 'Run public tests'}
                            </button>
                            <span className="form-hint" style={{ margin: 0 }}>
                                Runs your latest submission against public test cases only. Your grade is not changed.
                            </span>
                        </div>
                    )}
                    {publicTestResult && (
                        <div className="public-test-results" style={{
                            marginTop: '1.25rem',
                            padding: '1rem',
                            background: 'var(--primary-light, #eff6ff)',
                            borderRadius: '8px',
                            border: '1px solid var(--primary-color, #2563eb)',
                        }}>
                            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>
                                Public test results
                            </h3>
                            <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>
                                Score: {publicTestResult.rawScore.toFixed(0)} / {publicTestResult.maxPossible} points
                            </p>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {publicTestResult.results.map((r, i) => (
                                    <li key={i} style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '0.5rem',
                                        padding: '0.5rem 0',
                                        borderBottom: i < publicTestResult.results.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                                    }}>
                                        {r.passed ? <Check size={18} color="#16a34a" /> : <X size={18} color="#dc2626" />}
                                        <span style={{ fontWeight: 500 }}>Test {i + 1}:</span>
                                        <span>{r.passed ? 'Passed' : 'Failed'}</span>
                                        <span style={{ color: '#6b7280' }}>({r.points}/{r.maxPoints} pts)</span>
                                        {!r.passed && (r.actual !== undefined || r.expected !== undefined || r.error) && (
                                            <div style={{ width: '100%', marginTop: '0.25rem', fontSize: '0.875rem', color: '#374151' }}>
                                                {r.error && <div>Error: {r.error}</div>}
                                                {r.actual !== undefined && <div><strong>Your output:</strong> <pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap' }}>{r.actual.slice(0, 300)}{r.actual.length > 300 ? '…' : ''}</pre></div>}
                                                {r.expected !== undefined && <div><strong>Expected:</strong> <pre style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap' }}>{r.expected.slice(0, 300)}{r.expected.length > 300 ? '…' : ''}</pre></div>}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {assignment.starter_code_path && (
                <div className="section">
                    <h2 className="section-title">Assignment Materials</h2>
                    <div className="materials-box">
                        <div className="material-item">
                            <div className="material-info">
                                <Download size={20} color="var(--primary-color)" />
                                <div>
                                    <div className="material-name">Starter Code</div>
                                    <div className="material-size">Download resources to begin the assignment</div>
                                </div>
                            </div>
                            <a
                                href={`http://localhost:3001/uploads/${assignment.starter_code_path}`}
                                download
                                className="btn btn-outline"
                                style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
                            >
                                Download ZIP
                            </a>
                        </div>
                    </div>
                </div>
            )}

            <div className="section">
                <h2 className="section-title">Grading Rubric</h2>
                <table className="rubric-table">
                    <thead>
                        <tr>
                            <th>Criteria</th>
                            <th style={{ textAlign: 'right' }}>Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rubric.map((item, index) => (
                            <tr key={index}>
                                <td>{item.criteria}</td>
                                <td style={{ textAlign: 'right' }}>{item.points}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="action-bar">
                <Link to={`/student/courses/${assignment.course_id}/assignments/${assignment.id}/submit`} className="btn btn-primary">
                    {submission ? 'Resubmit Assignment' : 'Submit Assignment'}
                </Link>
            </div>
        </div>
    );
};

export default AssignmentDetails;
