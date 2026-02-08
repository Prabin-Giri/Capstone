import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ASSIGNMENT_STATUS } from '../../lib/constants';
import './AssignmentDetails.css';

// Mock Data
const MOCK_ASSIGNMENT = {
    id: 'a1',
    title: 'Binary Search Implementation',
    status: ASSIGNMENT_STATUS.OPEN,
    dueDate: 'Oct 12, 11:59 PM',
    points: 100,
    description: 'Implement the binary search algorithm in Python. Your function should take a sorted list and a target value, returning the index of the target or -1 if not found.',
    rubric: [
        { criteria: 'Correctness (Public Tests)', points: 40 },
        { criteria: 'Edge Cases', points: 20 },
        { criteria: 'Time Complexity O(log n)', points: 20 },
        { criteria: 'Code Style', points: 20 },
    ]
};

const AssignmentDetails: React.FC = () => {
    // const { assignmentId } = useParams();

    // In a real app, use assignmentId to fetch data
    const data = MOCK_ASSIGNMENT;

    return (
        <div className="assignment-details">
            <div className="details-header">
                <div>
                    <h1 className="details-title">{data.title}</h1>
                    <div className="details-meta">
                        <span>Due: {data.dueDate}</span>
                        <span>{data.points} Points</span>
                    </div>
                </div>
                <StatusBadge status={data.status} />
            </div>

            <div className="section">
                <h2 className="section-title">Instructions</h2>
                <p className="description-text">{data.description}</p>
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
                        {data.rubric.map((item, index) => (
                            <tr key={index}>
                                <td>{item.criteria}</td>
                                <td style={{ textAlign: 'right' }}>{item.points}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="action-bar">
                <Link to="submit" className="btn-primary">
                    Submit Assignment
                </Link>
            </div>
        </div>
    );
};

export default AssignmentDetails;
