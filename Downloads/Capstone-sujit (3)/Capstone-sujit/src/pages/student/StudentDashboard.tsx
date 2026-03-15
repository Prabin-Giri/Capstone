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

    const userId = user?.id ?? null;

    useEffect(() => {
        if (userId == null) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const [coursesData, assignmentsData] = await Promise.all([
                    getCourses({ studentId: userId }),
                    getAssignments()
                ]);
                if (cancelled) return;
                setCourses(coursesData);
                setAssignments(assignmentsData);
            } catch (err) {
                if (!cancelled) {
                    setError('Failed to load data. Make sure the backend server is running.');
                    console.error(err);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [userId]);

    const enrolledCourseIds = new Set(courses.map((c) => c.id));
    const myAssignments = assignments.filter((a) => enrolledCourseIds.has(a.course_id));

    if (loading) {
        return (
            <div className="dashboard-container" style={{ minHeight: '480px' }}>
                <div className="dashboard-header">
                    <div>
                        <h1 className="dashboard-title">Dashboard</h1>
                        <p className="dashboard-subtitle">Loading...</p>
                    </div>
                </div>
                <div className="analytics-bar" style={{ opacity: 0.7 }} aria-hidden>
                    <div className="analytics-card glass"><span className="analytics-label">—</span><span className="analytics-value">—</span><span className="analytics-desc">—</span></div>
                    <div className="analytics-card glass"><span className="analytics-label">—</span><span className="analytics-value">—</span><span className="analytics-desc">—</span></div>
                    <div className="analytics-card glass"><span className="analytics-label">—</span><span className="analytics-value">—</span><span className="analytics-desc">—</span></div>
                </div>
                <div className="dashboard-grid" style={{ opacity: 0.5 }}>Loading courses...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard-container" style={{ minHeight: '320px' }}>
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
                    <p className="dashboard-subtitle">Your courses and assignments.</p>
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
                        {myAssignments.filter(a => a.status === 'active' && new Date(a.due_date) >= new Date()).length}
                    </span>
                    <span className="analytics-desc">Across your courses</span>
                </div>
                <div className="analytics-card glass">
                    <span className="analytics-label">Next Deadline</span>
                    <span className="analytics-value" style={{ color: 'var(--primary-text)' }}>
                        {(() => {
                            const upcoming = myAssignments
                                .filter(a => a.status === 'active' && new Date(a.due_date) >= new Date())
                                .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
                            return upcoming[0]?.due_date
                                ? new Date(upcoming[0].due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                : 'None';
                        })()}
                    </span>
                    <span className="analytics-desc">Time to focus!</span>
                </div>
            </div>

            <div className="dashboard-grid">
                {courses.map((course) => {
                    const courseAssignments = myAssignments.filter(
                        (assignment) => assignment.course_id === course.id
                    );
                    const activeAssignments = courseAssignments
                        .filter((assignment) => {
                            const isOpen = new Date(assignment.due_date) >= new Date();
                            return assignment.status === 'active' && isOpen;
                        })
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
                                <div>
                                    <h3 className="course-title-display">{course.name}</h3>
                                    <p className="course-term">{course.term}</p>
                                </div>
                                <div className="course-id-tag">
                                    <span className="tag-pill">{course.id}</span>
                                </div>
                            </div>

                            <div className="course-stats-display">
                                <div className="stat-item">
                                    <span className="stat-v">{activeAssignments.length}</span>
                                    <span className="stat-label">Assignments</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-v" style={{ color: openAssignments.length > 0 ? 'var(--primary-text)' : 'inherit' }}>
                                        {nextDue}
                                    </span>
                                    <span className="stat-label">Next Due</span>
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
