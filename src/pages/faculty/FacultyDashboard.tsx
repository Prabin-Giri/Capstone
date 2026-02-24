import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { getCourses, updateCourse, type Course } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { Archive, RotateCcw, AlertTriangle } from 'lucide-react';

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

            {/* Archive/Unarchive Confirmation Modal */}
            {archiveModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                                <AlertTriangle size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                {archiveModal.currentlyArchived ? 'Unarchive Course?' : 'Archive Course?'}
                            </h3>
                            <p className="text-gray-500 mb-6 font-medium">
                                To confirm, type <span className="font-mono bg-gray-100 px-1 rounded select-all">{archiveModal.name}</span> below.
                            </p>

                            <input
                                type="text"
                                value={archiveInput}
                                onChange={(e) => {
                                    setArchiveInput(e.target.value);
                                    setActionError(null);
                                }}
                                placeholder="Type course name"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                onClick={(e) => e.stopPropagation()}
                            />

                            {actionError && (
                                <p className="text-red-600 text-sm mb-4">{actionError}</p>
                            )}

                            {!archiveModal.currentlyArchived && (
                                <p className="text-xs text-gray-400 mb-6">
                                    Archiving will make this course read-only for all students.
                                </p>
                            )}

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setArchiveModal(null);
                                    }}
                                    className="flex-1 px-5 py-2.5 rounded-lg border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        confirmArchive();
                                    }}
                                    disabled={archiveInput !== archiveModal.name}
                                    className={`flex-1 px-5 py-2.5 rounded-lg font-medium text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${archiveModal.currentlyArchived ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                                        }`}
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

export default FacultyDashboard;
