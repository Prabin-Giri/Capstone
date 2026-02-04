import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ASSIGNMENT_STATUS } from '../../lib/constants';
import { assignments, classes } from '../../lib/mockData';
import './StudentDashboard.css';

const StudentDashboard: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="student-dashboard">
            <div className="dashboard-header">
                <h1 className="dashboard-title">Dashboard</h1>
                <p className="dashboard-subtitle">Welcome back, Student.</p>
            </div>

            <div className="class-grid">
                {classes.map((cls) => {
                    const classAssignments = assignments.filter((assignment) => assignment.classId === cls.id);
                    const openAssignments = classAssignments.filter(
                        (assignment) => assignment.status === ASSIGNMENT_STATUS.OPEN
                    );
                    const nextDue = openAssignments[0]?.dueDate || 'No upcoming due dates';

                    return (
                        <div
                            key={cls.id}
                            className="class-card"
                            onClick={() => navigate(`/student/classes/${cls.id}`)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    navigate(`/student/classes/${cls.id}`);
                                }
                            }}
                        >
                            <div className="class-header">
                                <h3 className="class-name">{cls.name}</h3>
                                <span className="class-code">{cls.term}</span>
                            </div>

                            <div className="class-stats">
                                <div className="stat-item">
                                    <span className="stat-value">{openAssignments.length}</span>
                                    <span className="stat-label">open</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-value">{nextDue}</span>
                                    <span className="stat-label">Next Assignment Due</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default StudentDashboard;
