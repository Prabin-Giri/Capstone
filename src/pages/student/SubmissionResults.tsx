import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSubmission, getFileUrl, runAutoGrader } from '../../lib/api';
import type { Submission, AutoGradeResult } from '../../lib/api';
import { Play, Check, X } from 'lucide-react';
import { getUser } from '../../lib/auth';
import './SubmissionResults.css';

const SubmissionResults: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [publicTestRunning, setPublicTestRunning] = useState(false);
    const [publicTestResult, setPublicTestResult] = useState<AutoGradeResult | null>(null);

    useEffect(() => {
        async function loadSubmission() {
            if (!submissionId || !assignmentId) return;
            try {
                const [data, submissionsData] = await Promise.all([
                    getSubmission(parseInt(submissionId, 10)),
                    getSubmissions({ assignment_id: assignmentId, student_id: studentId })
                ]);
                setSubmission(data);
                setAllSubmissions(submissionsData);
            } catch (err) {
                setError('Failed to load submission');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        loadSubmission();
    }, [submissionId]);

    if (loading) {
        return (
            <div className="submission-results">
                <div className="loading-state">
                    <p>Loading submission...</p>
                </div>
            </div>
        );
    }

    if (error || !submission) {
        return (
            <div className="submission-results">
                <div className="back-link-container">
                    <Link to={`/student/courses/${courseId}/assignments/${assignmentId}`} className="text-gray-500 hover:text-gray-900 back-link">
                        &larr; Back to Assignment
                    </Link>
                </div>
                <div className="results-header">
                    <h1 className="results-title">Submission Not Found</h1>
                </div>
                <p style={{ color: '#dc2626' }}>{error || 'This submission does not exist.'}</p>
            </div>
        );
    }

    return (
        <div className="submission-results">
            <div className="back-link-container">
                <Link to={`/student/courses/${courseId}/assignments/${assignmentId}`} className="text-gray-500 hover:text-gray-900 back-link">
                    &larr; Back to Assignment
                </Link>
            </div>

            <div className="results-header">
                <h1 className="results-title">Submission Details</h1>
                <span className={`status-pill status-${submission.status}`} style={{
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 500,
                    background: submission.status === 'graded' ? '#dcfce7' :
                        submission.status === 'pending' ? '#fef3c7' : '#f3f4f6',
                    color: submission.status === 'graded' ? '#16a34a' :
                        submission.status === 'pending' ? '#d97706' : '#6b7280'
                }}>
                    {submission.status}
                </span>
            </div>

            <div className="results-content" style={{ marginTop: '24px' }}>
                <div style={{
                    background: '#f9fafb',
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '20px'
                }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>File Information</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            <tr>
                                <td style={{ padding: '8px 0', color: '#6b7280', verticalAlign: 'top' }}>Files Submitted:</td>
                                <td style={{ padding: '8px 0', fontWeight: 500 }}>
                                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                        {(submission.files || [{ name: submission.file_name, path: submission.file_path }]).map((f, i) => (
                                            <li key={i}>{f.name}</li>
                                        ))}
                                    </ul>
                                </td>
                            </tr>
                            <tr>
                                <td style={{ padding: '8px 0', color: '#6b7280' }}>Submitted At:</td>
                                <td style={{ padding: '8px 0' }}>{new Date(submission.submitted_at).toLocaleString()}</td>
                            </tr>
                            {submission.updated_at !== submission.submitted_at && (
                                <tr>
                                    <td style={{ padding: '8px 0', color: '#6b7280' }}>Last Updated:</td>
                                    <td style={{ padding: '8px 0' }}>{new Date(submission.updated_at).toLocaleString()}</td>
                                </tr>
                            )}
                            {submission.grade !== null && submission.grade !== undefined && (submission.status === 'graded' || submission.status === 'returned') && (
                                <tr>
                                    <td style={{ padding: '8px 0', color: '#6b7280' }}>Grade:</td>
                                    <td style={{ padding: '8px 0', fontWeight: 600, color: '#16a34a' }}>{submission.grade}/100</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {submission.feedback && (submission.status === 'graded' || submission.status === 'returned') && (
                    <div style={{
                        background: '#eff6ff',
                        padding: '20px',
                        borderRadius: '8px',
                        marginBottom: '20px'
                    }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Instructor Feedback</h3>
                        <p style={{ margin: 0, lineHeight: 1.6 }}>{submission.feedback}</p>
                    </div>
                )}

                <div style={{
                    background: '#f9fafb',
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    border: '1px solid #e5e7eb'
                }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Public tests</h3>
                    <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#6b7280' }}>
                        Run your submission against public test cases only. Your saved grade is not changed.
                    </p>
                    <button
                        type="button"
                        onClick={async () => {
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
                        disabled={publicTestRunning}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            background: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 500,
                            cursor: publicTestRunning ? 'wait' : 'pointer',
                        }}
                    >
                        <Play size={18} />
                        {publicTestRunning ? 'Running…' : 'Run public tests'}
                    </button>
                    {publicTestResult && (
                        <div style={{ marginTop: '16px' }}>
                            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
                                Score: {publicTestResult.rawScore.toFixed(0)} / {publicTestResult.maxPossible} points
                            </p>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {publicTestResult.results.map((r, i) => (
                                    <li key={i} style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '8px',
                                        padding: '6px 0',
                                        borderBottom: i < publicTestResult.results.length - 1 ? '1px solid #e5e7eb' : 'none',
                                        fontSize: '14px',
                                    }}>
                                        {r.passed ? <Check size={18} color="#16a34a" /> : <X size={18} color="#dc2626" />}
                                        <span>Test {i + 1}:</span>
                                        <span>{r.passed ? 'Passed' : 'Failed'}</span>
                                        <span style={{ color: '#6b7280' }}>({r.points}/{r.maxPoints} pts)</span>
                                        {!r.passed && (r.actual !== undefined || r.expected !== undefined || r.error) && (
                                            <div style={{ width: '100%', marginTop: '4px', fontSize: '13px', color: '#374151' }}>
                                                {r.error && <div>Error: {r.error}</div>}
                                                {r.actual !== undefined && <div><strong>Your output:</strong> <pre style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{r.actual.slice(0, 300)}{r.actual.length > 300 ? '…' : ''}</pre></div>}
                                                {r.expected !== undefined && <div><strong>Expected:</strong> <pre style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{r.expected.slice(0, 300)}{r.expected.length > 300 ? '…' : ''}</pre></div>}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    <a
                        href={getFileUrl(submission.file_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary"
                        style={{
                            display: 'inline-block',
                            padding: '10px 20px',
                            background: '#2563eb',
                            color: 'white',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontWeight: 500
                        }}
                    >
                        Download Submitted File
                    </a>
                    <Link
                        to={`/student/courses/${courseId}/assignments/${assignmentId}/submit`}
                        className="btn-secondary resubmit-button"
                        style={{
                            display: 'inline-block',
                            padding: '10px 20px',
                            background: '#f3f4f6',
                            color: '#374151',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontWeight: 500,
                            transition: 'box-shadow 0.2s ease-in-out'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(254, 226, 226, 0.5), 0 2px 4px -1px rgba(254, 226, 226, 0.3)'; // Light red shadow
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = 'none'; // Remove shadow
                        }}
                    >
                        Resubmit Assignment
                    </Link>
                </div>

                {allSubmissions.length > 0 && (
                    <div className="section" style={{ marginTop: '32px' }}>
                        <h2 className="section-title" style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '16px' }}>Submission History</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {allSubmissions.map((sub, index) => {
                                const isSubGraded = sub.status === 'graded' || sub.status === 'returned';
                                const attemptLabel = `Attempt ${allSubmissions.length - index}`;
                                const isCurrent = sub.id === parseInt(submissionId || '0', 10);

                                return (
                                    <div key={sub.id} style={{
                                        border: isCurrent ? '2px solid var(--primary-color, #9f1239)' : '1px solid #e5e7eb',
                                        borderRadius: '8px',
                                        padding: '16px',
                                        background: isCurrent ? '#fff1f2' : '#f9fafb',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                                                {attemptLabel}
                                                {isCurrent && (
                                                    <span style={{
                                                        color: 'var(--primary-color, #9f1239)',
                                                        marginLeft: '8px',
                                                        fontSize: '12px',
                                                        background: '#ffe4e6',
                                                        padding: '2px 8px',
                                                        borderRadius: '12px'
                                                    }}>
                                                        Current View
                                                    </span>
                                                )}
                                            </div>
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
                                                    ? `${sub.grade}/100`
                                                    : '-'}
                                            </div>
                                        </div>
                                        {!isCurrent && (
                                            <Link
                                                to={`/student/courses/${courseId}/assignments/${assignmentId}/submissions/${sub.id}`}
                                                className="btn btn-outline"
                                                style={{ borderColor: 'var(--primary-color, #9f1239)', color: 'var(--primary-color, #9f1239)' }}
                                            >
                                                View Details
                                            </Link>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SubmissionResults;
