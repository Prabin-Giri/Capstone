import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getCourse,
    getCourseAssignments,
    getCourseGrades,
    deleteAssignment,
    getCourseDocuments,
    uploadSyllabus,
    uploadSchedule,
    getFileUrl,
    getAssignmentGradesExportUrl,
    updateCourse,
    deleteCourse,
    enrollStudent,
    enrollStudentsByCSV,
    unenrollStudent,
    getEnrolledStudents,
    searchStudents,
    searchTAs,
    getTAs,
    inviteTA,
    removeTA,
    type User,
    type CsvEnrollResult
} from '../../lib/api';
import type { Course, Assignment, CourseDocuments } from '../../lib/api';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { FileText, Calendar, Plus, ChevronDown, Download, Upload, Archive, AlertTriangle, Search, UserPlus, X, Trash2, Key } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import UserAvatar from '../../components/ui/UserAvatar';
import './FacultyCourseView.css';
import { showDialog } from '../../components/ui/Dialog';

const FacultyCourseView: React.FC = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [documents, setDocuments] = useState<CourseDocuments | null>(null);
    const [loading, setLoading] = useState(true);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [assignmentToDelete, setAssignmentToDelete] = useState<string | null>(null);
    const [archiveInput, setArchiveInput] = useState('');
    const [enrolledStudents, setEnrolledStudents] = useState<User[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [enrolledTAs, setEnrolledTAs] = useState<User[]>([]);
    const [studentToUnenroll, setStudentToUnenroll] = useState<User | null>(null);
    const [taToRemove, setTaToRemove] = useState<User | null>(null);
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [showInviteTAModal, setShowInviteTAModal] = useState(false);
    const [enrollTab, setEnrollTab] = useState<'manual' | 'csv'>('manual');
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [taSearchQuery, setTaSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    // CSV enrollment state
    const [csvData, setCsvData] = useState<{ id: string, name: string, email: string }[]>([]);
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
            const [courseData, assignmentsData, documentsData, studentsData, tasData] = await Promise.all([
                getCourse(courseId),
                getCourseAssignments(courseId),
                getCourseDocuments(courseId),
                getEnrolledStudents(courseId),
                getTAs(courseId)
            ]);
            setCourse(courseData);
            setAssignments(assignmentsData);
            setDocuments(documentsData);
            setEnrolledStudents(studentsData);
            setEnrolledTAs(tasData);

            // Calculate actual pending (ungraded) submissions
            try {
                const gradebookData = await getCourseGrades(courseId);
                let ungraded = 0;
                for (const student of gradebookData.students) {
                    for (const assignment of gradebookData.assignments) {
                        if (student.submitted?.[assignment.id] && student.grades[assignment.id] == null) {
                            ungraded++;
                        }
                    }
                }
                setPendingCount(ungraded);
            } catch {
                setPendingCount(0);
            }
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
            await showDialog({ title: 'Error', message: 'Failed to delete assignment', confirmText: 'OK' });
        }
    }

    const handleUnenroll = async () => {
        if (!courseId || !studentToUnenroll) return;
        try {
            await unenrollStudent(courseId, studentToUnenroll.id);
            // Refresh students
            const students = await getEnrolledStudents(courseId);
            setEnrolledStudents(students);
            setStudentToUnenroll(null);
        } catch (err) {
            console.error('Failed to unenroll student', err);
            await showDialog({ title: 'Error', message: 'Failed to unenroll student', confirmText: 'OK' });
        }
    };

    const handleRemoveTA = async () => {
        if (!courseId || !taToRemove) return;
        try {
            await removeTA(courseId, taToRemove.id);
            // Refresh TAs
            const tas = await getTAs(courseId);
            setEnrolledTAs(tas);
            setTaToRemove(null);
        } catch (err) {
            console.error('Failed to remove TA', err);
            await showDialog({ title: 'Error', message: 'Failed to remove Teaching Assistant', confirmText: 'OK' });
        }
    };

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
            await showDialog({ title: 'Error', message: 'Upload failed', confirmText: 'OK' });
        } finally {
            setLoading(false);
        }
    };

    const handleArchiveCourse = async () => {
        if (!courseId || !course) return;

        if (archiveInput.trim().toLowerCase() !== course.name.trim().toLowerCase()) {
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

    const handleDeleteCourse = async () => {
        if (!courseId || !course) return;

        if (archiveInput.trim().toLowerCase() !== course.name.trim().toLowerCase()) {
            setActionError('Course name does not match');
            return;
        }

        try {
            await deleteCourse(courseId);
            navigate('/dashboard');
        } catch (err) {
            console.error('Failed to delete course', err);
            setActionError('Failed to delete course. Please ensure all assignments are deleted first.');
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
            await showDialog({ title: 'Error', message: 'Failed to enroll student', confirmText: 'OK' });
        }
    };

    const handleInviteTA = async (taId: string) => {
        if (!courseId) return;
        try {
            await inviteTA(courseId, { taId });
            const tas = await getTAs(courseId);
            setEnrolledTAs(tas);
            setTaSearchQuery('');
            setShowInviteTAModal(false);
        } catch (err) {
            console.error('Invite TA failed', err);
            await showDialog({ title: 'Error', message: 'Failed to invite Teaching Assistant', confirmText: 'OK' });
        }
    };

    const handleCsvFile = (file: File) => {
        setCsvFileName(file.name);
        setCsvResult(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length === 0) { setCsvData([]); return; }

            // Proper quoted-CSV row parser — handles fields like "Last, First"
            const parseCsvRow = (row: string): string[] => {
                const result: string[] = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < row.length; i++) {
                    const ch = row[i];
                    if (ch === '"') {
                        if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
                        else { inQuotes = !inQuotes; }
                    } else if (ch === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += ch;
                    }
                }
                result.push(current.trim());
                return result;
            };

            const headers = parseCsvRow(lines[0]).map(h => h.toLowerCase());

            // Map exact expected column names
            const sisLoginIdIndex = headers.indexOf('sis login id');
            const studentIndex = headers.indexOf('student');
            const idIndex = headers.indexOf('id');

            if (sisLoginIdIndex >= 0 && studentIndex >= 0 && idIndex >= 0) {
                const students = lines.slice(1).map(line => {
                    const cols = parseCsvRow(line);
                    const sisLoginId = cols[sisLoginIdIndex]?.trim();
                    const name = cols[studentIndex]?.trim();  // Full "Last, First" preserved
                    const id = cols[idIndex]?.trim();

                    if (!sisLoginId || !name || !id) return null;
                    return {
                        id,
                        name,
                        email: `${sisLoginId}@example.edu`
                    };
                }).filter(Boolean) as { id: string, name: string, email: string }[];
                setCsvData(students);
            } else {
                showDialog({ title: 'Invalid CSV', message: 'Invalid CSV format. Please ensure the CSV contains "ID", "Student", and "SIS Login ID" headers.', confirmText: 'OK' });
                setCsvData([]);
            }
        };
        reader.readAsText(file);
    };

    const handleCsvEnroll = async () => {
        if (!courseId || csvData.length === 0) return;
        setCsvLoading(true);
        try {
            const result = await enrollStudentsByCSV(courseId, csvData);
            setCsvResult(result);
            // Refresh student list
            const students = await getEnrolledStudents(courseId);
            setEnrolledStudents(students);
        } catch (err) {
            console.error('CSV enroll failed', err);
            await showDialog({ title: 'Error', message: 'Failed to enroll students from CSV', confirmText: 'OK' });
        } finally {
            setCsvLoading(false);
        }
    };

    const resetEnrollModal = () => {
        setShowEnrollModal(false);
        setEnrollTab('manual');
        setCsvData([]);
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
                        {!!course.is_archived && (
                            <span className="tag-pill" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--muted-color)', border: '1px solid rgba(255,255,255,0.2)' }}>
                                ARCHIVED
                            </span>
                        )}
                    </div>
                    <p className="header-metadata">{course.name} • {course.id}</p>
                </div>

                <div className="header-actions">
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
                                <button
                                    className="dropdown-item"
                                    onClick={() => {
                                        setShowInviteTAModal(true);
                                        setShowDropdown(false);
                                    }}
                                >
                                    <Key size={16} />
                                    Invite Assistant
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
                                    style={{ color: course.is_archived ? 'var(--text-primary)' : '#ef4444' }}
                                >
                                    <Archive size={16} />
                                    {course.is_archived ? 'Unarchive Course' : 'Archive Course'}
                                </button>
                                <button
                                    className="dropdown-item"
                                    onClick={() => {
                                        setShowDeleteModal(true);
                                        setShowDropdown(false);
                                        setArchiveInput('');
                                        setActionError(null);
                                    }}
                                    style={{ color: 'var(--primary-color)' }}
                                >
                                    <Trash2 size={16} />
                                    Delete Course
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => navigate('gradebook')}
                        className="create-btn"
                        style={{ background: 'var(--primary-color)', color: 'white', border: 'none' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={18} />
                            View Gradebook
                        </div>
                    </button>
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
                    <span className="analytics-label">Enrolled Students</span>
                    <span className="analytics-value">{enrolledStudents.length}</span>
                    <span className="analytics-desc">Active learners</span>
                </div>
                <div className="analytics-card glass">
                    <span className="analytics-label">Pending Grading</span>
                    <span className="analytics-value" style={{ color: 'var(--text-primary)' }}>
                        {pendingCount}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 
                            className="section-title" 
                            style={{ margin: 0, cursor: 'pointer' }} 
                            onClick={() => navigate('assignments')}
                        >Assignments</h2>
                        <button
                            onClick={() => navigate('assignments/new')}
                            className="enroll-btn-small"
                        >
                            <Plus size={14} /> Add Assignment
                        </button>
                    </div>
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
                                                style={{ cursor: 'pointer', color: 'var(--text-primary)' }}
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
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="students-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <h2 className="section-title" style={{ margin: 0 }}>Enrolled</h2>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="enroll-btn-small" style={{ background: 'var(--card-glass)', color: 'var(--text-secondary)' }} onClick={() => setShowInviteTAModal(true)}>
                                <Key size={14} />
                                Invite TA
                            </button>
                            <button className="enroll-btn-small" onClick={() => setShowEnrollModal(true)}>
                                <UserPlus size={14} />
                                Enroll Student
                            </button>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0 0 1rem' }}>
                        Add students to this class so they can see assignments and submit work. Only enrolled students appear in the gradebook.
                    </p>

                    {/* TAs List */}
                    {enrolledTAs.length > 0 && (
                        <div className="students-list glass" style={{ marginBottom: '16px', borderLeft: '3px solid var(--primary-color)' }}>
                            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teaching Assistants</p>
                            {enrolledTAs.map(ta => (
                                <div key={ta.id} className="student-item" style={{ background: 'rgba(59, 130, 246, 0.05)' }}>
                                    <div className="student-info">
                                        <UserAvatar user={ta} size={36} />
                                        <div>
                                            <div className="student-name-row">
                                                <p className="student-name" style={{ fontWeight: 600 }}>{ta.name}</p>
                                                <span className="student-id-tag" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)' }}>TA STAFF</span>
                                            </div>
                                            <p className="student-email">{ta.email}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setTaToRemove(ta)}
                                        className="trash-btn-red"
                                        title="Remove TA"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Students List */}
                    <div className="students-list glass">
                        {enrolledTAs.length > 0 && (
                            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Students</p>
                        )}
                        {enrolledStudents.length === 0 ? (
                            <p className="empty-text">No students enrolled yet.</p>
                        ) : (
                            [...enrolledStudents]
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(student => (
                                    <div key={student.id} className="student-item">
                                        <div className="student-info">
                                            <div className="student-avatar" style={{ padding: student.profile_picture ? 0 : undefined, overflow: 'hidden' }}>
                                                {student.profile_picture ? (
                                                    <img
                                                        src={getFileUrl(student.profile_picture)}
                                                        alt={`${student.name} profile`}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        onError={(e) => {
                                                            const target = e.target as HTMLImageElement;
                                                            target.style.display = 'none';
                                                            target.parentElement!.style.padding = '';
                                                            target.parentElement!.textContent = student.name.charAt(0);
                                                        }}
                                                    />
                                                ) : (
                                                    student.name.charAt(0)
                                                )}
                                            </div>
                                            <div>
                                                <div className="student-name-row">
                                                    <p className="student-name">{student.name}</p>
                                                    <span className="student-id-tag">{student.id}</span>
                                                </div>
                                                <p className="student-email">{student.email}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setStudentToUnenroll(student)}
                                            className="trash-btn-red"
                                            title="Unenroll Student"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))
                        )}
                    </div>
                </div>
            </div>

            {/* Archive Confirmation Modal */}
            {showArchiveModal && (
                <div className="archive-modal-overlay">
                    <div className="archive-modal-card">
                        <div className="archive-header">
                            <div className="archive-title-container">
                                <div className="archive-icon-container">
                                    <Archive size={22} />
                                </div>
                                <h2 className="archive-title">
                                    {course.is_archived ? 'Unarchive Course?' : 'Archive Course?'}
                                </h2>
                            </div>
                            <button className="archive-close-btn" onClick={() => setShowArchiveModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="archive-body">
                            <p className="archive-instruction">
                                To confirm, type <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{course.name}</span> below.
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

                            {!course.is_archived && (
                                <div className="archive-warning">
                                    <AlertTriangle size={16} />
                                    <p className="archive-warning-text">
                                        Archiving will hide this course from your active dashboard.
                                    </p>
                                </div>
                            )}

                            <div className="archive-footer">
                                <button
                                    onClick={() => setShowArchiveModal(false)}
                                    className="archive-btn archive-btn-cancel"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleArchiveCourse}
                                    disabled={archiveInput.trim().toLowerCase() !== course.name.trim().toLowerCase()}
                                    className={`archive-btn ${course.is_archived ? 'archive-btn-unarchive' : 'archive-btn-confirm'}`}
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
                <div className="unenroll-overlay">
                    <div className="unenroll-content">
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div className="unenroll-icon-wrapper">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="unenroll-title">
                                Delete Assignment?
                            </h3>
                            <p className="unenroll-text">
                                Are you sure you want to delete this assignment? This action cannot be undone and will delete all student submissions.
                            </p>

                            <div className="unenroll-btn-group">
                                <button
                                    onClick={() => setAssignmentToDelete(null)}
                                    className="unenroll-btn unenroll-btn-cancel"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="unenroll-btn unenroll-btn-confirm"
                                >
                                    Delete Assignment
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Unenroll Confirmation Modal */}
            {studentToUnenroll && (
                <div className="unenroll-overlay">
                    <div className="unenroll-content">
                        <div className="flex flex-col items-center text-center">
                            <div className="unenroll-icon-wrapper">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="unenroll-title">Unenroll Student?</h3>
                            <p className="unenroll-text">
                                Are you sure you want to unenroll <strong>{studentToUnenroll.name}</strong> from this course?
                            </p>

                            <div className="unenroll-btn-group">
                                <button
                                    onClick={() => setStudentToUnenroll(null)}
                                    className="unenroll-btn unenroll-btn-cancel"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUnenroll}
                                    className="unenroll-btn unenroll-btn-confirm"
                                >
                                    Confirm Unenroll
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Remove TA Confirmation Modal */}
            {taToRemove && (
                <div className="unenroll-overlay">
                    <div className="unenroll-content">
                        <div className="flex flex-col items-center text-center">
                            <div className="unenroll-icon-wrapper">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="unenroll-title">Remove Teaching Assistant?</h3>
                            <p className="unenroll-text">
                                Are you sure you want to revoke access for <strong>{taToRemove.name}</strong> to this course?
                            </p>

                            <div className="unenroll-btn-group">
                                <button
                                    onClick={() => setTaToRemove(null)}
                                    className="unenroll-btn unenroll-btn-cancel"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRemoveTA}
                                    className="unenroll-btn unenroll-btn-confirm"
                                >
                                    Remove Access
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Invite TA Modal */}
            {showInviteTAModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '480px', width: '100%' }}>
                        <div className="enroll-modal-header">
                            <h3 className="enroll-modal-title">Invite Teaching Assistant</h3>
                            <button className="enroll-modal-close" onClick={() => setShowInviteTAModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="search-input-wrapper" style={{ marginTop: '16px' }}>
                            <Search className="search-icon-inside" size={18} />
                            <input
                                type="text"
                                value={taSearchQuery}
                                onChange={async (e) => {
                                    setTaSearchQuery(e.target.value);
                                    if (e.target.value.length > 2) {
                                        setIsSearching(true);
                                        try {
                                            const res = await searchTAs(e.target.value);
                                            // Assume roles are returned or just filter any
                                            setSearchResults(res.filter(s => !enrolledTAs.find(t => t.id === s.id)));
                                        } finally {
                                            setIsSearching(false);
                                        }
                                    } else {
                                        setSearchResults([]);
                                    }
                                }}
                                placeholder="Search TA by name or email..."
                                className="student-search-input"
                                autoFocus
                            />
                        </div>

                        <div className="search-results-container custom-scrollbar">
                            {isSearching ? (
                                <p className="text-center py-4 text-gray-400 font-medium">Searching database...</p>
                            ) : searchResults.length > 0 ? (
                                searchResults.map(ta => (
                                    <div key={ta.id} className="search-result-item">
                                        <div className="search-result-info">
                                            <div className="search-result-avatar">
                                                {ta.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="search-result-name">{ta.name}</p>
                                                <p className="search-result-email">{ta.email}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleInviteTA(ta.id)}
                                            className="btn-enroll-icon"
                                            title="Invite TA"
                                            style={{ color: 'var(--primary-color)' }}
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                taSearchQuery.length > 0
                                    ? <p className="text-center py-4 text-gray-500">No assistant found matching your search.</p>
                                    : <p className="text-center py-4 text-xs text-gray-400 font-medium">Type to invite a faculty or TA...</p>
                            )}
                        </div>

                        <div className="modal-footer">
                            <Button variant="primary" onClick={() => setShowInviteTAModal(false)}>
                                Close
                            </Button>
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
                        <div className="enroll-modal-header">
                            <h3 className="enroll-modal-title">Enroll Students</h3>
                            <button className="enroll-modal-close" onClick={resetEnrollModal}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="enroll-modal-tabs">
                            <button
                                onClick={() => setEnrollTab('manual')}
                                className={`enroll-modal-tab ${enrollTab === 'manual' ? 'active' : ''}`}
                            >
                                Manual Search
                            </button>
                            <button
                                onClick={() => setEnrollTab('csv')}
                                className={`enroll-modal-tab ${enrollTab === 'csv' ? 'active' : ''}`}
                            >
                                Upload CSV
                            </button>
                        </div>

                        {/* Manual Tab */}
                        {enrollTab === 'manual' && (
                            <>
                                <div className="search-input-wrapper">
                                    <Search className="search-icon-inside" size={18} />
                                    <input
                                        type="text"
                                        value={studentSearchQuery}
                                        onChange={(e) => handleSearchStudents(e.target.value)}
                                        placeholder="Search by name or email..."
                                        className="student-search-input"
                                        autoFocus
                                    />
                                </div>
                                <div className="search-results-container custom-scrollbar">
                                    {isSearching ? (
                                        <p className="text-center py-4 text-gray-400 font-medium">Searching database...</p>
                                    ) : searchResults.length > 0 ? (
                                        searchResults.map(student => (
                                            <div key={student.id} className="search-result-item">
                                                <div className="search-result-info">
                                                    <div className="search-result-avatar" style={{ padding: student.profile_picture ? 0 : undefined, overflow: 'hidden' }}>
                                                        {student.profile_picture ? (
                                                            <img
                                                                src={getFileUrl(student.profile_picture)}
                                                                alt={`${student.name} profile`}
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                onError={(e) => {
                                                                    const target = e.target as HTMLImageElement;
                                                                    target.style.display = 'none';
                                                                    target.parentElement!.style.padding = '';
                                                                    target.parentElement!.textContent = student.name.charAt(0);
                                                                }}
                                                            />
                                                        ) : (
                                                            student.name.charAt(0)
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="search-result-name">{student.name}</p>
                                                        <p className="search-result-email">{student.email}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleEnroll(student.id)}
                                                    className="btn-enroll-icon"
                                                    title="Enroll Student"
                                                >
                                                    <UserPlus size={18} />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        studentSearchQuery.length > 0
                                            ? <p className="text-center py-4 text-gray-500">No students found matching your search.</p>
                                            : <p className="text-center py-4 text-xs text-gray-400 font-medium">Start typing to find students...</p>
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
                                    className={`csv-upload-box ${csvData.length > 0 ? 'has-file' : ''}`}
                                >
                                    <Upload size={28} style={{ margin: '0 auto 12px', color: csvData.length > 0 ? 'var(--success-color)' : 'var(--text-tertiary)' }} />
                                    {csvFileName ? (
                                        <>
                                            <p style={{ fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>{csvFileName}</p>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>{csvData.length} student{csvData.length !== 1 ? 's' : ''} detected — click to change</p>
                                        </>
                                    ) : (
                                        <>
                                            <p style={{ fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>Click to upload CSV</p>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', margin: 0 }}>Canvas CSV with ID, Student, SIS Login ID columns</p>
                                        </>
                                    )}
                                </div>

                                {/* Student preview */}
                                {csvData.length > 0 && !csvResult && (
                                    <div style={{ maxHeight: '140px', overflowY: 'auto', background: '#f9fafb', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.8rem', color: '#374151' }}>
                                        {csvData.map((s: { id: string, name: string, email: string }, i: number) => <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid #e5e7eb' }}>{s.name} — {s.email}</div>)}
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
                                {csvData.length > 0 && !csvResult && (
                                    <button
                                        onClick={handleCsvEnroll}
                                        disabled={csvLoading}
                                        style={{
                                            width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
                                            background: csvLoading ? '#9ca3af' : '#2563eb', color: 'white',
                                            fontWeight: 600, fontSize: '0.95rem', cursor: csvLoading ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {csvLoading ? 'Enrolling...' : `Enroll ${csvData.length} Student${csvData.length !== 1 ? 's' : ''}`}
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="modal-footer">
                            <Button variant="primary" onClick={resetEnrollModal}>
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="archive-modal-overlay">
                    <div className="archive-modal-card">
                        <div className="archive-header">
                            <div className="archive-title-container">
                                <div className="archive-icon-container">
                                    <Trash2 size={22} />
                                </div>
                                <h2 className="archive-title">Delete Course?</h2>
                            </div>
                            <button className="archive-close-btn" onClick={() => setShowDeleteModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="archive-body">
                            <p className="archive-instruction">
                                Deleting is <strong>permanent</strong>. To confirm, type <span style={{ fontWeight: 800, color: 'var(--primary-color)' }}>{course.name}</span> below.
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

                            <div className="archive-warning" style={{ borderColor: 'var(--primary-light)', background: 'var(--primary-light)' }}>
                                <AlertTriangle size={24} style={{ color: 'var(--primary-color)' }} />
                                <p className="archive-warning-text" style={{ color: 'var(--primary-text)' }}>
                                    <strong>Danger:</strong> This will delete all assignments, students list, and grades.
                                </p>
                            </div>

                            <div className="archive-footer">
                                <button
                                    onClick={() => setShowDeleteModal(false)}
                                    className="archive-btn archive-btn-cancel"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteCourse}
                                    disabled={archiveInput.trim().toLowerCase() !== course.name.trim().toLowerCase()}
                                    className="archive-btn"
                                    style={{ background: 'var(--primary-color)', color: 'white' }}
                                >
                                    Delete Course
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FacultyCourseView;
