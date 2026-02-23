import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourses, getAssignments } from '../../lib/api';
import type { Course, Assignment } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { getUser } from '../../lib/auth';

const StudentDashboard: React.FC = () => {
    const navigate = useNavigate();
    const user = getUser();
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
                    <h1 className="dashboard-title">Student Command Center</h1>
                    <p className="dashboard-subtitle">Welcome back, {user?.name || 'Student'}. Here is your semester at a glance.</p>
                </div>
                <div className="dashboard-actions">
                    <Button variant="outline" size="sm" onClick={() => navigate('/calendar')}>
                        View Calendar
                    </Button>
                </div>
            </div>

            {/* Analytics Summary Bar */}
            <div className="analytics-bar">
                <div className="analytics-card glass">
                    <span className="analytics-label">Active Courses</span>
                    <span className="analytics-value">{courses.length}</span>
                    <span className="analytics-desc">Spring 2026 Semester</span>
                </div>
                <div className="analytics-card glass">
                    <span className="analytics-label">Pending Assignments</span>
                    <span className="analytics-value">
                        {assignments.filter(a => a.status === 'active').length}
                    </span>
                    <span className="analytics-desc">Across all courses</span>
                </div>
                <div className="analytics-card glass">
                    <span className="analytics-label">Next Deadline</span>
                    <span className="analytics-value" style={{ color: 'var(--primary-color)' }}>
                        {assignments
                            .filter(a => a.status === 'active' && new Date(a.due_date) >= new Date())
                            .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0]?.due_date
                            ? new Date(assignments.filter(a => a.status === 'active' && new Date(a.due_date) >= new Date()).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0].due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : 'None'
                        }
                    </span>
                    <span className="analytics-desc">Time to focus!</span>
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

                    const openAssignments = activeAssignments.filter(a => new Date(a.due_date) >= new Date());

                    const nextDue = openAssignments[0]?.due_date
                        ? new Date(openAssignments[0].due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : 'None';

                    return (
                        <Card
                            key={course.id}
                            className="course-card-premium cursor-pointer"
                            onClick={() => navigate(`/student/courses/${course.id}`)}
                        >
                            <div className="course-card-header">
                                <div className="course-id-display">{course.id}</div>
                                <h3 className="course-title-display">{course.name}</h3>
                                <p className="course-term" style={{ marginTop: '4px' }}>{course.term}</p>
                            </div>

                            <div className="course-stats-display">
                                <div className="stat-item">
                                    <span className="stat-label">Active</span>
                                    <span className="stat-v">{activeAssignments.length} Assignments</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-label">Next Due</span>
                                    <span className="stat-v" style={{ color: openAssignments.length > 0 ? 'var(--primary-color)' : 'inherit' }}>
                                        {nextDue}
                                    </span>
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
