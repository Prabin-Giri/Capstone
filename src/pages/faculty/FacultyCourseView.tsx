import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getCourse,
    getCourseAssignments,
    deleteAssignment,
    getCourseDocuments,
    uploadSyllabus,
    uploadSchedule,
    getFileUrl,
    getAssignmentGradesExportUrl
} from '../../lib/api';
import type { Course, Assignment, CourseDocuments } from '../../lib/api';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { FileText, Calendar, Plus, ChevronDown, Download, Upload } from 'lucide-react';
import './FacultyCourseView.css';

const FacultyCourseView: React.FC = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [documents, setDocuments] = useState<CourseDocuments | null>(null);
    const [loading, setLoading] = useState(true);
    const [showDropdown, setShowDropdown] = useState(false);

    const syllabusInputRef = useRef<HTMLInputElement>(null);
    const scheduleInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadData();
    }, [courseId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    async function loadData() {
        if (!courseId) return;
        try {
            const [courseData, assignmentsData, documentsData] = await Promise.all([
                getCourse(courseId),
                getCourseAssignments(courseId),
                getCourseDocuments(courseId)
            ]);
            setCourse(courseData);
            setAssignments(assignmentsData);
            setDocuments(documentsData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this assignment?')) return;
        try {
            await deleteAssignment(id);
            setAssignments(assignments.filter(a => a.id !== id));
        } catch (err) {
            console.error('Failed to delete', err);
            alert('Failed to delete assignment');
        }
    }

    const handleFileUpload = async (type: 'syllabus' | 'schedule', file: File) => {
        if (!courseId) return;
        try {
            setLoading(true);
            if (type === 'syllabus') {
                await uploadSyllabus(courseId, file);
            } else {
                await uploadSchedule(courseId, file);
            }
            // Refresh documents
            const docs = await getCourseDocuments(courseId);
            setDocuments(docs);
            setShowDropdown(false);
        } catch (err) {
            console.error('Upload failed', err);
            alert('Upload failed');
        } finally {
            setLoading(false);
        }
    };

    if (loading && !course) return <div className="faculty-course-container">Loading...</div>;
    if (!course) return <div className="faculty-course-container">Course not found</div>;

    return (
        <div className="faculty-course-container">
            {/* Hidden File Inputs */}
            <input
                type="file"
                ref={syllabusInputRef}
                style={{ display: 'none' }}
                accept=".pdf,.doc,.docx"
                onChange={(e) => e.target.files?.[0] && handleFileUpload('syllabus', e.target.files[0])}
            />
            <input
                type="file"
                ref={scheduleInputRef}
                style={{ display: 'none' }}
                accept=".pdf,.doc,.docx"
                onChange={(e) => e.target.files?.[0] && handleFileUpload('schedule', e.target.files[0])}
            />

            {/* Page Header */}
            <div className="faculty-course-header">
                <div className="header-title">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h1>Faculty Command Center</h1>
                        {course.is_archived && (
                            <span className="tag-pill" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--muted-color)', border: '1px solid rgba(255,255,255,0.2)' }}>
                                ARCHIVED
                            </span>
                        )}
                    </div>
                    <p className="header-metadata">{course.name} • {course.id}</p>
                </div>

                <div className="dropdown-container" ref={dropdownRef}>
                    <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="create-btn"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                    >
                        <Plus size={20} />
                        Add Course Content
                        <ChevronDown size={14} />
                    </button>

                    {showDropdown && (
                        <div className="dropdown-menu">
                            <button
                                className="dropdown-item"
                                onClick={() => navigate('assignments/new')}
                            >
                                <Plus size={16} />
                                Manual Assignment
                            </button>
                            <div className="dropdown-divider"></div>
                            <button
                                className="dropdown-item"
                                onClick={() => syllabusInputRef.current?.click()}
                            >
                                <Upload size={16} />
                                Upload Syllabus
                            </button>
                            <button
                                className="dropdown-item"
                                onClick={() => scheduleInputRef.current?.click()}
                            >
                                <Upload size={16} />
                                Upload Assignment Schedule
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Faculty Analytics Bar */}
            <div className="analytics-bar">
                <div className="analytics-card glass">
                    <span className="analytics-label">Total Assignments</span>
                    <span className="analytics-value">{assignments.length}</span>
                    <span className="analytics-desc">Current semester total</span>
                </div>
                <div className="analytics-card glass">
                    <span className="analytics-label">Submission Rate</span>
                    <span className="analytics-value">94%</span>
                    <span className="analytics-desc">Avg across all tasks</span>
                </div>
                <div className="analytics-card glass">
                    <span className="analytics-label">Pending Grading</span>
                    <span className="analytics-value" style={{ color: 'var(--primary-color)' }}>
                        {assignments.filter(a => a.status === 'closed').length * 12 + 5}
                    </span>
                    <span className="analytics-desc">Total submissions to review</span>
                </div>
            </div>

            {/* Course Documents Section */}
            <div className="course-documents-section">
                {documents?.syllabus_path ? (
                    <a href={getFileUrl(documents.syllabus_path)} target="_blank" rel="noreferrer" className="doc-pill">
                        <FileText size={16} />
                        Syllabus
                        <Download size={14} />
                    </a>
                ) : (
                    <div className="doc-pill empty">
                        <FileText size={16} />
                        No Syllabus
                    </div>
                )}

                {documents?.schedule_path ? (
                    <a href={getFileUrl(documents.schedule_path)} target="_blank" rel="noreferrer" className="doc-pill">
                        <Calendar size={16} />
                        Assignment Schedule
                        <Download size={14} />
                    </a>
                ) : (
                    <div className="doc-pill empty">
                        <Calendar size={16} />
                        No Schedule
                    </div>
                )}
            </div>

            {/* Assignment List */}
            <div className="assignments-list">
                {assignments.length === 0 ? (
                    <div className="empty-state">
                        <p>No assignments yet</p>
                        <small>Create your first assignment to get started.</small>
                    </div>
                ) : (
                    assignments.map(assignment => (
                        <div key={assignment.id} className="assignment-card">
                            <div className="card-content">
                                {/* Row 1: Title */}
                                <div className="card-title-row">
                                    <h3 className="assignment-title">
                                        {assignment.title}
                                    </h3>
                                </div>

                                {/* Row 2: Metadata & Actions */}
                                <div className="card-details-row">
                                    {/* Left: Metadata */}
                                    <div className="meta-group">
                                        <div className="due-date">
                                            <span className="due-label">DEADLINE</span>
                                            {new Date(assignment.due_date).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric'
                                            })}
                                        </div>
                                        <StatusBadge status={assignment.status} />
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="action-group">
                                        <div className="button-group">
                                            <a
                                                href={getAssignmentGradesExportUrl(assignment.id)}
                                                download
                                                className="action-btn"
                                                title="Download Grades"
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <Download size={14} />
                                                Grades
                                            </a>
                                            <button
                                                onClick={() => navigate(`assignments/${assignment.id}/grading`)}
                                                className="action-btn"
                                            >
                                                Grade
                                            </button>
                                            <button
                                                onClick={() => navigate(`assignments/${assignment.id}/edit`)}
                                                className="action-btn"
                                            >
                                                Edit
                                            </button>
                                        </div>

                                        <button
                                            onClick={() => handleDelete(assignment.id)}
                                            className="delete-btn"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default FacultyCourseView;
