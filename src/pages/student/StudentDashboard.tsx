import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourses, getAssignments } from '../../lib/api';
import type { Course, Assignment } from '../../lib/api';
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
            if (!user?.id) return;
            try {
                const [coursesData, assignmentsData] = await Promise.all([
                    getCourses({ studentId: user.id, taId: user.id }),
                    getAssignments()
                ]);

                // Split courses that have 'both' role into two separate entries for the UI
                const displayCourses: (Course & { displayRole: 'student' | 'ta' })[] = [];
                coursesData.forEach(c => {
                    const role = c.my_role || 'student';
                    if (role === 'both') {
                        displayCourses.push({ ...c, displayRole: 'student' });
                        displayCourses.push({ ...c, displayRole: 'ta' });
                    } else {
                        displayCourses.push({ ...c, displayRole: role as 'student' | 'ta' });
                    }
                });

                setCourses(coursesData);
                // We'll store the split courses in a separate state or just use a derived variable
                // For simplicity, let's keep the original courses state and derive displayCourses
                setAssignments(assignmentsData);
            } catch (err) {
                setError('Failed to load data. Make sure the backend server is running.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [user?.id]);

    // Derived display list
    const displayCourses: (Course & { displayRole: 'student' | 'ta' })[] = [];
    courses.forEach(c => {
        const role = c.my_role || 'student';
        if (role === 'both') {
            displayCourses.push({ ...c, displayRole: 'student' });
            displayCourses.push({ ...c, displayRole: 'ta' });
        } else {
            displayCourses.push({ ...c, displayRole: role as 'student' | 'ta' });
        }
    });

    const studentCourses = displayCourses.filter(c => c.displayRole === 'student');
    const taCourses = displayCourses.filter(c => c.displayRole === 'ta');

    // Only show assignments from courses the student is enrolled in
    const enrolledCourseIds = new Set(courses.filter(c => c.my_role === 'student' || c.my_role === 'both').map((c) => c.id));
    const myAssignments = assignments.filter((a) => enrolledCourseIds.has(a.course_id));

    if (loading) {
        return (
            <div className="dashboard-container">
                <p className="dashboard-subtitle" style={{ margin: 0 }}>Loading...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard-container">
                <p className="dashboard-subtitle" style={{ color: '#ef4444', margin: 0 }}>{error}</p>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <div className="dashboard-calendar-row">
                <Button variant="outline" size="sm" onClick={() => navigate('/calendar')}>
                    View Calendar
                </Button>
            </div>

            {/* Analytics Summary Bar */}
            <div className="analytics-bar">
                <div className="analytics-card glass analytics-card-outlined">
                    <span className="analytics-label">Active Courses</span>
                    <span className="analytics-value">{courses.length}</span>
                    <span className="analytics-desc">Spring 2026 Semester</span>
                </div>
                <div className="analytics-card glass analytics-card-outlined">
                    <span className="analytics-label">Pending Assignments</span>
                    <span className="analytics-value">
                        {myAssignments.filter(a => a.status === 'active' && new Date(a.due_date) >= new Date()).length}
                    </span>
                    <span className="analytics-desc">Across your courses</span>
                </div>
                <div className="analytics-card glass analytics-card-outlined">
                    <span className="analytics-label">Next Deadline</span>
                    <span className="analytics-value">
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

            {studentCourses.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.75rem' }}>
                        Courses you’re taking
                    </h2>
                    <div className="dashboard-grid">
                        {studentCourses.map((course) => {
                    const isTA = course.displayRole === 'ta';
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
                        <div
                            key={`${course.id}-${course.displayRole}`}
                            className={`course-card-premium cursor-pointer ${isTA ? 'ta-card' : ''}`}
                            onClick={() => navigate(isTA ? `/ta/courses/${course.id}` : `/student/courses/${course.id}`)}
                        >
                            <div className="course-card-header">
                                <div>
                                    <h3 className="course-title-display">{course.name}</h3>
                                    <p className="course-term">{course.term}</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                    <div className="course-id-tag" style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                                        <span className="tag-pill">{course.id}</span>
                                        {isTA && (
                                            <span className="role-badge ta">
                                                TA
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="course-stats-display">
                                {!isTA ? (
                                    <>
                                        <div className="stat-item">
                                            <span className="stat-v">{activeAssignments.length}</span>
                                            <span className="stat-label">Assignments</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-v">{nextDue}</span>
                                            <span className="stat-label">Next Due</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="stat-item">
                                        <span className="stat-v">{course.active_assignment_count || 0}</span>
                                        <span className="stat-label">Active Assignments</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                        })}
                    </div>
                </div>
            )}

            {taCourses.length > 0 && (
                <div style={{ marginTop: '1.75rem' }}>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.75rem' }}>
                        Courses you assist as TA
                    </h2>
                    <div className="dashboard-grid">
                        {taCourses.map((course) => {
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
                                <div
                                    key={`${course.id}-${course.displayRole}`}
                                    className="course-card-premium cursor-pointer ta-card"
                                    onClick={() => navigate(`/ta/courses/${course.id}`)}
                                >
                                    <div className="course-card-header">
                                        <div>
                                            <h3 className="course-title-display">{course.name}</h3>
                                            <p className="course-term">{course.term}</p>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                            <div className="course-id-tag" style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                                                <span className="tag-pill">{course.id}</span>
                                                <span className="role-badge ta">TA</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="course-stats-display">
                                        <div className="stat-item">
                                            <span className="stat-v">{course.active_assignment_count || 0}</span>
                                            <span className="stat-label">Active Assignments</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-v">{nextDue}</span>
                                            <span className="stat-label">Next Due</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentDashboard;
