import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { getCourses, updateCourse, type Course } from '../../lib/api';
import { Archive, RotateCcw, AlertCircle, X } from 'lucide-react';
import './FacultyDashboard.css';

interface ArchiveModalState {
    id: string;
    name: string;
    currentlyArchived: boolean;
}

const FacultyDashboard: React.FC = () => {
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

        if (archiveInput !== archiveModal.id) {
            setActionError('Course code does not match');
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
                            className={`course-card-premium cursor-pointer ${course.is_archived ? 'archived-card' : ''}`}
                            onClick={() => navigate(`/faculty/courses/${course.id}`)}
                            style={course.is_archived ? { opacity: 0.7, filter: 'grayscale(0.5)' } : {}}
                        >
                            <div className="course-card-header">
                                <div className="course-id-display">{course.id}</div>
                                <div className="flex justify-between items-center">
                                    <h3 className="course-title-display" style={{ margin: 0 }}>{course.name}</h3>
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
                                            transition: 'all 0.2s',
                                            marginLeft: '8px'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                    >
                                        {course.is_archived ? <RotateCcw size={14} /> : <Archive size={14} />}
                                    </button>
                                </div>
                                <p className="course-term" style={{ marginTop: '2px' }}>{course.term}</p>
                            </div>

                            <div className="course-stats-display">
                                <div className="stat-item">
                                    <span className="stat-label">Students</span>
                                    <span className="stat-v">0</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-label">Active Assignments</span>
                                    <span className="stat-v">0</span>
                                </div>
                            </div>


                        </Card>
                    ))
                )}
            </div>

            {/* Archive/Unarchive Confirmation Modal */}
            {archiveModal && (
                <div className="archive-modal-overlay" onClick={() => setArchiveModal(null)}>
                    <div className="archive-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="archive-header">
                            <div className="archive-title-container">
                                <h2>{archiveModal.currentlyArchived ? 'Unarchive Course' : 'Archive Course'}</h2>
                            </div>
                            <button className="archive-close-btn" onClick={() => setArchiveModal(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="archive-body">
                            <p className="archive-instruction">
                                To confirm, please type <strong>{archiveModal.id}</strong> below.
                            </p>

                            <div className="archive-input-container">
                                <input
                                    type="text"
                                    value={archiveInput}
                                    onChange={(e) => {
                                        setArchiveInput(e.target.value);
                                        setActionError(null);
                                    }}
                                    placeholder={`Type course code (e.g., ${archiveModal.id})`}
                                    autoFocus
                                />
                            </div>

                            {actionError && (
                                <div className="archive-warning" style={{ background: '#fef2f2', borderColor: '#fee2e2' }}>
                                    <AlertCircle size={16} color="#b91c1c" />
                                    <span className="archive-warning-text">{actionError}</span>
                                </div>
                            )}

                            {!archiveModal.currentlyArchived && (
                                <div className="archive-warning">
                                    <AlertCircle size={16} color="#b91c1c" />
                                    <span className="archive-warning-text">
                                        Archiving will make this course read-only for all students.
                                    </span>
                                </div>
                            )}

                            <div className="archive-footer">
                                <button
                                    className="archive-btn archive-btn-cancel"
                                    onClick={() => setArchiveModal(null)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={`archive-btn archive-btn-confirm ${archiveModal.currentlyArchived ? 'archive-btn-unarchive' : ''}`}
                                    onClick={confirmArchive}
                                    disabled={archiveInput !== archiveModal.id}
                                >
                                    {archiveModal.currentlyArchived ? 'Unarchive' : 'Archive'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default FacultyDashboard;
