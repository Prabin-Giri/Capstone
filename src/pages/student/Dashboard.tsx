import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClassCard } from '../../components/ClassCard';
import './Dashboard.css';

// Mock Data
const MOCK_CLASSES = [
    {
        id: 'cs101',
        name: 'Introduction to Computer Science',
        code: 'CS 101',
        term: 'Fall 2025',
        activeAssignments: 2,
        nextDeadline: 'Oct 12',
    },
    {
        id: 'cs201',
        name: 'Data Structures & Algorithms',
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

const Dashboard: React.FC = () => {
    const navigate = useNavigate();

    const handleClassClick = (id: string) => {
        navigate(`/student/classes/${id}`);
    };

    return (
        <div className="dashboard-container">
            <div>
                <h1 className="dashboard-title">Student Dashboard</h1>
                <p className="dashboard-subtitle">Welcome back, Student.</p>
            </div>

            <div className="dashboard-grid">
                {MOCK_CLASSES.map((cls) => (
                    <ClassCard
                        key={cls.id}
                        {...cls}
                        onClick={handleClassClick}
                    />
                ))}
            </div>
        </div>
    );
};

export default Dashboard;
