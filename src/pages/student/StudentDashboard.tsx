import React from 'react';
import { useNavigate } from 'react-router-dom';
import './StudentDashboard.css';

// Mock Data (Static)
const MOCK_CLASSES = [
    {
        id: 'cs101',
        name: 'Intro to Computer Science',
        code: 'CS 101',
        term: 'Fall 2025',
        activeAssignments: 2,
        nextDeadline: 'Oct 12',
    },
    {
        id: 'cs201',
        name: 'Data Structures',
        code: 'CS 201',
        term: 'Fall 2025',
        activeAssignments: 1,
        nextDeadline: 'Oct 15',
    },
    {
        id: 'se300',
        name: 'Software Engineering',
        code: 'SE 300',
        term: 'Fall 2025',
        activeAssignments: 0,
        nextDeadline: '-',
    },
];

const StudentDashboard: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="student-dashboard">
            <div className="dashboard-header">
                <h1 className="dashboard-title">Student Dashboard</h1>
                <p className="dashboard-subtitle">Welcome back, Student.</p>
            </div>

            <div className="class-grid">
                {MOCK_CLASSES.map((cls) => (
                    <div
                        key={cls.id}
                        className="class-card"
                        onClick={() => navigate(`/student/classes/${cls.id}/assignments/a1`)} // Mock linking to assignment a1
                    >
                        <div className="class-header">
                            <h3 className="class-name">{cls.name}</h3>
                            <span className="class-code">{cls.code}</span>
                        </div>
                        <p className="class-term">{cls.term}</p>

                        <div className="class-stats">
                            <div className="stat-item">
                                <span className="stat-value">{cls.activeAssignments}</span>
                                <span className="stat-label">Active</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{cls.nextDeadline}</span>
                                <span className="stat-label">Next Due</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StudentDashboard;
