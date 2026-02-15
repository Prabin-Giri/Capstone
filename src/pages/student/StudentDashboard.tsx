import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourses, getAssignments, getColors } from '../../lib/api';
import type { Course, Assignment } from '../../lib/api';
import { Card } from '../../components/ui/Card';
// import './StudentDashboard.css'; // Removed in favor of global components.css

const STUDENT_ID = 'student-001';

const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const StudentDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [courses, setCourses] = useState<Course[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [courseColors, setCourseColors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadData() {
            try {
                const [coursesData, assignmentsData, colorsData] = await Promise.all([
                    getCourses(),
                    getAssignments(),
                    getColors(STUDENT_ID)
                ]);
                setCourses(coursesData);
                setAssignments(assignmentsData);
                setCourseColors(colorsData);
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
            <div className="dashboard-container">
                <div className="dashboard-header">
                    <div>
                        <h1 className="dashboard-title">Dashboard</h1>
                        <p className="dashboard-subtitle">Loading...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard-container">
                <div className="dashboard-header">
                    <div>
                        <h1 className="dashboard-title">Dashboard</h1>
                        <p className="dashboard-subtitle" style={{ color: '#ef4444' }}>{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-title">Dashboard</h1>
                    <p className="dashboard-subtitle">Welcome back, Student.</p>
                </div>
            </div>

            <div className="dashboard-grid">
                {courses.map((course) => {
                    const courseAssignments = assignments.filter(
                        (assignment) => assignment.course_id === course.id
                    );
                    const activeAssignments = courseAssignments
                        .filter((assignment) => assignment.status === 'active')
                        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

                    const nextDue = activeAssignments[0]?.due_date
                        ? new Date(activeAssignments[0].due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'No upcoming due dates';

                    const color = courseColors[course.id];
                    const pillStyle = color ? {
                        backgroundColor: hexToRgba(color, 0.1),
                        color: color,
                        fontWeight: 700
                    } : undefined;

                    return (
                        <Card
                            key={course.id}
                            className="cursor-pointer"
                            onClick={() => navigate(`/student/courses/${course.id}`)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    navigate(`/student/courses/${course.id}`);
                                }
                            }}
                        >
                            <div className="course-card-header">
                                <div>
                                    <h3 className="course-id">{course.name}</h3>
                                    <p className="course-term">{course.term}</p>
                                </div>
                                <span className="tag-pill" style={pillStyle}>{course.id}</span>
                            </div>

                            {/* Spacer to push stats to bottom */}
                            <div style={{ flex: 1 }}></div>

                            <div className="course-stats">
                                <div>
                                    <span className="stat-value">{activeAssignments.length}</span>
                                    <span>active</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span className="stat-value">{nextDue}</span>
                                    <span>Next Assignment Due</span>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

export default StudentDashboard;
