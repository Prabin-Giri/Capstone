import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Link } from 'react-router-dom';

// Mock data for faculty courses
const MOCK_FACULTY_COURSES = [
    { id: 'CSCI4060', name: 'Software Engineering', term: 'Spring 2026', students: 42, activeAssignments: 2 },
    { id: 'CSCI2100', name: 'Data Structures', term: 'Spring 2026', students: 128, activeAssignments: 1 },
    { id: 'CSCI1100', name: 'Intro to Computer Science', term: 'Spring 2026', students: 250, activeAssignments: 0 },
];

const FacultyDashboard: React.FC = () => {
    const [courses] = useState(MOCK_FACULTY_COURSES);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-title">Faculty Dashboard</h1>
                    <p className="dashboard-subtitle">Overview of your active courses.</p>
                </div>
                <Button>
                    + Create New Course
                </Button>
            </div>

            <div className="dashboard-grid">
                {courses.map((course) => (
                    <Card key={course.id} className="hover:shadow-md transition-shadow">
                        <div className="course-card-header">
                            <div>
                                <h3 className="course-id">{course.id}</h3>
                                <p className="course-term">{course.term}</p>
                            </div>
                            <span className="status-badge status-info">
                                Active
                            </span>
                        </div>

                        <h4 className="course-name">{course.name}</h4>

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

                        <div className="course-actions">
                            <Link to={`/faculty/courses/${course.id}`} style={{ flex: 1 }}>
                                <Button variant="outline" size="sm" className="w-full">View Course</Button>
                            </Link>
                            <Link to={`/faculty/courses/${course.id}/grading`} style={{ flex: 1 }}>
                                <Button variant="secondary" size="sm" className="w-full">Needs Grading</Button>
                            </Link>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default FacultyDashboard;
