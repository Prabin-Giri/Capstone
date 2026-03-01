import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { useNavigate } from 'react-router-dom';
import { getCourses, type Course } from '../../lib/api';
import { getUser } from '../../lib/auth';
import './TADashboard.css';

const TADashboard: React.FC = () => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const loadCourses = async () => {
        setLoading(true);
        try {
            const user = getUser();
            // TAs fetch courses they've been specifically invited to using taId
            const data = await getCourses(user ? { taId: user.id } : {});
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

    if (loading) return <div className="faculty-dashboard-container">Loading...</div>;

    // Filter to only show active courses
    const activeCourses = courses.filter(course => !course.is_archived);

    return (
        <div className="faculty-dashboard-container">
            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-title">Dashboard</h1>
                    <p className="dashboard-subtitle">
                        Overview of your active courses.
                    </p>
                </div>
            </div>

            <div className="dashboard-grid">
                {activeCourses.length === 0 ? (
                    <div className="empty-state" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                        <p>No active courses found.</p>
                    </div>
                ) : (
                    activeCourses.map((course) => (
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

        </div>
    );
};

export default TADashboard;
