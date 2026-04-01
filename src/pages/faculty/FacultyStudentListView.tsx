import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, Link, useNavigate } from 'react-router-dom';
import { getCourseGrades, getSubmissions, type GradebookData, inviteTA, getTAs, removeTA, unenrollStudent } from '../../lib/api';
import { ChevronLeft, BarChart2, X, ExternalLink, UserPlus, ShieldCheck, Users, Trash, ShieldAlert } from 'lucide-react';
import UserAvatar from '../../components/ui/UserAvatar';
import './FacultyStudentListView.css';

const FacultyStudentListView: React.FC = () => {
    const { courseId } = useParams();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [data, setData] = useState<GradebookData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [taIds, setTaIds] = useState<Set<string>>(new Set());
    const [taActionModal, setTaActionModal] = useState<{ student: any, isAssign: boolean } | null>(null);
    const [studentToUnenroll, setStudentToUnenroll] = useState<{ id: string, name: string } | null>(null);

    const basePath = useMemo(() => {
        return pathname.startsWith('/ta') ? `/ta/courses/${courseId}` : `/faculty/courses/${courseId}`;
    }, [pathname, courseId]);

    const isTA = pathname.startsWith('/ta');

    useEffect(() => {
        if (courseId) {
            loadData();
            loadTaData();
        }
    }, [courseId]);

    async function loadTaData() {
        if (!courseId) return;
        try {
            const tas = await getTAs(courseId);
            setTaIds(new Set(tas.map(ta => ta.id)));
        } catch (err) {
            console.error('Failed to load TA data', err);
        }
    }

    async function loadData() {
        if (!courseId) return;
        try {
            const gradebookData = await getCourseGrades(courseId);
            setData(gradebookData);
        } catch (err) {
            console.error('Failed to load gradebook data', err);
        } finally {
            setLoading(false);
        }
    }

    if (loading) return <div className="student-list-container">Loading student list...</div>;
    if (!data) return <div className="student-list-container text-red-500">Failed to load course data</div>;

    const { course, students, assignments } = data;

    const selectedStudent = selectedStudentId ? students.find(s => s.id === selectedStudentId) : null;

    // Report generation logic similar to gradebook for selected student
    const generateStudentReport = () => {
        if (!selectedStudent) return null;

        let totalPoints = 0;
        let earnedPoints = 0;
        let gradedCount = 0;
        let missingCount = 0;

        const assignmentRows = assignments.map(a => {
            const rawGrade = selectedStudent.grades[a.id];
            const hasSubmission = selectedStudent.submitted?.[a.id];
            
            // Due date check
            let isMissing = false;
            if (a.due_date && rawGrade == null && !hasSubmission) {
                if (new Date() > new Date(a.due_date)) {
                    isMissing = true;
                }
            }

            let status: 'graded' | 'ungraded' | 'missing' | 'not_submitted' = 'not_submitted';
            if (rawGrade != null) status = 'graded';
            else if (hasSubmission) status = 'ungraded';
            else if (isMissing) status = 'missing';

            let percentage = null;
            if (status === 'graded' && rawGrade != null) {
                const pointsPossible = a.points || 100;
                percentage = pointsPossible > 0 ? (rawGrade / pointsPossible) * 100 : 0;
                totalPoints += pointsPossible;
                earnedPoints += rawGrade;
                gradedCount++;
            } else if (status === 'missing') {
                missingCount++;
            }

            return {
                assignment: a,
                rawGrade,
                percentage,
                status
            };
        });

        const overallPercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : null;

        return {
            overallPercentage,
            gradedCount,
            missingCount,
            assignmentRows
        };
    };

    const getGradeClass = (pct: number) => {
        if (pct >= 90) return 'grade-A';
        if (pct >= 80) return 'grade-B';
        if (pct >= 70) return 'grade-C';
        if (pct >= 60) return 'grade-D';
        return 'grade-F';
    };

    const handleAssignmentClick = async (assignmentId: string, studentId: string) => {
        try {
            const submissions = await getSubmissions({ assignment_id: assignmentId, student_id: studentId });
            if (submissions.length > 0) {
                // Navigate to the most recent submission's grading page
                const latest = submissions[submissions.length - 1];
                navigate(`${basePath}/assignments/${assignmentId}/grading/${latest.id}`);
            } else {
                // No submission — go to the general grading dashboard for that assignment
                navigate(`${basePath}/assignments/${assignmentId}/grading`);
            }
        } catch (err) {
            console.error('Failed to fetch submission', err);
            navigate(`${basePath}/assignments/${assignmentId}/grading`);
        }
    };

    const report = generateStudentReport();

    return (
        <div className="student-list-container">
            <div className="student-list-header">
                <div>
                    <div className="breadcrumb">
                        <Link to={basePath}>
                            <ChevronLeft size={14} />
                            Back to Course
                        </Link>
                        <span>/</span>
                        <span>Students</span>
                    </div>
                    <h1 className="page-title">{course.name} - Students</h1>
                    <p className="page-subtitle">{students.length} Enrolled Student{students.length !== 1 ? 's' : ''}</p>
                </div>
            </div>

            <div className="student-list-table-container">
                <table className="student-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Student ID</th>
                            <th>Email Address</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.length === 0 && (
                            <tr>
                                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No students enrolled.</td>
                            </tr>
                        )}
                        {students.map(student => (
                            <tr key={student.id}>
                                <td>
                                    <div className="student-name-cell">
                                        <UserAvatar user={student} size="sm" />
                                        <span>{student.name}</span>
                                    </div>
                                </td>
                                <td style={{ color: 'var(--text-secondary)' }}>{student.id}</td>
                                <td style={{ color: 'var(--text-secondary)' }}>{student.email}</td>
                                <td style={{ textAlign: 'right' }}>
                                    <div className="student-actions-cell">
                                            <button 
                                                className="view-grades-btn"
                                                onClick={() => setSelectedStudentId(student.id)}
                                                title="View student grades"
                                            >
                                                <BarChart2 size={16} />
                                                View Grades
                                            </button>
                                            {!isTA && (
                                                <>
                                                    <button 
                                                        className={taIds.has(student.id) ? "ta-toggle-btn active" : "ta-toggle-btn"}
                                                        onClick={() => setTaActionModal({ student, isAssign: !taIds.has(student.id) })}
                                                        title={taIds.has(student.id) ? "Unassign as TA" : "Assign as TA"}
                                                    >
                                                        {taIds.has(student.id) ? <ShieldCheck size={16} /> : <UserPlus size={16} />}
                                                        {taIds.has(student.id) ? "Revoke TA" : "Make TA"}
                                                    </button>
                                                    
                                                    <button 
                                                        className="roster-delete-btn"
                                                        onClick={() => setStudentToUnenroll({ id: student.id, name: student.name })}
                                                        title="Unenroll student from course"
                                                    >
                                                        <Trash size={18} strokeWidth={2.5} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {studentToUnenroll && (
                <div className="report-modal-overlay">
                    <div className="report-modal-content" style={{ maxWidth: '420px', textAlign: 'center', padding: '2.5rem' }}>
                        <div className="unenroll-icon-wrapper" style={{ margin: '0 auto 1.5rem', backgroundColor: '#fef2f2', color: '#ef4444' }}>
                            <ShieldAlert size={32} />
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.8rem' }}>
                            Unenroll Student?
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.5', marginBottom: '2.5rem' }}>
                            Are you sure you want to remove <strong style={{ color: 'var(--text-primary)' }}>{studentToUnenroll.name}</strong> from this course? This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="ta-toggle-btn" style={{ flex: 1, border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={() => setStudentToUnenroll(null)}>
                                Cancel
                            </button>
                            <button
                                className="ta-toggle-btn active"
                                style={{ flex: 1, justifyContent: 'center', width: 'auto', height: 'auto', padding: '0.75rem 1rem !important' }}
                                onClick={async () => {
                                    try {
                                        await unenrollStudent(courseId!, studentToUnenroll.id);
                                        await loadData();
                                        setStudentToUnenroll(null);
                                    } catch (err) {
                                        console.error('Failed to unenroll student', err);
                                    }
                                }}
                            >
                                Confirm Unenroll
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TA Action Overlay */}
            {taActionModal && (
                <div className="report-modal-overlay">
                    <div className="report-modal-content" style={{ maxWidth: '420px', textAlign: 'center', padding: '2rem' }}>
                        <div className="unenroll-icon-wrapper" style={{ margin: '0 auto 1.5rem', backgroundColor: 'var(--primary-light)', color: 'var(--primary-color)' }}>
                            <Users size={32} />
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                            {taActionModal.isAssign ? 'Assign Teaching Assistant?' : 'Revoke TA Privileges?'}
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem' }}>
                            {taActionModal.isAssign 
                                ? `Do you want to grant ${taActionModal.student.name} access to grade submissions and manage assignments for this course?`
                                : `Are you sure you want to remove TA privileges for ${taActionModal.student.name}? They will still remain enrolled as a student.`
                            }
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="ta-toggle-btn" style={{ flex: 1 }} onClick={() => setTaActionModal(null)}>
                                Cancel
                            </button>
                            <button
                                className="ta-toggle-btn active"
                                style={{ flex: 1, justifyContent: 'center' }}
                                onClick={async () => {
                                    try {
                                        if (taActionModal.isAssign) {
                                            await inviteTA(courseId!, { taId: taActionModal.student.id });
                                        } else {
                                            await removeTA(courseId!, taActionModal.student.id);
                                        }
                                        await loadTaData();
                                        setTaActionModal(null);
                                    } catch (err) {
                                        console.error('Failed to toggle TA status', err);
                                    }
                                }}
                            >
                                {taActionModal.isAssign ? 'Assign TA' : 'Revoke TA'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedStudent && report && (
                <div className="report-modal-overlay" onClick={() => setSelectedStudentId(null)}>
                    <div className="report-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="report-modal-header">
                            <div>
                                <h3>Grade Report</h3>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    {selectedStudent.name} • {selectedStudent.id}
                                </div>
                            </div>
                            <button className="report-modal-close" onClick={() => setSelectedStudentId(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="report-modal-body">
                            
                            <div className="report-stats-grid">
                                <div className="report-stat-card">
                                    <div className="report-stat-label">Current Grade</div>
                                    <div className="report-stat-value">
                                        {report.overallPercentage !== null ? `${report.overallPercentage.toFixed(1)}%` : 'N/A'}
                                    </div>
                                </div>
                                <div className="report-stat-card">
                                    <div className="report-stat-label">Graded Assignments</div>
                                    <div className="report-stat-value">{report.gradedCount}</div>
                                </div>
                                <div className="report-stat-card">
                                    <div className="report-stat-label">Missing Assignments</div>
                                    <div className="report-stat-value" style={{ color: report.missingCount > 0 ? '#ef4444' : 'inherit' }}>
                                        {report.missingCount}
                                    </div>
                                </div>
                            </div>

                            <h4 style={{ marginBottom: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Assignment Details</h4>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                <table className="report-assignments-table">
                                    <thead>
                                        <tr>
                                            <th>Assignment</th>
                                            <th>Due Date</th>
                                            <th>Status</th>
                                            <th style={{ textAlign: 'right' }}>Score</th>
                                            <th style={{ textAlign: 'center' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.assignmentRows.length === 0 ? (
                                            <tr><td colSpan={5} style={{ textAlign: 'center' }}>No assignments yet.</td></tr>
                                        ) : report.assignmentRows.map((row) => (
                                            <tr
                                                key={row.assignment.id}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => handleAssignmentClick(row.assignment.id, selectedStudentId!)}
                                            >
                                                <td style={{ fontWeight: 500 }}>{row.assignment.title}</td>
                                                <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                    {new Date(row.assignment.due_date).toLocaleDateString()}
                                                </td>
                                                <td>
                                                    {row.status === 'graded' && <span className="status-badge" style={{ background: 'var(--primary-light)', color: 'var(--primary-color)' }}>Graded</span>}
                                                    {row.status === 'missing' && <span className="status-badge status-missing">Missing</span>}
                                                    {row.status === 'ungraded' && <span className="status-badge status-ungraded">Submitted (Ungraded)</span>}
                                                    {row.status === 'not_submitted' && <span className="status-badge status-not-submitted">Not Submitted</span>}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {row.status === 'graded' && row.rawGrade != null && row.percentage != null ? (
                                                        <span className={`grade-badge ${getGradeClass(row.percentage)}`}>
                                                            {row.rawGrade.toFixed(2)} / {row.assignment.points || 100}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <ExternalLink size={14} style={{ color: 'var(--primary-color)' }} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FacultyStudentListView;
