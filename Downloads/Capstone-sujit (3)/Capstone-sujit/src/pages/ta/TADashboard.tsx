import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { useNavigate } from 'react-router-dom';
import { getCourses, getAssignments, type Course, type Assignment } from '../../lib/api';
import { getUser } from '../../lib/auth';
import './TADashboard.css';

const TADashboard: React.FC = () => {
    const navigate = useNavigate();
    const user = getUser();

    const [taCourses, setTaCourses] = useState<Course[]>([]);
    const [studentCourses, setStudentCourses] = useState<Course[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);

    const userId = user?.id ?? null;

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const [taCoursesData, studentCoursesData, assignmentsData] = await Promise.all([
                    getCourses({ taId: userId }),
                    getCourses({ studentId: userId }),
                    getAssignments(),
                ]);
                if (cancelled) return;
                setTaCourses(taCoursesData);
                const taCourseIds = new Set(taCoursesData.map((c) => c.id));
                setStudentCourses(studentCoursesData.filter((c) => !taCourseIds.has(c.id)));
                setAssignments(assignmentsData);
            } catch (err) {
                if (!cancelled) console.error('Failed to load TA dashboard data', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [userId]);

    if (loading) {
        return (
            <div className="faculty-dashboard-container" style={{ minHeight: '400px' }}>
                <div className="dashboard-header">
                    <div>
                        <h1 className="dashboard-title">Dashboard</h1>
                        <p className="dashboard-subtitle">Loading...</p>
                    </div>
                </div>
                <section style={{ marginBottom: '32px' }}>
                    <div className="dashboard-grid" style={{ opacity: 0.6 }}>
                        <div className="dashboard-loading-placeholder" style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            Loading your courses...
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    const activeTaCourses = taCourses.filter((course) => !course.is_archived);
    const activeStudentCourses = studentCourses.filter((course) => !course.is_archived);

    const enrolledCourseIds = new Set(studentCourses.map((c) => c.id));
    const myAssignments = assignments.filter((a) => enrolledCourseIds.has(a.course_id));

    return (
        <div className="faculty-dashboard-container">
                <div className="dashboard-header">
                    <div>
                        <h1 className="dashboard-title">Dashboard</h1>
                        <p className="dashboard-subtitle">
                            Your courses and assignments.
                        </p>
                    </div>
                </div>

            {/* TA Courses Section */}
            <section style={{ marginBottom: '32px' }}>
                <h2 className="section-title" style={{ marginBottom: '16px' }}>Courses you TA</h2>
                <div className="dashboard-grid">
                    {activeTaCourses.length === 0 ? (
                        <div className="empty-state" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                            <p>No active TA courses found.</p>
                        </div>
                    ) : (
                        activeTaCourses.map((course) => (
                            <Card
                                key={course.id}
                                className={`cursor-pointer ${course.is_archived ? 'archived-card' : ''}`}
                                onClick={() => navigate(`/ta/courses/${course.id}`)}
                                style={course.is_archived ? { opacity: 0.7, filter: 'grayscale(0.5)' } : {}}
                            >
                                <div className="course-card-header">
                                    <div>
                                        <h3 className="course-id">{course.name}</h3>
                                        <p className="course-term">{course.term}</p>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                        <span className="tag-pill">
                                            {course.id}
                                        </span>
                                    </div>
                                </div>

                                <div className="course-stats">
                                    <div>
                                        <span className="stat-value">{course.student_count || 0}</span>
                                        <span>Students</span>
                                    </div>
                                    <div>
                                        <span className="stat-value">{course.active_assignment_count || 0}</span>
                                        <span>Active Assignments</span>
                                    </div>
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            </section>

            {/* Student Courses Section */}
            <section>
                <h2 className="section-title" style={{ marginBottom: '16px' }}>Courses you are enrolled in</h2>
                <div className="dashboard-grid">
                    {activeStudentCourses.length === 0 ? (
                        <div className="empty-state" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                            <p>No active enrolled courses found.</p>
                        </div>
                    ) : (
                        activeStudentCourses.map((course) => {
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
                                    className="cursor-pointer"
                                    onClick={() => navigate(`/student/courses/${course.id}`)}
                                >
                                    <div className="course-card-header">
                                        <div>
                                            <h3 className="course-id">{course.name}</h3>
                                            <p className="course-term">{course.term}</p>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                            <span className="tag-pill">
                                                {course.id}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="course-stats">
                                        <div>
                                            <span className="stat-value">{activeAssignments.length}</span>
                                            <span>Assignments</span>
                                        </div>
                                        <div>
                                            <span className="stat-value" style={{ color: openAssignments.length > 0 ? 'var(--primary-text)' : 'inherit' }}>
                                                {nextDue}
                                            </span>
                                            <span>Next Due</span>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })
                    )}
                </div>
            </section>
        </div>
    );
};

export default TADashboard;
