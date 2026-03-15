import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { useNavigate } from 'react-router-dom';
import { getCourses, type Course } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { GraduationCap, User } from 'lucide-react';
import './TADashboard.css';

type ViewMode = 'student' | 'ta';

const TADashboard: React.FC = () => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('ta');
    const navigate = useNavigate();

    const loadCourses = async () => {
        setLoading(true);
        try {
            const user = getUser();
            const data = await getCourses(user ? { taId: user.id, studentId: user.id } : {});
            setCourses(data);
        } catch (err) {
            console.error('Failed to load courses', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCourses();
    }, []);

    const activeCourses = courses.filter(c => !c.is_archived);
    const taCourses = activeCourses.filter(c => c.my_role === 'ta' || c.my_role === 'both');
    const studentCourses = activeCourses.filter(c => c.my_role === 'student');
    const hasStudent = studentCourses.length > 0;
    const hasTA = taCourses.length > 0;

    const goToCourse = (course: Course, asStudent: boolean) => {
        navigate(asStudent ? `/student/courses/${course.id}` : `/ta/courses/${course.id}`);
    };

    const currentList = viewMode === 'student' ? studentCourses : taCourses;

    const renderCourseCard = (course: Course, asStudent: boolean) => (
        <Card
            key={course.id}
            className="ta-hub-course-card cursor-pointer"
            onClick={() => goToCourse(course, asStudent)}
        >
            <div className="course-card-header">
                <div>
                    <h3 className="course-id">{course.name}</h3>
                    <p className="course-term">{course.term}</p>
                </div>
                <span className="tag-pill">{course.id}</span>
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
    );

    if (loading) {
        return (
            <div className="ta-hub ta-hub-loading">
                <div className="ta-hub-spinner" />
                <p>Loading your courses…</p>
            </div>
        );
    }

    return (
        <div className="ta-hub">
            <header className="ta-hub-header">
                <h1 className="ta-hub-title">TA Hub</h1>
            </header>

            <div className="ta-hub-options">
                <button
                    type="button"
                    className={`ta-hub-option ${viewMode === 'student' ? 'ta-hub-option-active' : ''} ${!hasStudent ? 'ta-hub-option-disabled' : ''}`}
                    onClick={() => hasStudent && setViewMode('student')}
                    disabled={!hasStudent}
                >
                    <span className="ta-hub-option-icon ta-hub-option-icon-student">
                        <User size={28} />
                    </span>
                    <span className="ta-hub-option-label">Student</span>
                    <span className="ta-hub-option-desc">My enrolled courses</span>
                    {hasStudent && (
                        <span className="ta-hub-option-count">{studentCourses.length}</span>
                    )}
                    {!hasStudent && (
                        <span className="ta-hub-option-empty">No enrollments</span>
                    )}
                </button>

                <button
                    type="button"
                    className={`ta-hub-option ${viewMode === 'ta' ? 'ta-hub-option-active' : ''} ${!hasTA ? 'ta-hub-option-disabled' : ''}`}
                    onClick={() => hasTA && setViewMode('ta')}
                    disabled={!hasTA}
                >
                    <span className="ta-hub-option-icon ta-hub-option-icon-ta">
                        <GraduationCap size={28} />
                    </span>
                    <span className="ta-hub-option-label">Teaching Assistant</span>
                    <span className="ta-hub-option-desc">Courses I assist</span>
                    {hasTA && (
                        <span className="ta-hub-option-count">{taCourses.length}</span>
                    )}
                    {!hasTA && (
                        <span className="ta-hub-option-empty">No TA assignments</span>
                    )}
                </button>
            </div>

            <section className="ta-hub-courses">
                <h2 className="ta-hub-section-title">
                    {viewMode === 'student' ? 'My courses (Student)' : 'Courses I assist (TA)'}
                </h2>
                {currentList.length > 0 ? (
                    <div className="dashboard-grid ta-hub-grid">
                        {currentList.map(c => renderCourseCard(c, viewMode === 'student'))}
                    </div>
                ) : (
                    <div className="ta-hub-empty">
                        <p>
                            {viewMode === 'student'
                                ? 'You are not enrolled in any courses as a student.'
                                : 'You are not assigned as TA to any courses.'}
                        </p>
                        <p className="ta-hub-empty-hint">
                            {viewMode === 'student'
                                ? 'Enroll in a course to see it here.'
                                : 'Ask an instructor to add you as a TA.'}
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
};

export default TADashboard;
