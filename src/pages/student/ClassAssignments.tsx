import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { assignments, courses } from '../../lib/mockData';
import './ClassAssignments.css';

const ClassAssignments: React.FC = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoading(false), 300);
        return () => clearTimeout(timer);
    }, []);

    const selectedCourse = courses.find((course) => course.id === courseId);

    if (!selectedCourse) {
        return (
            <div className="class-assignments">
                <div className="state-card">
                    <h1 className="assignments-title">Course not found</h1>
                    <p className="assignments-subtitle">We could not find that course.</p>
                    <Link to="/student" className="link-primary">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const courseAssignments = assignments.filter(
        (assignment) => assignment.courseId === selectedCourse.id
    );

    const header = (
        <div className="assignments-header">
            <div>
                <h1 className="assignments-title">Assignments</h1>
                <p className="assignments-subtitle">
                    {selectedCourse.name} &bull; {selectedCourse.term}
                </p>
            </div>
            <Link to={`/student/courses/${selectedCourse.id}`} className="link-primary">
                Course Home
            </Link>
        </div>
    );

    if (isLoading) {
        return (
            <div className="class-assignments">
                {header}
                <div className="state-card">Loading assignments...</div>
            </div>
        );
    }

    if (courseAssignments.length === 0) {
        return (
            <div className="class-assignments">
                {header}
                <div className="state-card">No assignments yet.</div>
            </div>
        );
    }

    return (
        <div className="class-assignments">
            {header}
            <div className="table-wrapper">
                <table className="assignments-table">
                    <thead>
                        <tr>
                            <th>Assignment name</th>
                            <th>Due date</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {courseAssignments.map((assignment) => (
                            <tr
                                key={assignment.id}
                                className="assignment-row"
                                onClick={() =>
                                    navigate(
                                        `/student/courses/${selectedCourse.id}/assignments/${assignment.id}`
                                    )
                                }
                                role="button"
                                tabIndex={0}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        navigate(
                                            `/student/courses/${selectedCourse.id}/assignments/${assignment.id}`
                                        );
                                    }
                                }}
                            >
                                <td className="assignment-name">{assignment.title}</td>
                                <td>{assignment.dueDate}</td>
                                <td>
                                    <span className={`status-pill status-${assignment.status}`}>
                                        {assignment.status}
                                    </span>
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className="view-button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            navigate(
                                                `/student/courses/${selectedCourse.id}/assignments/${assignment.id}`
                                            );
                                        }}
                                    >
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ClassAssignments;
