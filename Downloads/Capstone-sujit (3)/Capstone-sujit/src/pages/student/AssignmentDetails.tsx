import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { getAssignment, getSubmissions, getTestCases, runTests, getFileUrl, formatGrade, UPLOADS_BASE } from '../../lib/api';
import { Code, Download, Eye, Play, CheckCircle, XCircle } from 'lucide-react';
import type { Assignment, Submission, TestCase, TestResult } from '../../lib/api';
import './AssignmentDetails.css';

import { getUser } from '../../lib/auth';

const AssignmentDetails: React.FC = () => {
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const { assignmentId } = useParams();
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [testResults, setTestResults] = useState<TestResult[] | null>(null);
    const [testRunLog, setTestRunLog] = useState<string | null>(null);
    const [isRunningTests, setIsRunningTests] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                setAllSubmissions(submissionsData);
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
    const description = assignment.description || 'No description provided.';

    const displayDate = new Date(assignment.due_date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
    });

    const isPastDue = new Date() > new Date(assignment.due_date);
    let displayStatus = assignment.status;
    if (assignment.status === 'active' && isPastDue) {
        displayStatus = 'late';
    }

    const handleRunTests = async () => {
        if (!submission || !assignment) return;

        setIsRunningTests(true);
        setTestResults(null);
        setTestRunLog(null);
        try {
            // 1. Resolve path: submission.file_path can be JSON array of { name, path }
            const pathToFetch = (submission.files && submission.files[0]?.path)
                ? submission.files[0].path
                : submission.file_path;
            const fileUrl = getFileUrl(pathToFetch);
            const res = await fetch(fileUrl);
            if (!res.ok) throw new Error(`Failed to load file: ${res.status}`);
            const code = await res.text();

            // 2. Run tests
            const data = await runTests(assignment.id, code, assignment.language || 'python');
            setTestResults(data.results);
            setTestRunLog(JSON.stringify({ request: { assignmentId: assignment.id, language: assignment.language || 'python', codeLength: code.length }, response: data }, null, 2));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setTestRunLog(`Error: ${msg}`);
            console.error(err);
            alert('Failed to run tests. Please try again.');
        } finally {
            setIsRunningTests(false);
        }
    };

    return (
        <div className="assignment-details">
            <div className="details-header">
                <div className="details-header-left">
                    <h1 className="details-title">{assignment.title}</h1>
                    <div className="details-meta">
                        <div className="meta-item">
                            <span className="meta-label">Due:</span>
                            <span className="meta-value">{displayDate}</span>
                        </div>
                        <div className="meta-row-combined">
                            <div className="meta-item">
                                <span className="meta-label">Points:</span>
                                <span className="meta-value">{points}</span>
                            </div>
                            <StatusBadge status={displayStatus as any} />
                        </div>
                        {assignment.language && (
                            <div className="meta-item">
                                <Code size={16} className="meta-icon" />
                                <span className="meta-value text-capitalize">{assignment.language}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="details-header-right">
                    <div className="details-grade">
                        <div className="grade-label">Current Grade</div>
                        <div className="grade-value">
                            {submission && submission.grade !== undefined && submission.grade !== null && (submission.status === 'graded' || submission.status === 'returned')
                                ? `${formatGrade(submission.grade)}/${points}`
                                : `-/${points}`}
                        </div>
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
                        Sample Test Cases
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
                </div>
            )}

            {/* Test Runner Section */}
            <div className="section">
                <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h2 className="section-title" style={{ marginBottom: 0 }}>
                        <Play size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                        Run Your Code
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-outline"
                            onClick={handleRunTests}
                            disabled={!submission || isRunningTests}
                            title={!submission ? "Submit an assignment first to run tests" : "Run against assignment test datasets"}
                        >
                            {isRunningTests ? 'Running...' : 'Run with Test Data'}
                        </button>
                        <Link to="/run" className="btn btn-outline" style={{ textDecoration: 'none' }}>
                            Run with Custom Input
                        </Link>
                    </div>
                </div>
                <p className="description-text" style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Run with test data (uses your latest submission) or run with manual input in Code Runner (Python or Java).
                </p>
                {!submission && (
                    <p className="text-gray-500 mt-2">Submit your code to run against test datasets. You can still use Code Runner to run with custom input anytime.</p>
                )}

                {testResults && (
                    <div className="test-results-container mt-4">
                        {(() => {
                            const totalTestPoints = testResults.reduce((s, r) => s + (r.points ?? 0), 0);
                            const earnedTestPoints = testResults.reduce((s, r) => s + (r.passed ? (r.points ?? 0) : 0), 0);
                            const pct = totalTestPoints > 0 ? Math.round((earnedTestPoints / totalTestPoints) * 100) : 0;
                            return (
                                <div className="grading-report">
                                    <div className="report-header">
                                        <div>
                                            <div className="total-score-label">Test Score</div>
                                            <div className="total-score-value">
                                                {totalTestPoints > 0 ? (
                                                    <><span>{earnedTestPoints}</span><span style={{ fontSize: '1.25rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>/{totalTestPoints}</span></>
                                                ) : (
                                                    <><span>{testResults.filter(r => r.passed).length}</span><span style={{ fontSize: '1.25rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>/{testResults.length} passed</span></>
                                                )}
                                            </div>
                                        </div>
                                        {totalTestPoints > 0 && (
                                            <div className="score-progress-container">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                                                    <span>Progress</span>
                                                    <span>{pct}%</span>
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-2">
                                                    <div
                                                        className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        <h3 className="text-lg font-semibold mb-3">Detailed Results</h3>
                        <div className="test-results-grid" style={{ display: 'grid', gap: '1rem' }}>
                            {testResults.map((result, idx) => (
                                <div
                                    key={idx}
                                    className={`p-4 rounded-lg border ${result.passed ? '' : ''}`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            {result.passed ? <CheckCircle className="text-green-600" size={20} /> : <XCircle className="text-red-600" size={20} />}
                                            <span className="font-medium">Test Case {idx + 1}</span>
                                        </div>
                                        {result.is_public === 0 && <span className="text-xs bg-gray-200 px-2 py-1 rounded">Hidden</span>}
                                    </div>

                                    {result.is_public === 1 && (
                                        <div className="text-sm mt-2">
                                            {!result.passed && (
                                                <>
                                                    <div className="mb-1"><span className="font-semibold">Expected:</span> <code className="px-1 rounded border">{result.expected}</code></div>
                                                    <div className="mb-1"><span className="font-semibold">Actual:</span> <code className="px-1 rounded border">{result.actual}</code></div>
                                                </>
                                            )}
                                            {result.error && (
                                                <div className="text-red-600 mt-1"><span className="font-semibold">Error:</span> {result.error}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {testRunLog && (
                            <details className="test-run-log" style={{ marginTop: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                                <summary style={{ padding: '0.75rem 1rem', background: 'var(--light-grey)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>Log (debug – remove later)</summary>
                                <pre style={{ margin: 0, padding: '1rem', background: '#111827', color: '#e5e7eb', fontSize: '0.75rem', overflow: 'auto', maxHeight: '20rem' }}>{testRunLog}</pre>
                            </details>
                        )}
                    </div>
                )}
            </div>

            {assignment.starter_code_path && (
                <div className="section">
                    <h2 className="section-title">Assignment Materials</h2>
                    <div className="materials-box">
                        <div className="material-item">
                            <div className="material-info">
                                <Download size={20} color="var(--primary-text)" />
                                <div>
                                    <div className="material-name">Starter Code</div>
                                    <div className="material-size">Download resources to begin the assignment</div>
                                </div>
                            </div>
                            <a
                                href={`${UPLOADS_BASE}/uploads/${assignment.starter_code_path}`}
                                download
                                className="btn btn-outline"

                            >
                                Download ZIP
                            </a>
                        </div>
                    </div>
                </div>
            )}

            <div className="section">
                <h2 className="section-title">Grading</h2>
                <p className="description-text" style={{ marginBottom: 0 }}>
                    This assignment is graded automatically by the autograder based on test cases. Total points: <strong>{points}</strong>. Run tests above to see sample results; your final grade may include additional hidden tests and will appear here after grading.
                </p>
            </div>

            {allSubmissions.length > 0 && (
                <div className="section">
                    <h2 className="section-title">Submission History</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {allSubmissions.map((sub, index) => {
                            const isSubGraded = sub.status === 'graded' || sub.status === 'returned';
                            const attemptLabel = `Attempt ${allSubmissions.length - index}`;

                            return (
                                <div key={sub.id} style={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    background: 'var(--bg-surface)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{attemptLabel}</div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            Submitted: {new Date(sub.submitted_at).toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                                            <span style={{ fontWeight: 500 }}>Status:</span>{' '}
                                            <span style={{
                                                color: isSubGraded ? '#16a34a' : '#d97706',
                                                textTransform: 'capitalize'
                                            }}>
                                                {sub.status}
                                            </span>
                                            {' • '}
                                            <span style={{ fontWeight: 500 }}>Grade:</span>{' '}
                                            {isSubGraded && sub.grade !== null && sub.grade !== undefined
                                                ? `${formatGrade(sub.grade)}/${points}`
                                                : '-'}
                                        </div>
                                    </div>
                                    <Link
                                        to={`/student/courses/${assignment.course_id}/assignments/${assignment.id}/submissions/${sub.id}`}
                                        className="btn btn-outline"

                                    >
                                        View Details
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="action-bar">
                {displayStatus === 'closed' ? (
                    <button className="btn btn-primary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                        Assignment is Closed
                    </button>
                ) : displayStatus === 'late' && submission ? (
                    <button className="btn" disabled style={{ backgroundColor: '#eadddf', color: '#988385', border: '1px solid #d7c5c7', cursor: 'not-allowed' }}>
                        Resubmit Assignment
                    </button>
                ) : (
                    <Link to={`/student/courses/${assignment.course_id}/assignments/${assignment.id}/submit`} className="btn btn-primary">
                        {submission ? 'Resubmit Assignment' : 'Submit Assignment'}
                    </Link>
                )}
            </div>
        </div>
    );
};

export default AssignmentDetails;
