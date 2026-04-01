import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSubmission, getSubmissionFileUrl, getSubmissions, getAssignment } from '../../lib/api';
import type { Submission, Assignment } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { parseUTC } from '../../lib/utils';
import { ChevronLeft } from 'lucide-react';
import './SubmissionResults.css';

const SubmissionResults: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadSubmission() {
            if (!submissionId || !assignmentId) return;
            try {
                const [data, submissionsData, assignmentData] = await Promise.all([
                    getSubmission(parseInt(submissionId, 10)),
                    getSubmissions({ assignment_id: assignmentId, student_id: studentId }),
                    getAssignment(assignmentId)
                ]);
                setSubmission(data);
                setAllSubmissions(submissionsData);
                setAssignment(assignmentData);
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
                <div className="breadcrumb">
                    <Link to={`/student/courses/${courseId}/assignments/${assignmentId}`}>
                        <ChevronLeft size={14} />
                        Back to Assignment
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
            <div className="breadcrumb">
                <Link to={`/student/courses/${courseId}/assignments/${assignmentId}`}>
                    <ChevronLeft size={14} />
                    Back to Assignment
                </Link>
            </div>

            <div className="results-header">
                <h1 className="results-title">Submission Details</h1>
                <span className={`status-pill status-${submission.status?.toLowerCase()}`} style={{
                    padding: '2px 8px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: submission.status?.toLowerCase() === 'graded' ? 'var(--success-bg)' : submission.status?.toLowerCase() === 'pending' ? 'var(--secondary-color)' : 'var(--light-grey)',
                    color: 'var(--text-primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 'fit-content',
                    textTransform: 'capitalize'
                }}>
                    {submission.status?.toLowerCase()}
                </span>
            </div>

            <div className="results-content" style={{ marginTop: '24px' }}>
                <div style={{
                    background: 'var(--bg-surface)',
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '20px'
                }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>File Information</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            <tr>
                                <td style={{ padding: '8px 0', color: 'var(--text-secondary)', verticalAlign: 'top' }}>Files Submitted:</td>
                                <td style={{ padding: '8px 0', fontWeight: 500 }}>
                                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                        {(submission.files || [{ name: submission.file_name, path: submission.file_path }]).map((f, i) => (
                                            <li key={i}>{f.name}</li>
                                        ))}
                                    </ul>
                                </td>
                            </tr>
                            <tr>
                                <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>Submitted At:</td>
                                <td style={{ padding: '8px 0' }}>{parseUTC(submission.submitted_at).toLocaleString()}</td>
                            </tr>
                            {submission.updated_at !== submission.submitted_at && (
                                <tr>
                                    <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>Last Updated:</td>
                                    <td style={{ padding: '8px 0' }}>{parseUTC(submission.updated_at).toLocaleString()}</td>
                                </tr>
                            )}
                            {submission.grade !== null && submission.grade !== undefined && (
                                <tr>
                                    <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>Grade:</td>
                                    <td style={{ padding: '8px 0', fontWeight: 600, color: '#16a34a' }}>
                                        {Number(submission.grade).toFixed(2)}/{((assignment?.points || 100)).toFixed(2)}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {submission.feedback && (
                    <div style={{
                        background: 'var(--bg-surface)',
                        padding: '20px',
                        borderRadius: '8px',
                        marginBottom: '20px'
                    }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Instructor Feedback</h3>
                        <p style={{ margin: 0, lineHeight: 1.6, wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>{submission.feedback}</p>
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '24px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {(submission.files || [{ name: submission.file_name, path: submission.file_path }]).map((f, i) => (
                            <a
                                key={i}
                                href={getSubmissionFileUrl(submission.id, f.name)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-outline btn-pill"
                                style={{ display: 'inline-flex', alignItems: 'center' }}
                            >
                                {f.name}
                            </a>
                        ))}
                    </div>
                    <Link
                        to={`/student/courses/${courseId}/assignments/${assignmentId}`}
                        className="btn btn-primary btn-pill"
                    >
                        Resubmit Assignment
                    </Link>
                </div>

                {allSubmissions.length > 0 && (
                    <div className="section" style={{ marginTop: '32px' }}>
                        <h2 className="section-title" style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '16px' }}>Submission History</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {allSubmissions.map((sub, index) => {
                                const isSubGraded = ['graded', 'returned'].includes(sub.status?.toLowerCase() || '');
                                const attemptLabel = `Attempt ${allSubmissions.length - index}`;
                                const isCurrent = sub.id === parseInt(submissionId || '0', 10);

                                return (
                                    <div key={sub.id} style={{
                                        border: isCurrent ? '2px solid var(--primary-light)' : '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        padding: '16px',
                                        background: isCurrent ? 'var(--light-grey)' : 'var(--bg-surface)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                                {attemptLabel}
                                                {isCurrent && (
                                                    <span style={{
                                                        color: 'var(--text-primary)',
                                                        marginLeft: '8px',
                                                        fontSize: '12px',
                                                        background: 'var(--light-grey)',
                                                        padding: '2px 8px',
                                                        borderRadius: '12px'
                                                    }}>
                                                        Current View
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                                Submitted: {parseUTC(sub.submitted_at).toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                                                <span style={{ fontWeight: 500 }}>Status:</span>{' '}
                                                <span style={{
                                                    color: isSubGraded ? '#16a34a' : '#d97706',
                                                    textTransform: 'capitalize'
                                                }}>
                                                    {sub.status?.toLowerCase()}
                                                </span>
                                                {' • '}
                                                <span style={{ fontWeight: 500 }}>Grade:</span>{' '}
                                                {sub.grade !== null && sub.grade !== undefined
                                                    ? `${Number(sub.grade).toFixed(2)}/${(assignment?.points || 100).toFixed(2)}`
                                                    : `-/${(assignment?.points || 100).toFixed(2)}`}
                                            </div>
                                        </div>
                                        {!isCurrent && (
                                            <Link
                                                to={`/student/courses/${courseId}/assignments/${assignmentId}/submissions/${sub.id}`}
                                                className="btn btn-outline"
                                                style={{ borderColor: 'var(--text-primary)', color: 'var(--text-primary)' }}
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
