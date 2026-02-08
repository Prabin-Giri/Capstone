import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';

// Mock data for faculty courses
const MOCK_FACULTY_COURSES = [
    { id: 'CSCI4060', name: 'Software Engineering', term: 'Spring 2026', students: 42, activeAssignments: 2 },
    { id: 'CSCI2100', name: 'Data Structures', term: 'Spring 2026', students: 128, activeAssignments: 1 },
    { id: 'CSCI1100', name: 'Intro to Computer Science', term: 'Spring 2026', students: 250, activeAssignments: 0 },
];

const FacultyDashboard: React.FC = () => {
    const [courses] = useState(MOCK_FACULTY_COURSES);
    const navigate = useNavigate();

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-title">Dashboard</h1>
                    <p className="dashboard-subtitle">Overview of your active courses.</p>
                </div>
                <Button onClick={() => navigate('/faculty/courses/new')}>
                    + Create New Course
                </Button>
            </div>

            <div className="dashboard-grid">
                {courses.map((course) => (
                    <Card
                        key={course.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/faculty/courses/${course.id}`)}
                    >
                        <div className="card-header" style={{ paddingBottom: '0.5rem', borderBottom: 'none' }}>
                            <h3 className="card-title">{course.name}</h3>
                            <span className="tag-pill">{course.id}</span>
                        </div>

                        <div className="card-body">
                            {/* Spacer to push stats to bottom if content varies, essentially ensuring height consistency */}
                            <div style={{ flex: 1 }}></div>

                            <div className="course-stats" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                                <div>
                                    <span className="stat-value" style={{ fontSize: '1.25rem' }}>{course.students}</span>
                                    <span className="stat-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Students</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span className="stat-value" style={{ fontSize: '1.25rem' }}>{course.activeAssignments}</span>
                                    <span className="stat-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active Assignments</span>
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default FacultyDashboard;
