import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { getAssignment, getSubmissions, getTestCases, runAutoGrader } from '../../lib/api';
import type { Assignment, Submission, TestCase, AutoGradeResult } from '../../lib/api';
import { Code, Download, Eye, Play, Check, X, CheckCircle, XCircle, Zap, Clock, PenTool } from 'lucide-react';
import './AssignmentDetails.css';

import { getUser } from '../../lib/auth';

type TestResult = AutoGradeResult['results'][0] & { is_public?: number };

const AssignmentDetails: React.FC = () => {
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const { assignmentId } = useParams();
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [testResults, setTestResults] = useState<TestResult[] | null>(null);
    const [isRunningTests, setIsRunningTests] = useState(false);
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

    const isPastDue = new Date() > new Date(assignment.due_date);
    let displayStatus = assignment.status;
    if (assignment.status === 'active' && isPastDue) {
        displayStatus = 'late';
    }

    const handleRunTests = async () => {
        if (!submission || !assignment) return;

        setIsRunningTests(true);
        setTestResults(null);
        setPublicTestResult(null);
        try {
            const result = await runAutoGrader(submission.id, true);
            setPublicTestResult(result);
            setTestResults(result.results.map(r => ({ ...r, is_public: 1 })));
        } catch (err) {
            console.error(err);
            alert('Failed to run tests. Please try again.');
        } finally {
            setIsRunningTests(false);
        }
    };

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
                        <StatusBadge status={displayStatus as any} />
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Current Grade</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
                        {submission && submission.grade !== undefined && submission.grade !== null && (submission.status === 'graded' || submission.status === 'returned')
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

            {/* Test Runner Section */}
            <div className="section">
                <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 className="section-title" style={{ marginBottom: 0 }}>
                        <Play size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                        Test Runner
                    </h2>
                    <button
                        className="btn btn-outline"
                        onClick={handleRunTests}
                        disabled={!submission || isRunningTests}
                        title={!submission ? "Submit an assignment first to run tests" : "Run tests on latest submission"}
                    >
                        {isRunningTests ? 'Running...' : 'Run Tests on Latest Submission'}
                    </button>
                </div>

                {!submission && (
                    <p className="text-gray-500 mt-2">Submit your code to enable the test runner.</p>
                )}

                {testResults && (
                    <div className="test-results-container mt-4">
                        {/* Full Grading Report Card - MOCKED SCORES as requested */}
                        <div className="grading-report">
                            <div className="report-header">
                                <div>
                                    <div className="total-score-label">Total Score</div>
                                    <div className="total-score-value">
                                        88
                                        <span style={{ fontSize: '1.25rem', color: '#9ca3af', fontWeight: 500 }}>/100</span>
                                    </div>
                                </div>
                                <div className="score-progress-container">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 500, color: '#6b7280' }}>
                                        <span>Progress</span>
                                        <span>88%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div
                                            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                                            style={{ width: '88%' }}
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            <div className="criteria-list">
                                {/* Correctness - Mocked to 35/40 (87.5%) */}
                                <div className="criteria-item">
                                    <div className="criteria-icon" style={{ background: '#dcfce7', color: '#166534' }}>
                                        <CheckCircle size={20} />
                                    </div>
                                    <div className="criteria-content">
                                        <div className="criteria-title">Correctness</div>
                                        <div className="criteria-desc">
                                            Passed public tests with minor edge case warnings.
                                        </div>
                                    </div>
                                    <div className="criteria-score">
                                        35
                                        <span>/40</span>
                                    </div>
                                </div>

                                {/* Edge Cases - Mocked to 18/20 (90%) */}
                                <div className="criteria-item">
                                    <div className="criteria-icon" style={{ background: '#fef9c3', color: '#854d0e' }}>
                                        <Zap size={20} />
                                    </div>
                                    <div className="criteria-content">
                                        <div className="criteria-title">Edge Cases</div>
                                        <div className="criteria-desc">
                                            Robust handling of null inputs and boundary values.
                                        </div>
                                    </div>
                                    <div className="criteria-score">
                                        18
                                        <span>/20</span>
                                    </div>
                                </div>

                                {/* Complexity - Mocked to 17/20 (85%) */}
                                <div className="criteria-item">
                                    <div className="criteria-icon" style={{ background: '#e0e7ff', color: '#4338ca' }}>
                                        <Clock size={20} />
                                    </div>
                                    <div className="criteria-content">
                                        <div className="criteria-title">Time Complexity</div>
                                        <div className="criteria-desc">O(log n) algorithm implementation detected (within limits).</div>
                                    </div>
                                    <div className="criteria-score">
                                        17
                                        <span>/20</span>
                                    </div>
                                </div>

                                {/* Style - Mocked to 18/20 (90%) */}
                                <div className="criteria-item">
                                    <div className="criteria-icon" style={{ background: '#f3e8ff', color: '#7e22ce' }}>
                                        <PenTool size={20} />
                                    </div>
                                    <div className="criteria-content">
                                        <div className="criteria-title">Code Style</div>
                                        <div className="criteria-desc">Clean, readable code. Good variable naming conventions.</div>
                                    </div>
                                    <div className="criteria-score">
                                        18
                                        <span>/20</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h3 className="text-lg font-semibold mb-3">Detailed Results</h3>
                        <div className="test-results-grid" style={{ display: 'grid', gap: '1rem' }}>
                            {testResults.map((result, idx) => (
                                <div
                                    key={idx}
                                    className={`p-4 rounded-lg border ${result.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
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
                                                    <div className="mb-1"><span className="font-semibold">Expected:</span> <code className="bg-white px-1 rounded border">{result.expected}</code></div>
                                                    <div className="mb-1"><span className="font-semibold">Actual:</span> <code className="bg-white px-1 rounded border">{result.actual}</code></div>
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
                    </div>
                )}
            </div>

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

            {allSubmissions.length > 0 && (
                <div className="section">
                    <h2 className="section-title">Submission History</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {allSubmissions.map((sub, index) => {
                            const isSubGraded = sub.status === 'graded' || sub.status === 'returned';
                            const attemptLabel = `Attempt ${allSubmissions.length - index}`;

                            return (
                                <div key={sub.id} style={{
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    background: '#f9fafb',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>{attemptLabel}</div>
                                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
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
                                                ? `${sub.grade}/${points}`
                                                : '-'}
                                        </div>
                                    </div>
                                    <Link
                                        to={`/student/courses/${assignment.course_id}/assignments/${assignment.id}/submissions/${sub.id}`}
                                        className="btn btn-outline"
                                        style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
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
