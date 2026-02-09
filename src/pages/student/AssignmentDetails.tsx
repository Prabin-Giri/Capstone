import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { getAssignment } from '../../lib/api';
import type { Assignment } from '../../lib/api';
import './AssignmentDetails.css';

const AssignmentDetails: React.FC = () => {
    const { assignmentId } = useParams();
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadAssignment() {
            if (!assignmentId) return;
            try {
                const data = await getAssignment(assignmentId);
                setAssignment(data);
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

    // Mock points and rubric since they aren't in the API yet
    const points = 100;
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
                    <div className="details-meta">
                        <span>Due: {displayDate}</span>
                        <span>{points} Points</span>
                    </div>
                </div>
                <StatusBadge status={assignment.status} />
            </div>

            <div className="section">
                <h2 className="section-title">Instructions</h2>
                <p className="description-text">{description}</p>
            </div>

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
                <Link to={`/student/courses/${assignment.course_id}/assignments/${assignment.id}/submit`} className="btn-primary">
                    Submit Assignment
                </Link>
            </div>
        </div>
    );
};

export default AssignmentDetails;
