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
                    <Card key={course.id} className="cursor-pointer">
                        <div className="card-header" style={{ paddingBottom: '0.5rem', borderBottom: 'none' }}>
                            <h3 className="card-title">{course.name}</h3>
                            <span className="tag-pill">{course.id}</span>
                        </div>

                        <div className="card-body">
                            <p className="text-sm text-gray-500 mb-4" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                {course.term} • <span className="text-green-600" style={{ color: 'var(--primary-color)' }}>Active</span>
                            </p>

                            <div className="course-stats" style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                                <div>
                                    <span className="stat-value">{course.students}</span>
                                    <span className="stat-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Students</span>
                                </div>
                                <div>
                                    <span className="stat-value">{course.activeAssignments}</span>
                                    <span className="stat-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active Assignments</span>
                                </div>
                            </div>

                            <div className="course-actions" style={{ marginTop: '1rem' }}>
                                <Link to={`/faculty/courses/${course.id}`} style={{ flex: 1 }}>
                                    <Button variant="outline" size="sm" className="w-full">View</Button>
                                </Link>
                                <Link to={`/faculty/courses/${course.id}/grading`} style={{ flex: 1 }}>
                                    <Button variant="secondary" size="sm" className="w-full">Grade</Button>
                                </Link>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default FacultyDashboard;
