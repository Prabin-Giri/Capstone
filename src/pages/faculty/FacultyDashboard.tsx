import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { getCourses, updateCourse, type Course } from '../../lib/api';
import { Archive, RotateCcw } from 'lucide-react';

const FacultyDashboard: React.FC = () => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);
    const navigate = useNavigate();

    const loadCourses = async () => {
        setLoading(true);
        try {
            const data = await getCourses();
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

    const handleArchive = async (e: React.MouseEvent, id: string, currentlyArchived: boolean) => {
        e.stopPropagation();
        const action = currentlyArchived ? 'unarchive' : 'archive';
        if (!confirm(`Are you sure you want to ${action} this course ? `)) return;

        try {
            await updateCourse(id, { is_archived: !currentlyArchived });
            await loadCourses();
        } catch (err) {
            console.error(`Failed to ${action} course`, err);
            alert(`Failed to ${action} course`);
        }
    };

    if (loading) return <div className="dashboard-container">Loading...</div>;

    const filteredCourses = courses.filter(course => !!course.is_archived === showArchived);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-title">Dashboard</h1>
                    <p className="dashboard-subtitle">
                        {showArchived ? 'Your archived courses.' : 'Overview of your active courses.'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <Button
                        variant="secondary"
                        onClick={() => setShowArchived(!showArchived)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        {showArchived ? <RotateCcw size={16} /> : <Archive size={16} />}
                        {showArchived ? 'Show Active' : 'Show Archived'}
                    </Button>
                    <Button onClick={() => navigate('/faculty/courses/new')}>
                        + Create New Course
                    </Button>
                </div>
            </div>

            <div className="dashboard-grid">
                {filteredCourses.length === 0 ? (
                    <div className="empty-state" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                        <p>No {showArchived ? 'archived' : 'active'} courses found.</p>
                    </div>
                ) : (
                    filteredCourses.map((course) => (
                        <Card
                            key={course.id}
                            className={`cursor-pointer ${course.is_archived ? 'archived-card' : ''}`}
                            onClick={() => navigate(`/faculty/courses/${course.id}`)}
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
                                    <button
                                        className="archive-btn-mini"
                                        onClick={(e) => handleArchive(e, course.id, !!course.is_archived)}
                                        title={course.is_archived ? 'Unarchive Course' : 'Archive Course'}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--muted-color)',
                                            cursor: 'pointer',
                                            padding: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '4px',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                    >
                                        {course.is_archived ? <RotateCcw size={14} /> : <Archive size={14} />}
                                    </button>
                                </div>
                            </div>

                            {/* Spacer to push stats to bottom */}
                            <div style={{ flex: 1 }}></div>

                            <div className="course-stats">
                                <div>
                                    <span className="stat-value">0</span>
                                    <span>Students</span>
                                </div>
                                <div>
                                    <span className="stat-value">0</span>
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

export default FacultyDashboard;
