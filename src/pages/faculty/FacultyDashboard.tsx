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
                    <p className="dashboard-subtitle">Welcome back, Faculty.</p>
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
                        <div className="course-card-header">
                            <div>
                                <h3 className="course-id">{course.name}</h3>
                                <p className="course-term">{course.term}</p>
                            </div>
                            <span className="tag-pill">
                                {course.id}
                            </span>
                        </div>

                        <div className="course-stats">
                            <div>
                                <span className="stat-value">{course.students}</span>
                                <span>Students</span>
                            </div>
                            <div>
                                <span className="stat-value">{course.activeAssignments}</span>
                                <span>Active Assignments</span>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default FacultyDashboard;
