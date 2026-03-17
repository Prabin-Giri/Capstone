import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getCourseGrades, getSubmissions, type GradebookData } from '../../lib/api';
import { ChevronLeft, BarChart2, X, ExternalLink } from 'lucide-react';
import './FacultyStudentListView.css';

const FacultyStudentListView: React.FC = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<GradebookData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

    useEffect(() => {
        if (courseId) {
            loadData();
        }
    }, [courseId]);

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

    const computeOverallPercentage = (student: GradebookData['students'][number]) => {
        let total = 0;
        let earned = 0;
        for (const a of assignments) {
            const raw = student.grades[a.id];
            if (raw == null) continue;
            const pointsPossible = a.points || 100;
            total += pointsPossible;
            earned += raw;
        }
        if (total <= 0) return null;
        return (earned / total) * 100;
    };

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
                navigate(`/faculty/courses/${courseId}/assignments/${assignmentId}/grading/${latest.id}`);
            } else {
                // No submission — go to the general grading dashboard for that assignment
                navigate(`/faculty/courses/${courseId}/assignments/${assignmentId}/grading`);
            }
        } catch (err) {
            console.error('Failed to fetch submission', err);
            navigate(`/faculty/courses/${courseId}/assignments/${assignmentId}/grading`);
        }
    };

    const report = generateStudentReport();

    return (
        <div className="student-list-container">
            <div className="student-list-header">
                <div>
                    <div className="breadcrumb">
                        <Link to={`/faculty/courses/${courseId}`}>
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
                            <th style={{ textAlign: 'right' }}>Overall</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No students enrolled.</td>
                            </tr>
                        )}
                        {students.map(student => (
                            (() => {
                                const overall = computeOverallPercentage(student);
                                return (
                            <tr key={student.id}>
                                <td>
                                    <div className="student-name-cell">
                                        <div
                                            className="student-avatar-circle"
                                            aria-hidden="true"
                                            title={student.name}
                                        >
                                            {student.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                        <span>{student.name}</span>
                                    </div>
                                </td>
                                <td style={{ color: 'var(--text-secondary)' }}>{student.id}</td>
                                <td style={{ color: 'var(--text-secondary)' }}>{student.email}</td>
                                <td style={{ textAlign: 'right' }}>
                                    {overall == null ? (
                                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                    ) : (
                                        <span className={`grade-badge ${getGradeClass(overall)}`}>
                                            {overall.toFixed(1)}%
                                        </span>
                                    )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <button 
                                        className="view-grades-btn"
                                        onClick={() => setSelectedStudentId(student.id)}
                                    >
                                        <BarChart2 size={16} />
                                        View Grades
                                    </button>
                                </td>
                            </tr>
                                );
                            })()
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Individual Grade Report Modal */}
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
