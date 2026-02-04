import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ASSIGNMENT_STATUS } from '../../lib/constants';
import { assignments, classes } from '../../lib/mockData';
import './ClassOverview.css';

const ClassOverview: React.FC = () => {
    const { classId } = useParams();
    const selectedClass = classes.find((cls) => cls.id === classId);

    if (!selectedClass) {
        return (
            <div className="class-overview">
                <div className="state-card">
                    <h1 className="overview-title">Class not found</h1>
                    <p className="overview-subtitle">We could not find that class.</p>
                    <Link to="/student" className="btn-primary">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const classAssignments = assignments.filter((assignment) => assignment.classId === selectedClass.id);
    const openAssignments = classAssignments.filter(
        (assignment) => assignment.status === ASSIGNMENT_STATUS.OPEN
    );

    return (
        <div className="class-overview">
            <div className="overview-header">
                <div>
                    <h1 className="overview-title">{selectedClass.name}</h1>
                    <p className="overview-subtitle">{selectedClass.term}</p>
                </div>
                <Link to={`/student/classes/${selectedClass.id}/assignments`} className="btn-primary">
                    View Assignments
                </Link>
            </div>

            <div className="overview-card">
                <div className="overview-stat">
                    <span className="stat-value">{classAssignments.length}</span>
                    <span className="stat-label">Assignments</span>
                </div>
                <div className="overview-stat">
                    <span className="stat-value">{openAssignments.length}</span>
                    <span className="stat-label">Open</span>
                </div>
            </div>
        </div>
    );
};

export default ClassOverview;
