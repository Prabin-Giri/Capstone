import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { getAssignment, getSubmissions, getTestCases } from '../../lib/api';
import { Code, Download, Eye } from 'lucide-react';
import type { Assignment, Submission, TestCase } from '../../lib/api';
import './AssignmentDetails.css';

const STUDENT_ID = 'student-001'; // Mock ID for student view

const AssignmentDetails: React.FC = () => {
    const { assignmentId } = useParams();
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadAssignment() {
            if (!assignmentId) return;
            try {
                const [assignmentData, submissionsData, testCaseData] = await Promise.all([
                    getAssignment(assignmentId),
                    getSubmissions({ assignment_id: assignmentId, student_id: STUDENT_ID }),
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
