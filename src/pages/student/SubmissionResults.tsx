import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSubmission, getFileUrl, runAutoGrader } from '../../lib/api';
import type { Submission, AutoGradeResult } from '../../lib/api';
import { Play, Check, X } from 'lucide-react';
import './SubmissionResults.css';

const SubmissionResults: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [publicTestRunning, setPublicTestRunning] = useState(false);
    const [publicTestResult, setPublicTestResult] = useState<AutoGradeResult | null>(null);

    useEffect(() => {
        async function loadSubmission() {
            if (!submissionId) return;
            try {
                const data = await getSubmission(parseInt(submissionId, 10));
                setSubmission(data);
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
                <div className="mb-4">
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
            <div className="mb-4">
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
                                <td style={{ padding: '8px 0', color: '#6b7280', width: '140px' }}>File Name:</td>
                                <td style={{ padding: '8px 0', fontWeight: 500 }}>{submission.file_name}</td>
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
                            {submission.grade !== null && submission.grade !== undefined && (
                                <tr>
                                    <td style={{ padding: '8px 0', color: '#6b7280' }}>Grade:</td>
                                    <td style={{ padding: '8px 0', fontWeight: 600, color: '#16a34a' }}>{submission.grade}/100</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {submission.feedback && (
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
                        className="btn-secondary"
                        style={{
                            display: 'inline-block',
                            padding: '10px 20px',
                            background: '#f3f4f6',
                            color: '#374151',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontWeight: 500
                        }}
                    >
                        Resubmit Assignment
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default SubmissionResults;
