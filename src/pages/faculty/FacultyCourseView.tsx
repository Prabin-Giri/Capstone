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
    getAssignmentGradesExportUrl,
    updateCourse,
    enrollStudent,
    enrollStudentsByCSV,
    getEnrolledStudents,
    searchStudents,
    type User,
    type CsvEnrollResult
} from '../../lib/api';
import type { Course, Assignment, CourseDocuments } from '../../lib/api';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { FileText, Calendar, Plus, ChevronDown, Download, Upload, Archive, AlertTriangle, Search, UserPlus, X } from 'lucide-react';
import './FacultyCourseView.css';

const FacultyCourseView: React.FC = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [documents, setDocuments] = useState<CourseDocuments | null>(null);
    const [loading, setLoading] = useState(true);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [assignmentToDelete, setAssignmentToDelete] = useState<string | null>(null);
    const [archiveInput, setArchiveInput] = useState('');
    const [enrolledStudents, setEnrolledStudents] = useState<User[]>([]);
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [enrollTab, setEnrollTab] = useState<'manual' | 'csv'>('manual');
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    // CSV enrollment state
    const [csvEmails, setCsvEmails] = useState<string[]>([]);
    const [csvFileName, setCsvFileName] = useState<string>('');
    const [csvResult, setCsvResult] = useState<CsvEnrollResult | null>(null);
    const [csvLoading, setCsvLoading] = useState(false);
    const csvInputRef = useRef<HTMLInputElement>(null);

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
            const [courseData, assignmentsData, documentsData, studentsData] = await Promise.all([
                getCourse(courseId),
                getCourseAssignments(courseId),
                getCourseDocuments(courseId),
                getEnrolledStudents(courseId)
            ]);
            setCourse(courseData);
            setAssignments(assignmentsData);
            setDocuments(documentsData);
            setEnrolledStudents(studentsData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    function handleDeleteClick(id: string) {
        setAssignmentToDelete(id);
    }

    async function confirmDelete() {
        if (!assignmentToDelete) return;
        try {
            await deleteAssignment(assignmentToDelete);
            setAssignments(assignments.filter(a => a.id !== assignmentToDelete));
            setAssignmentToDelete(null);
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

    const handleArchiveCourse = async () => {
        if (!courseId || !course) return;

        if (archiveInput !== course.name) {
            setActionError('Course name does not match');
            return;
        }

        try {
            await updateCourse(courseId, { is_archived: !course.is_archived });
            // Refresh course data
            const courseData = await getCourse(courseId);
            setCourse(courseData);
            setShowArchiveModal(false);
            setShowDropdown(false);
            setArchiveInput('');
            setActionError(null);
        } catch (err) {
            console.error('Failed to archive course', err);
            setActionError('Failed to update course status. Please try again.');
        }
    };

    const handleSearchStudents = async (query: string) => {
        setStudentSearchQuery(query);
        setIsSearching(true);
        try {
            const results = await searchStudents(query);
            setSearchResults(results.filter(s => !enrolledStudents.find(es => es.id === s.id)));
        } catch (err) {
            console.error('Search failed', err);
        } finally {
            setIsSearching(false);
        }
    };

    const handleEnroll = async (studentId: string) => {
        if (!courseId) return;
        try {
            await enrollStudent(courseId, studentId);
            const students = await getEnrolledStudents(courseId);
            setEnrolledStudents(students);
            setStudentSearchQuery('');
            setSearchResults([]);
            setShowEnrollModal(false);
        } catch (err) {
            console.error('Enrollment failed', err);
            alert('Failed to enroll student');
        }
    };

    const handleCsvFile = (file: File) => {
        setCsvFileName(file.name);
        setCsvResult(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) { setCsvEmails([]); return; }

            // Parse first row to detect headers
            const firstRow = lines[0].split(',').map(c => c.trim().toLowerCase());
            const emailColIndex = firstRow.indexOf('email');

            let emails: string[];
            if (emailColIndex >= 0) {
                // Multi-column CSV with an 'email' header — extract that column
                emails = lines.slice(1)
                    .map(line => line.split(',')[emailColIndex]?.trim())
                    .filter(Boolean) as string[];
            } else {
                // Single-column or no header — treat each line as an email, skip if it looks like a header
                emails = lines.filter(l => l.toLowerCase() !== 'email' && l.includes('@'));
            }
            setCsvEmails(emails);
        };
        reader.readAsText(file);
    };

    const handleCsvEnroll = async () => {
        if (!courseId || csvEmails.length === 0) return;
        setCsvLoading(true);
        try {
            const result = await enrollStudentsByCSV(courseId, csvEmails);
            setCsvResult(result);
            // Refresh student list
            const students = await getEnrolledStudents(courseId);
            setEnrolledStudents(students);
        } catch (err) {
            console.error('CSV enroll failed', err);
            alert('Failed to enroll students from CSV');
        } finally {
            setCsvLoading(false);
        }
    };

    const resetEnrollModal = () => {
        setShowEnrollModal(false);
        setEnrollTab('manual');
        setCsvEmails([]);
        setCsvFileName('');
        setCsvResult(null);
        setStudentSearchQuery('');
        setSearchResults([]);
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
                        Manage Course
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
                            <div className="dropdown-divider"></div>
                            <button
                                className="dropdown-item"
                                onClick={() => {
                                    setShowEnrollModal(true);
                                    setShowDropdown(false);
                                    handleSearchStudents('');
                                }}
                            >
                                <UserPlus size={16} />
                                Enroll Student
                            </button>
                            <div className="dropdown-divider"></div>
                            <button
                                className="dropdown-item"
                                onClick={() => {
                                    setShowArchiveModal(true);
                                    setShowDropdown(false);
                                    setArchiveInput('');
                                    setActionError(null);
                                }}
                                style={{ color: course.is_archived ? 'var(--primary-color)' : '#ef4444' }}
                            >
                                <Archive size={16} />
                                {course.is_archived ? 'Unarchive Course' : 'Archive Course'}
                            </button>
                        </div>
                    )}
                </div>

                <button
                    onClick={() => navigate('gradebook')}
                    className="create-btn"
                    style={{ background: 'var(--primary-color)', color: 'white', marginLeft: '10px', border: 'none' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={18} />
                        View Gradebook
                    </div>
                </button>
            </div>

            {/* Faculty Analytics Bar */}


            <div className="analytics-bar">
                <div className="analytics-card glass">
                    <span className="analytics-label">Total Assignments</span>
                    <span className="analytics-value">{assignments.length}</span>
                    <span className="analytics-desc">Current semester total</span>
                </div>
                <div className="analytics-card glass">
                    <span className="analytics-label">Enrolled Students</span>
                    <span className="analytics-value">{enrolledStudents.length}</span>
                    <span className="analytics-desc">Active learners</span>
                </div>
                <div className="analytics-card glass">
                    <span className="analytics-label">Pending Grading</span>
                    <span className="analytics-value" style={{ color: 'var(--primary-color)' }}>
                        {assignments.filter(a => a.status === 'closed').length * enrolledStudents.length}
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

            <div className="course-main-content">
                <div className="assignments-section">
                    <h2 className="section-title">Assignments</h2>
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
                                            <h3
                                                className="assignment-title"
                                                onClick={() => navigate(`assignments/${assignment.id}/grading`)}
                                                style={{ cursor: 'pointer', color: 'var(--primary-color)' }}
                                            >
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
                                                    onClick={() => handleDeleteClick(assignment.id)}
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

                <div className="students-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 className="section-title" style={{ margin: 0 }}>Enrolled Students</h2>
                        <button className="enroll-btn-small" onClick={() => setShowEnrollModal(true)}>
                            <UserPlus size={14} />
                            Enroll
                        </button>
                    </div>
                    <div className="students-list glass">
                        {enrolledStudents.length === 0 ? (
                            <p className="empty-text">No students enrolled yet.</p>
                        ) : (
                            enrolledStudents.map(student => (
                                <div key={student.id} className="student-item">
                                    <div className="student-info">
                                        <div className="student-avatar">
                                            {student.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="student-name">{student.name}</p>
                                            <p className="student-email">{student.email}</p>
                                        </div>
                                    </div>
                                    <span className="student-id-tag">{student.id}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Archive Confirmation Modal */}
            {showArchiveModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                                <AlertTriangle size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                {course.is_archived ? 'Unarchive Course?' : 'Archive Course?'}
                            </h3>
                            <p className="text-gray-500 mb-6 font-medium">
                                To confirm, type <span className="font-mono bg-gray-100 px-1 rounded select-all">{course.name}</span> below.
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
                            />

                            {actionError && (
                                <p className="text-red-600 text-sm mb-4">{actionError}</p>
                            )}

                            {!course.is_archived && (
                                <p className="text-xs text-gray-400 mb-6">
                                    Archiving will make this course read-only for all students.
                                </p>
                            )}

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setShowArchiveModal(false)}
                                    className="flex-1 px-5 py-2.5 rounded-lg border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleArchiveCourse}
                                    disabled={archiveInput !== course.name}
                                    className={`flex-1 px-5 py-2.5 rounded-lg font-medium text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${course.is_archived ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                                        }`}
                                >
                                    {course.is_archived ? 'Unarchive' : 'Archive'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {assignmentToDelete && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                                <AlertTriangle size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                Delete Assignment?
                            </h3>
                            <p className="text-gray-500 mb-6">
                                Are you sure you want to delete this assignment? This action cannot be undone and will delete all student submissions.
                            </p>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setAssignmentToDelete(null)}
                                    className="flex-1 px-5 py-2.5 rounded-lg border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 px-5 py-2.5 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
                                >
                                    Delete Assignment
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Enrollment Modal */}
            {/* Hidden CSV file input */}
            <input
                type="file"
                ref={csvInputRef}
                style={{ display: 'none' }}
                accept=".csv,.txt"
                onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
            />

            {showEnrollModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '480px', width: '100%' }}>
                        {/* Header */}
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-900">Enroll Students</h3>
                            <button onClick={resetEnrollModal} style={{ color: '#9ca3af' }}><X size={20} /></button>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', borderRadius: '8px', padding: '4px', marginBottom: '16px' }}>
                            <button
                                onClick={() => setEnrollTab('manual')}
                                style={{
                                    flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
                                    background: enrollTab === 'manual' ? 'white' : 'transparent',
                                    color: enrollTab === 'manual' ? '#111827' : '#6b7280',
                                    boxShadow: enrollTab === 'manual' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                }}
                            >
                                Manual Search
                            </button>
                            <button
                                onClick={() => setEnrollTab('csv')}
                                style={{
                                    flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
                                    background: enrollTab === 'csv' ? 'white' : 'transparent',
                                    color: enrollTab === 'csv' ? '#111827' : '#6b7280',
                                    boxShadow: enrollTab === 'csv' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                }}
                            >
                                Upload CSV
                            </button>
                        </div>

                        {/* Manual Tab */}
                        {enrollTab === 'manual' && (
                            <>
                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        value={studentSearchQuery}
                                        onChange={(e) => handleSearchStudents(e.target.value)}
                                        placeholder="Search by name or email..."
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        autoFocus
                                    />
                                </div>
                                <div className="max-h-60 overflow-y-auto mb-4 custom-scrollbar">
                                    {isSearching ? (
                                        <p className="text-center py-4 text-gray-500">Searching...</p>
                                    ) : searchResults.length > 0 ? (
                                        searchResults.map(student => (
                                            <div key={student.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors border-b border-gray-100 last:border-0">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.875rem' }}>
                                                        {student.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', margin: 0 }}>{student.name}</p>
                                                        <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>{student.email}</p>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleEnroll(student.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors" title="Enroll Student">
                                                    <UserPlus size={18} />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        studentSearchQuery.length > 0
                                            ? <p className="text-center py-4 text-gray-500">No students found.</p>
                                            : <p className="text-center py-4 text-xs text-gray-400">Type a name or email to search.</p>
                                    )}
                                </div>
                            </>
                        )}

                        {/* CSV Tab */}
                        {enrollTab === 'csv' && (
                            <div>
                                {/* Drop zone */}
                                <div
                                    onClick={() => csvInputRef.current?.click()}
                                    style={{
                                        border: '2px dashed #d1d5db', borderRadius: '10px', padding: '24px',
                                        textAlign: 'center', cursor: 'pointer', marginBottom: '12px',
                                        background: csvEmails.length > 0 ? '#f0fdf4' : '#f9fafb',
                                        borderColor: csvEmails.length > 0 ? '#86efac' : '#d1d5db',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <Upload size={28} style={{ margin: '0 auto 8px', color: csvEmails.length > 0 ? '#16a34a' : '#9ca3af' }} />
                                    {csvFileName ? (
                                        <>
                                            <p style={{ fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>{csvFileName}</p>
                                            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>{csvEmails.length} email{csvEmails.length !== 1 ? 's' : ''} found — click to change</p>
                                        </>
                                    ) : (
                                        <>
                                            <p style={{ fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>Click to upload CSV</p>
                                            <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>One email per row. Header row optional.</p>
                                        </>
                                    )}
                                </div>

                                {/* Email preview */}
                                {csvEmails.length > 0 && !csvResult && (
                                    <div style={{ maxHeight: '140px', overflowY: 'auto', background: '#f9fafb', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.8rem', color: '#374151' }}>
                                        {csvEmails.map((e, i) => <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid #e5e7eb' }}>{e}</div>)}
                                    </div>
                                )}

                                {/* Result summary */}
                                {csvResult && (
                                    <div style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
                                        {csvResult.enrolled.length > 0 && (
                                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px' }}>
                                                <p style={{ fontWeight: 700, color: '#16a34a', margin: '0 0 4px' }}>✅ Enrolled ({csvResult.enrolled.length})</p>
                                                {csvResult.enrolled.map((s, i) => <div key={i} style={{ color: '#166534' }}>{s.name} — {s.email}</div>)}
                                            </div>
                                        )}
                                        {csvResult.alreadyEnrolled.length > 0 && (
                                            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px' }}>
                                                <p style={{ fontWeight: 700, color: '#2563eb', margin: '0 0 4px' }}>ℹ️ Already Enrolled ({csvResult.alreadyEnrolled.length})</p>
                                                {csvResult.alreadyEnrolled.map((s, i) => <div key={i} style={{ color: '#1e40af' }}>{s.name} — {s.email}</div>)}
                                            </div>
                                        )}
                                        {csvResult.notFound.length > 0 && (
                                            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '8px 12px' }}>
                                                <p style={{ fontWeight: 700, color: '#ea580c', margin: '0 0 4px' }}>⚠️ Not Found ({csvResult.notFound.length})</p>
                                                {csvResult.notFound.map((e, i) => <div key={i} style={{ color: '#9a3412' }}>{e}</div>)}
                                                <p style={{ fontSize: '0.75rem', color: '#9a3412', margin: '4px 0 0' }}>These emails are not registered in the system.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Enroll button */}
                                {csvEmails.length > 0 && !csvResult && (
                                    <button
                                        onClick={handleCsvEnroll}
                                        disabled={csvLoading}
                                        style={{
                                            width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
                                            background: csvLoading ? '#9ca3af' : '#2563eb', color: 'white',
                                            fontWeight: 600, fontSize: '0.95rem', cursor: csvLoading ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {csvLoading ? 'Enrolling...' : `Enroll ${csvEmails.length} Student${csvEmails.length !== 1 ? 's' : ''}`}
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end" style={{ marginTop: '12px' }}>
                            <button onClick={resetEnrollModal} className="px-4 py-2 rounded-lg border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FacultyCourseView;
