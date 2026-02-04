import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { assignments, classes } from '../../lib/mockData';
import './ClassAssignments.css';

const ClassAssignments: React.FC = () => {
    const { classId } = useParams();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoading(false), 300);
        return () => clearTimeout(timer);
    }, []);

    const selectedClass = classes.find((cls) => cls.id === classId);

    if (!selectedClass) {
        return (
            <div className="class-assignments">
                <div className="state-card">
                    <h1 className="assignments-title">Class not found</h1>
                    <p className="assignments-subtitle">We could not find that class.</p>
                    <Link to="/student" className="link-primary">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const classAssignments = assignments.filter((assignment) => assignment.classId === selectedClass.id);

    const header = (
        <div className="assignments-header">
            <div>
                <h1 className="assignments-title">Assignments</h1>
                <p className="assignments-subtitle">
                    {selectedClass.name} &bull; {selectedClass.term}
                </p>
            </div>
            <Link to={`/student/classes/${selectedClass.id}`} className="link-primary">
                Class Overview
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

    if (classAssignments.length === 0) {
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
                        {classAssignments.map((assignment) => (
                            <tr
                                key={assignment.id}
                                className="assignment-row"
                                onClick={() =>
                                    navigate(
                                        `/student/classes/${selectedClass.id}/assignments/${assignment.id}`
                                    )
                                }
                                role="button"
                                tabIndex={0}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        navigate(
                                            `/student/classes/${selectedClass.id}/assignments/${assignment.id}`
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
                                                `/student/classes/${selectedClass.id}/assignments/${assignment.id}`
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
