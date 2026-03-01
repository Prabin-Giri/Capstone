import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { getCourses, updateCourse, type Course } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { Archive, RotateCcw, AlertTriangle, X } from 'lucide-react';
import './TADashboard.css';

interface ArchiveModalState {
    id: string;
    name: string;
    currentlyArchived: boolean;
}

const TADashboard: React.FC = () => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);
    const [archiveModal, setArchiveModal] = useState<ArchiveModalState | null>(null);
    const [archiveInput, setArchiveInput] = useState('');
    const [actionError, setActionError] = useState<string | null>(null);
    const navigate = useNavigate();

    const loadCourses = async () => {
        setLoading(true);
        try {
            const user = getUser();
            const data = await getCourses({ instructorId: user?.id });
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

    const openArchiveModal = (e: React.MouseEvent, course: Course) => {
        e.stopPropagation();
        setArchiveModal({
            id: course.id,
            name: course.name,
            currentlyArchived: !!course.is_archived
        });
        setArchiveInput('');
        setActionError(null);
    };

    const confirmArchive = async () => {
        if (!archiveModal) return;

        if (archiveInput !== archiveModal.name) {
            setActionError('Course name does not match');
            return;
        }

        try {
            await updateCourse(archiveModal.id, { is_archived: !archiveModal.currentlyArchived });
            await loadCourses();
            setArchiveModal(null);
        } catch (err) {
            console.error('Failed to update course', err);
            setActionError('Failed to update course status');
        }
    };

    if (loading) return <div className="faculty-dashboard-container">Loading...</div>;

    const filteredCourses = courses.filter(course => !!course.is_archived === showArchived);

    return (
        <div className="faculty-dashboard-container">
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
                    <Button onClick={() => navigate('/ta/courses/new')}>
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
                                    <button
                                        className="archive-btn-mini"
                                        onClick={(e) => openArchiveModal(e, course)}
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

            {/* Archive/Unarchive Confirmation Modal */}
            {archiveModal && (
                <div className="archive-modal-overlay">
                    <div className="archive-modal-card">
                        <div className="archive-header">
                            <h2 className="archive-title">
                                {archiveModal.currentlyArchived ? 'Unarchive Course?' : 'Archive Course?'}
                            </h2>
                            <button className="archive-close-btn" onClick={() => setArchiveModal(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="archive-body">
                            <p className="archive-instruction">
                                To confirm, type <span style={{ fontWeight: 800, color: 'var(--primary-color)' }}>{archiveModal.name}</span> below.
                            </p>

                            <div className="archive-input-container">
                                <input
                                    type="text"
                                    value={archiveInput}
                                    onChange={(e) => {
                                        setArchiveInput(e.target.value);
                                        setActionError(null);
                                    }}
                                    placeholder="Type course name"
                                    autoFocus
                                />
                            </div>

                            {actionError && (
                                <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginBottom: '1rem' }}>{actionError}</p>
                            )}

                            {!archiveModal.currentlyArchived && (
                                <div className="archive-warning">
                                    <AlertTriangle size={16} className="text-red-600" />
                                    <p className="archive-warning-text">
                                        Archiving will make this course read-only for all students.
                                    </p>
                                </div>
                            )}

                            <div className="archive-footer">
                                <button
                                    onClick={() => setArchiveModal(null)}
                                    className="archive-btn archive-btn-cancel"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmArchive}
                                    disabled={archiveInput !== archiveModal.name}
                                    className={`archive-btn ${archiveModal.currentlyArchived ? 'archive-btn-unarchive' : 'archive-btn-confirm'}`}
                                >
                                    {archiveModal.currentlyArchived ? 'Unarchive' : 'Archive'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TADashboard;
