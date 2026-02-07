import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSubmission, getFileUrl } from '../../lib/api';
import type { Submission } from '../../lib/api';
import './SubmissionResults.css';

const SubmissionResults: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
