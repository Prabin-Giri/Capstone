import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourses, getAssignments } from '../../lib/api';
import type { Course, Assignment } from '../../lib/api';
import './StudentDashboard.css';

const StudentDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [courses, setCourses] = useState<Course[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadData() {
            try {
                const [coursesData, assignmentsData] = await Promise.all([
                    getCourses(),
                    getAssignments()
                ]);
                setCourses(coursesData);
                setAssignments(assignmentsData);
            } catch (err) {
                setError('Failed to load data. Make sure the backend server is running.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="student-dashboard">
                <div className="dashboard-header">
                    <h1 className="dashboard-title">Dashboard</h1>
                    <p className="dashboard-subtitle">Loading...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="student-dashboard">
                <div className="dashboard-header">
                    <h1 className="dashboard-title">Dashboard</h1>
                    <p className="dashboard-subtitle" style={{ color: '#ef4444' }}>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="student-dashboard">
            <div className="dashboard-header">
                <h1 className="dashboard-title">Dashboard</h1>
                <p className="dashboard-subtitle">Welcome back, Student.</p>
            </div>

            <div className="class-grid">
                {courses.map((course) => {
                    const courseAssignments = assignments.filter(
                        (assignment) => assignment.course_id === course.id
                    );
                    const openAssignments = courseAssignments.filter(
                        (assignment) => assignment.status === 'open'
                    );
                    const nextDue = openAssignments[0]?.due_date
                        ? new Date(openAssignments[0].due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'No upcoming due dates';

                    return (
                        <div
                            key={course.id}
                            className="class-card"
                            onClick={() => navigate(`/student/courses/${course.id}`)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    navigate(`/student/courses/${course.id}`);
                                }
                            }}
                        >
                            <div className="class-header">
                                <h3 className="class-name">{course.name}</h3>
                                <span className="class-code">{course.id}</span>
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
