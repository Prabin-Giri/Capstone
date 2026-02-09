import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ASSIGNMENT_STATUS } from '../../lib/constants';
import { assignments, courses } from '../../lib/mockData';
import './ClassOverview.css';

const ClassOverview: React.FC = () => {
    const { courseId } = useParams();
    const selectedCourse = courses.find((course) => course.id === courseId);

    if (!selectedCourse) {
        return (
            <div className="class-overview">
                <div className="state-card">
                    <h1 className="overview-title">Course not found</h1>
                    <p className="overview-subtitle">We could not find that course.</p>
                    <Link to="/student" className="btn-primary">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const courseAssignments = assignments.filter(
        (assignment) => assignment.courseId === selectedCourse.id
    );
    const activeAssignments = courseAssignments.filter(
        (assignment) => assignment.status === ASSIGNMENT_STATUS.ACTIVE
    );

    return (
        <div className="class-overview">
            <div className="overview-header">
                <div>
                    <h1 className="overview-title">{selectedCourse.name}</h1>
                    <p className="overview-subtitle">
                        {selectedCourse.id} &bull; {selectedCourse.term}
                    </p>
                </div>
                <Link to={`/student/courses/${selectedCourse.id}/assignments`} className="btn-primary">
                    View Assignments
                </Link>
            </div>

            <div className="overview-card">
                <div className="overview-stat">
                    <span className="stat-value">{courseAssignments.length}</span>
                    <span className="stat-label">Assignments</span>
                </div>
                <div className="overview-stat">
                    <span className="stat-value">{activeAssignments.length}</span>
                    <span className="stat-label">Active</span>
                </div>
            </div>
        </div>
    );
};

export default ClassOverview;
