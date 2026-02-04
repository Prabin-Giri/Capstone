import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { assignments, courses } from '../../lib/mockData';
import './AssignmentDetails.css';

const AssignmentDetails: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const assignment = assignments.find(
        (item) => item.id === assignmentId && item.courseId === courseId
    );
    const selectedCourse = courses.find((course) => course.id === courseId);

    if (!assignment || !selectedCourse) {
        const backLink = courseId ? `/student/courses/${courseId}/assignments` : '/student';
        return (
            <div className="assignment-details">
                <div className="section">
                    <h1 className="details-title">Assignment not found</h1>
                    <p className="description-text">We could not find that assignment.</p>
                    <Link to={backLink} className="btn-primary">
                        Back to Assignments
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="assignment-details">
            <div className="details-header">
                <div>
                    <h1 className="details-title">{assignment.title}</h1>
                    <div className="details-meta">
                        <span>{selectedCourse.name}</span>
                        <span>Due: {assignment.dueDate}</span>
                    </div>
                </div>
                <StatusBadge status={assignment.status} />
            </div>

            <div className="section">
                <h2 className="section-title">Overview</h2>
                <p className="description-text">
                    Assignment details will appear here in the next step of the student flow.
                </p>
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
