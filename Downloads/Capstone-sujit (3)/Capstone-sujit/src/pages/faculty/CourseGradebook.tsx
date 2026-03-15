import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCourseGrades, getCourseGradesExportUrl, formatGrade } from '../../lib/api';
import type { GradebookData, GradeCell, GradeCellStatus } from '../../lib/api';
import { getRole } from '../../lib/auth';
import { Download, FileSpreadsheet, FileText, ChevronLeft, BarChart2, Printer, X, PieChart, Search } from 'lucide-react';
import './CourseGradebook.css';

interface ReportStats {
    average: number;
    median: number;
    highest: number;
    lowest: number;
    submissionRate: number;
    distribution: Record<string, number>; // A, B, C, D, F
    missingGrades: { student: string; assignment: string; status: 'submitted' | 'missing' | 'not_submitted' }[];
    ungraded: { student: string; assignment: string }[];
    missing: { student: string; assignment: string }[];
    notSubmitted: { student: string; assignment: string }[];
    totalStudents: number;
    gradedAssignments: number;
}

const CourseGradebook: React.FC = () => {
    const { courseId } = useParams();
    const basePath = getRole() === 'ta' ? '/ta' : '/faculty';
    const [data, setData] = useState<GradebookData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('csv');
    const [exportScope, setExportScope] = useState<'course' | 'student'>('course');
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');

    // Report State
    const [reportStep, setReportStep] = useState<'select' | 'view'>('select');
    const [reportType, setReportType] = useState<'summary' | 'missing' | 'insights' | 'grades'>('summary');
    const [reportStats, setReportStats] = useState<ReportStats | null>(null);
    /** For 'grades' report: null = all students, else selected student ids */
    const [reportStudentIds, setReportStudentIds] = useState<string[] | null>(null);
    /** For 'grades' report: null = all assignments, else selected assignment ids */
    const [reportAssignmentIds, setReportAssignmentIds] = useState<(string | number)[] | null>(null);

    /** Gradebook view: overall (all + total), by assignment, or by student */
    const [gradebookView, setGradebookView] = useState<'overall' | 'assignments' | 'students'>('overall');
    /** For 'assignments' view: selected assignment ids (empty = none selected, show prompt) */
    const [gradebookAssignmentIds, setGradebookAssignmentIds] = useState<(string | number)[]>([]);
    /** For 'students' view: selected student ids (empty = none selected, show prompt) */
    const [gradebookStudentIds, setGradebookStudentIds] = useState<string[]>([]);
    /** Search filter for assignment list in "Grade for specific assignments" view */
    const [assignmentSearchTerm, setAssignmentSearchTerm] = useState('');
    /** Search filter for student list in "Grade for specific students" view */
    const [studentSearchTerm, setStudentSearchTerm] = useState('');

    useEffect(() => {
        if (courseId) {
            loadGradebook();
        }
    }, [courseId]);

    async function loadGradebook() {
        if (!courseId) return;
        try {
            const gradebookData = await getCourseGrades(courseId);
            setData(gradebookData);
        } catch (err) {
            console.error('Failed to load gradebook', err);
        } finally {
            setLoading(false);
        }
    }

    const handleDownload = () => {
        if (!courseId) return;
        const url = getCourseGradesExportUrl(courseId, exportFormat, {
            studentId: exportScope === 'student' && selectedStudentId ? selectedStudentId : undefined,
        });
        window.open(url, '_blank');
        setShowExportModal(false);
    };

    const generateReport = () => {
        if (!data) return;

        const { students, assignments } = data;
        const allGrades: number[] = [];
        let totalPossibleGrades = students.length * assignments.length;
        let actualGradesCount = 0;
        const missingGrades: { student: string; assignment: string; status: 'submitted' | 'missing' | 'not_submitted' }[] = [];
        const ungraded: { student: string; assignment: string }[] = [];
        const missing: { student: string; assignment: string }[] = [];
        const notSubmitted: { student: string; assignment: string }[] = [];
        const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

        students.forEach(student => {
            assignments.forEach(assignment => {
                const cell = student.grades[assignment.id];
                const score = cell && typeof cell === 'object' && 'score' in cell ? cell.score : (cell as unknown as number | null);
                const status = cell && typeof cell === 'object' && 'status' in cell ? (cell as GradeCell).status : (score != null ? 'graded' : 'missing');
                if (score !== null && score !== undefined) {
                    allGrades.push(score);
                    actualGradesCount++;
                    if (score >= 90) distribution.A++;
                    else if (score >= 80) distribution.B++;
                    else if (score >= 70) distribution.C++;
                    else if (score >= 60) distribution.D++;
                    else distribution.F++;
                } else {
                    missingGrades.push({
                        student: student.name,
                        assignment: assignment.title,
                        status: status === 'submitted' ? 'submitted' : status === 'missing' ? 'missing' : 'not_submitted'
                    });
                    if (status === 'submitted') ungraded.push({ student: student.name, assignment: assignment.title });
                    else if (status === 'missing') missing.push({ student: student.name, assignment: assignment.title });
                    else notSubmitted.push({ student: student.name, assignment: assignment.title });
                }
            });
        });

        allGrades.sort((a, b) => a - b);
        const sum = allGrades.reduce((a, b) => a + b, 0);
        const average = allGrades.length ? sum / allGrades.length : 0;
        const median = allGrades.length ? allGrades[Math.floor(allGrades.length / 2)] : 0;

        setReportStats({
            average,
            median,
            highest: allGrades.length ? allGrades[allGrades.length - 1] : 0,
            lowest: allGrades.length ? allGrades[0] : 0,
            submissionRate: totalPossibleGrades ? (actualGradesCount / totalPossibleGrades) * 100 : 0,
            distribution,
            missingGrades,
            ungraded,
            missing,
            notSubmitted,
            totalStudents: students.length,
            gradedAssignments: assignments.length
        });

        setReportStep('view');
    };

    /** For 'grades' report: compute filtered students and assignments from current selection */
    const reportGradesStudents = data && reportStep === 'view' && reportType === 'grades'
        ? (reportStudentIds === null ? data.students : data.students.filter(s => reportStudentIds?.includes(s.id)))
        : [];
    const reportGradesAssignments = data && reportStep === 'view' && reportType === 'grades'
        ? (reportAssignmentIds === null ? data.assignments : data.assignments.filter(a => reportAssignmentIds?.includes(a.id)))
        : [];

    const getGradeClass = (grade: number) => {
        if (grade >= 90) return 'grade-A';
        if (grade >= 80) return 'grade-B';
        if (grade >= 70) return 'grade-C';
        if (grade >= 60) return 'grade-D';
        return 'grade-F';
    };

    /** Compute total earned and possible for a student (for overall view) */
    const getStudentTotal = (student: GradebookData['students'][0], assignList: GradebookData['assignments']) => {
        let earned = 0;
        let possible = 0;
        assignList.forEach(a => {
            const maxPts = a.points ?? 100;
            possible += maxPts;
            const cell = student.grades[a.id];
            const score = cell && typeof cell === 'object' && 'score' in cell ? cell.score : (cell as unknown as number | null);
            if (score != null) earned += score;
        });
        return { earned, possible };
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading gradebook...</div>;
    if (!data) return <div className="p-8 text-center text-red-500">Failed to load gradebook</div>;

    const { course, assignments, students } = data;

    const displayAssignments = gradebookView === 'assignments' && gradebookAssignmentIds.length > 0
        ? assignments.filter(a => gradebookAssignmentIds.includes(a.id))
        : assignments;
    const displayStudents = gradebookView === 'students' && gradebookStudentIds.length > 0
        ? students.filter(s => gradebookStudentIds.includes(s.id))
        : students;

    return (
        <div className="course-gradebook">
            {/* Header */}
            <div className="gradebook-header">
                <div>
                    <div className="breadcrumb">
                        <Link to={`${basePath}/courses/${courseId}`}>
                            <ChevronLeft size={14} />
                            Back to Course
                        </Link>
                        <span>/</span>
                        <span>Gradebook</span>
                    </div>
                    <h1 className="page-title">{course.name} Gradebook</h1>
                    <p className="page-subtitle">
                        {assignments.length} Assignments • {students.length} Students
                    </p>
                </div>

                <div className="gradebook-actions">
                    <button
                        onClick={() => {
                            setReportStep('select');
                            setShowReportModal(true);
                        }}
                        className="btn-report premium"
                    >
                        <BarChart2 size={18} />
                        Generate Insights Report
                    </button>
                    <button
                        onClick={() => setShowExportModal(true)}
                        className="btn-download"
                    >
                        <Download size={18} />
                        Download Grades
                    </button>
                </div>
            </div>

            {/* View mode: Overall | By assignment | By student */}
            <div className="gradebook-view-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    className={`gradebook-view-tab ${gradebookView === 'overall' ? 'active' : ''}`}
                    onClick={() => setGradebookView('overall')}
                >
                    Overall — all students with total grade
                </button>
                <button
                    type="button"
                    className={`gradebook-view-tab ${gradebookView === 'assignments' ? 'active' : ''}`}
                    onClick={() => setGradebookView('assignments')}
                >
                    Grade for specific assignments
                </button>
                <button
                    type="button"
                    className={`gradebook-view-tab ${gradebookView === 'students' ? 'active' : ''}`}
                    onClick={() => setGradebookView('students')}
                >
                    Grade for specific students
                </button>
            </div>

            {gradebookView === 'assignments' && (
                <div className="gradebook-selector-panel" style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Select assignments</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search assignments..."
                            value={assignmentSearchTerm}
                            onChange={e => setAssignmentSearchTerm(e.target.value)}
                            style={{ flex: '1', minWidth: '160px', maxWidth: '280px' }}
                        />
                        <button type="button" className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} onClick={() => setAssignmentSearchTerm(assignmentSearchTerm)} aria-label="Search assignments">
                            <Search size={16} /> Search
                        </button>
                        {assignmentSearchTerm && (
                            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem' }} onClick={() => setAssignmentSearchTerm('')}>Clear</button>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {assignments
                            .filter(a => !assignmentSearchTerm.trim() || a.title.toLowerCase().includes(assignmentSearchTerm.trim().toLowerCase()))
                            .map(a => (
                                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={gradebookAssignmentIds.includes(a.id)} onChange={e => setGradebookAssignmentIds(prev => e.target.checked ? [...prev, a.id] : prev.filter(id => id !== a.id))} />
                                    {a.title}
                                </label>
                            ))}
                    </div>
                    {assignments.filter(a => !assignmentSearchTerm.trim() || a.title.toLowerCase().includes(assignmentSearchTerm.trim().toLowerCase())).length === 0 && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{assignmentSearchTerm ? 'No assignments match your search.' : 'No assignments in this course.'}</p>
                    )}
                    {gradebookAssignmentIds.length === 0 && assignments.length > 0 && !assignmentSearchTerm && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Select one or more assignments to show grades.</p>}
                </div>
            )}

            {gradebookView === 'students' && (
                <div className="gradebook-selector-panel" style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Select students</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by name or ID..."
                            value={studentSearchTerm}
                            onChange={e => setStudentSearchTerm(e.target.value)}
                            style={{ flex: '1', minWidth: '160px', maxWidth: '280px' }}
                        />
                        <button type="button" className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} onClick={() => setStudentSearchTerm(studentSearchTerm)} aria-label="Search students">
                            <Search size={16} /> Search
                        </button>
                        {studentSearchTerm && (
                            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem' }} onClick={() => setStudentSearchTerm('')}>Clear</button>
                        )}
                    </div>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {students
                            .filter(s => !studentSearchTerm.trim() || s.name.toLowerCase().includes(studentSearchTerm.trim().toLowerCase()) || (s.id && String(s.id).toLowerCase().includes(studentSearchTerm.trim().toLowerCase())))
                            .map(s => (
                                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={gradebookStudentIds.includes(s.id)} onChange={e => setGradebookStudentIds(prev => e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id))} />
                                    {s.name} ({s.id})
                                </label>
                            ))}
                    </div>
                    {students.filter(s => !studentSearchTerm.trim() || s.name.toLowerCase().includes(studentSearchTerm.trim().toLowerCase()) || (s.id && String(s.id).toLowerCase().includes(studentSearchTerm.trim().toLowerCase()))).length === 0 && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{studentSearchTerm ? 'No students match your search.' : 'No students in this course.'}</p>
                    )}
                    {gradebookStudentIds.length === 0 && students.length > 0 && !studentSearchTerm && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Select one or more students to show grades.</p>}
                </div>
            )}

            {/* Gradebook Table */}
            <div className="gradebook-table-container">
                {(gradebookView === 'assignments' && gradebookAssignmentIds.length === 0) || (gradebookView === 'students' && gradebookStudentIds.length === 0) ? (
                    <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Select items above to view grades.</p>
                ) : (
                    <table className="gradebook-table">
                        <thead>
                            <tr>
                                <th style={{ position: 'sticky', left: 0, zIndex: 10 }}>Student Name</th>
                                <th>Student ID</th>
                                {displayAssignments.map(a => (
                                    <th key={a.id}>
                                        <div className="flex flex-col">
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                <span>{a.title}</span>
                                                <span style={{ fontSize: '0.75em', fontWeight: 'normal', color: '#9ca3af' }}>
                                                    ({a.points || 100} pts)
                                                </span>
                                            </div>
                                        </div>
                                    </th>
                                ))}
                                {gradebookView === 'overall' && (
                                    <th style={{ background: 'var(--bg-surface)', fontWeight: 700 }}>Total</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {displayStudents.map(student => {
                                const { earned, possible } = getStudentTotal(student, displayAssignments);
                                const totalPct = possible > 0 ? Math.round((earned / possible) * 100) : null;
                                return (
                                    <tr key={student.id}>
                                        <td style={{ position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 10, borderRight: '1px solid var(--border-color)' }}>
                                            <div className="student-name">{student.name}</div>
                                        </td>
                                        <td>
                                            <div className="student-id">{student.id}</div>
                                        </td>
                                        {displayAssignments.map(a => {
                                            const cell = student.grades[a.id];
                                            const score = cell && typeof cell === 'object' && 'score' in cell ? cell.score : (cell as unknown as number | null);
                                            const status: GradeCellStatus = cell && typeof cell === 'object' && 'status' in cell ? (cell as GradeCell).status : (score != null ? 'graded' : 'missing');
                                            const isGraded = score !== null && score !== undefined;
                                            return (
                                                <td key={a.id}>
                                                    {isGraded ? (
                                                        <span className={`grade-badge ${getGradeClass(score)}`}>
                                                            {formatGrade(score)}
                                                        </span>
                                                    ) : (
                                                        <span className={`grade-cell-status grade-status-${status}`} title={status === 'submitted' ? 'Submitted, not yet graded' : status === 'missing' ? 'Past due, not submitted' : 'Not submitted'}>
                                                            {status === 'submitted' ? 'Ungraded' : status === 'missing' ? 'Missing' : 'Not submitted'}
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        {gradebookView === 'overall' && (
                                            <td style={{ background: 'var(--bg-surface)', fontWeight: 600 }}>
                                                {possible > 0 ? (
                                                    <span className={totalPct != null ? `grade-badge ${getGradeClass(totalPct)}` : ''}>
                                                        {formatGrade(earned)} / {possible}
                                                        {totalPct != null && <span style={{ marginLeft: '0.35rem', fontSize: '0.85em', color: 'var(--text-secondary)' }}>({totalPct}%)</span>}
                                                    </span>
                                                ) : (
                                                    <span className="grade-cell-status grade-status-not_submitted">—</span>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Export Modal */}
            {showExportModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Export Grades</h3>
                            <button onClick={() => setShowExportModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                Choose what you want to export and in which format.
                            </p>

                            {/* Scope selection: whole course vs single student */}
                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => setExportScope('course')}
                                    className={`report-chip ${exportScope === 'course' ? 'selected' : ''}`}
                                >
                                    Whole course
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setExportScope('student')}
                                    className={`report-chip ${exportScope === 'student' ? 'selected' : ''}`}
                                >
                                    Single student
                                </button>
                            </div>

                            {exportScope === 'student' && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                                        Select student
                                    </label>
                                    <select
                                        value={selectedStudentId}
                                        onChange={e => setSelectedStudentId(e.target.value)}
                                        className="gradebook-select"
                                    >
                                        <option value="">Choose a student…</option>
                                        {students.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.name} ({s.id})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="report-grid">
                                <label className={`report-card-btn ${exportFormat === 'csv' ? 'selected' : ''}`}>
                                    <div className="report-card-header">
                                        <input
                                            type="radio"
                                            name="format"
                                            value="csv"
                                            checked={exportFormat === 'csv'}
                                            onChange={() => setExportFormat('csv')}
                                            style={{ display: 'none' }}
                                        />
                                        <div className="icon-box"><FileText size={24} /></div>
                                        <div className="report-title">CSV Format</div>
                                    </div>
                                    <div className="report-desc">Best for importing into legacy systems.</div>
                                </label>

                                <label className={`report-card-btn ${exportFormat === 'excel' ? 'selected' : ''}`}>
                                    <div className="report-card-header">
                                        <input
                                            type="radio"
                                            name="format"
                                            value="excel"
                                            checked={exportFormat === 'excel'}
                                            onChange={() => setExportFormat('excel')}
                                            style={{ display: 'none' }}
                                        />
                                        <div className="icon-box"><FileSpreadsheet size={24} /></div>
                                        <div className="report-title">Excel Format</div>
                                    </div>
                                    <div className="report-desc">Formatted spreadsheet with styles.</div>
                                </label>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="btn-report"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDownload}
                                className="btn-report-action"
                                disabled={exportScope === 'student' && !selectedStudentId}
                            >
                                Download {exportFormat.toUpperCase()}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Report Generation Modal */}
            {showReportModal && (
                <div className="modal-overlay">
                    <div className={`modal-content ${reportStep === 'view' ? 'large' : ''}`}>
                        <div className="modal-header">
                            <h3>{reportStep === 'select' ? 'Generate Grade Report' : 'Grade Report'}</h3>
                            <button onClick={() => setShowReportModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {reportStep === 'select' ? (
                                <>
                                <div className="report-grid">
                                    <button
                                        onClick={() => setReportType('summary')}
                                        className={`report-card-btn ${reportType === 'summary' ? 'selected' : ''}`}
                                    >
                                        <div className="report-card-header">
                                            <div className="icon-box"><PieChart size={24} /></div>
                                            <div className="report-title">Course Summary</div>
                                        </div>
                                        <div className="report-desc">Averages, distribution, and overall class health.</div>
                                    </button>

                                    <button
                                        onClick={() => setReportType('missing')}
                                        className={`report-card-btn ${reportType === 'missing' ? 'selected' : ''}`}
                                    >
                                        <div className="report-card-header">
                                            <div className="icon-box"><BarChart2 size={24} /></div>
                                            <div className="report-title">Missing Grades</div>
                                        </div>
                                        <div className="report-desc">Identify students who are falling behind.</div>
                                    </button>

                                    <button
                                        onClick={() => setReportType('grades')}
                                        className={`report-card-btn ${reportType === 'grades' ? 'selected' : ''}`}
                                    >
                                        <div className="report-card-header">
                                            <div className="icon-box"><Download size={24} /></div>
                                            <div className="report-title">Student grades</div>
                                        </div>
                                        <div className="report-desc">Display selected students&apos; grades across multiple or all assignments.</div>
                                    </button>
                                </div>

                                {reportType === 'grades' && data && (
                                    <div className="report-grades-select" style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem' }}>Select students and assignments</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                                                    <input type="checkbox" checked={reportStudentIds === null} onChange={e => { if (e.target.checked) setReportStudentIds(null); }} />
                                                    All students ({data.students.length})
                                                </label>
                                                {reportStudentIds !== null && (
                                                    <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.5rem' }}>
                                                        {data.students.map(s => (
                                                            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.875rem' }}>
                                                                <input type="checkbox" checked={reportStudentIds.includes(s.id)} onChange={e => { setReportStudentIds(prev => e.target.checked ? [...(prev || []), s.id] : (prev || []).filter(id => id !== s.id)); }} />
                                                                {s.name} ({s.id})
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                                {reportStudentIds !== null && (
                                                    <button type="button" className="btn-report" style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setReportStudentIds(null)}>Select all</button>
                                                )}
                                                {reportStudentIds === null && (
                                                    <button type="button" className="btn-report" style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setReportStudentIds([])}>Choose specific students</button>
                                                )}
                                            </div>
                                            <div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                                                    <input type="checkbox" checked={reportAssignmentIds === null} onChange={e => { if (e.target.checked) setReportAssignmentIds(null); }} />
                                                    All assignments ({data.assignments.length})
                                                </label>
                                                {reportAssignmentIds !== null && (
                                                    <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.5rem' }}>
                                                        {data.assignments.map(a => (
                                                            <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.875rem' }}>
                                                                <input type="checkbox" checked={reportAssignmentIds.includes(a.id)} onChange={e => { setReportAssignmentIds(prev => e.target.checked ? [...(prev || []), a.id] : (prev || []).filter(id => id !== a.id)); }} />
                                                                {a.title}
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                                {reportAssignmentIds !== null && (
                                                    <button type="button" className="btn-report" style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setReportAssignmentIds(null)}>Select all</button>
                                                )}
                                                {reportAssignmentIds === null && (
                                                    <button type="button" className="btn-report" style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setReportAssignmentIds([])}>Choose specific assignments</button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                </>
                            ) : (
                                <div className="report-view">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', background: 'var(--light-grey)', padding: '1rem', borderRadius: '8px' }}>
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{course.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{course.id} • {course.term}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Generated on</div>
                                            <div>{new Date().toLocaleDateString()}</div>
                                        </div>
                                    </div>

                                    {/* Student grades table (selected students × selected assignments) */}
                                    {reportType === 'grades' && (
                                        <div style={{ marginBottom: '2rem' }}>
                                            <h4 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <BarChart2 size={18} /> Grades — {reportGradesStudents.length} student{reportGradesStudents.length !== 1 ? 's' : ''}, {reportGradesAssignments.length} assignment{reportGradesAssignments.length !== 1 ? 's' : ''}
                                            </h4>
                                            <div className="missing-table-container" style={{ overflowX: 'auto' }}>
                                                <table className="gradebook-table report-grades-table">
                                                    <thead>
                                                        <tr>
                                                            <th style={{ position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 2 }}>Student</th>
                                                            <th>ID</th>
                                                            {reportGradesAssignments.map(a => (
                                                                <th key={a.id}>{a.title} ({a.points ?? 100})</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {reportGradesStudents.map(student => (
                                                            <tr key={student.id}>
                                                                <td style={{ position: 'sticky', left: 0, background: 'var(--bg-surface)', fontWeight: 500 }}>{student.name}</td>
                                                                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{student.id}</td>
                                                                {reportGradesAssignments.map(a => {
                                                                    const cell = student.grades[a.id];
                                                                    const score = cell && typeof cell === 'object' && 'score' in cell ? cell.score : (cell as unknown as number | null);
                                                                    const status: GradeCellStatus = cell && typeof cell === 'object' && 'status' in cell ? (cell as GradeCell).status : (score != null ? 'graded' : 'missing');
                                                                    const isGraded = score !== null && score !== undefined;
                                                                    return (
                                                                        <td key={a.id}>
                                                                            {isGraded ? (
                                                                                <span className={`grade-badge ${getGradeClass(score)}`}>{formatGrade(score)}</span>
                                                                            ) : (
                                                                                <span className={`grade-cell-status grade-status-${status}`}>
                                                                                    {status === 'submitted' ? 'Ungraded' : status === 'missing' ? 'Missing' : 'Not submitted'}
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Key Metrics */}
                                    {(reportType === 'summary' && reportStats) && (
                                        <div className="stats-grid">
                                            <div className="stat-card blue">
                                                <div className="stat-label">Class Average</div>
                                                <div className="stat-value">{reportStats.average.toFixed(1)}%</div>
                                                <div className="stat-sub">Based on {reportStats.gradedAssignments} assignments</div>
                                                <div className="stat-icon"><PieChart size={80} /></div>
                                            </div>
                                            <div className="stat-card green">
                                                <div className="stat-label">Submission Rate</div>
                                                <div className="stat-value">{reportStats.submissionRate.toFixed(1)}%</div>
                                                <div className="stat-sub">Active engagement</div>
                                                <div className="stat-icon"><BarChart2 size={80} /></div>
                                            </div>
                                            <div className="stat-card purple">
                                                <div className="stat-label">Highest Score</div>
                                                <div className="stat-value">{reportStats.highest}%</div>
                                                <div className="stat-sub">Top performer</div>
                                            </div>
                                            <div className="stat-card white">
                                                <div className="stat-label">Total Students</div>
                                                <div className="stat-value">{reportStats.totalStudents}</div>
                                                <div className="stat-sub">Enrolled</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Grade Distribution */}
                                    {(reportType === 'summary' && reportStats) && (
                                        <div style={{ marginBottom: '2rem' }}>
                                            <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <PieChart size={18} /> Grade Distribution
                                            </h4>
                                            <div className="stat-card white">
                                                <div className="distribution-chart">
                                                    {Object.entries(reportStats.distribution).map(([grade, count]) => {
                                                        const max = Math.max(...Object.values(reportStats.distribution));
                                                        const height = max ? (count / max) * 100 : 0;
                                                        return (
                                                            <div key={grade} className="dist-bar-group">
                                                                <div className="dist-bar" style={{ height: `${height}%` }}></div>
                                                                <div className="dist-label">{grade}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{count}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Ungraded, Missing, Not Submitted */}
                                    {(reportType === 'missing' || reportType === 'summary') && reportStats && (reportStats.ungraded.length > 0 || reportStats.missing.length > 0 || reportStats.notSubmitted.length > 0) && (
                                        <div>
                                            <h4 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <BarChart2 size={18} /> Assignments by status
                                            </h4>
                                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                                Each student&apos;s scores are in the gradebook table. Below: items that are ungraded, missing, or not yet submitted.
                                            </p>
                                            {reportStats.ungraded.length > 0 && (
                                                <div style={{ marginBottom: '1.25rem' }}>
                                                    <h5 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Ungraded ({reportStats.ungraded.length}) — submitted, not yet graded</h5>
                                                    <div className="missing-table-container">
                                                        <table className="missing-table">
                                                            <thead><tr><th>Student</th><th>Assignment</th></tr></thead>
                                                            <tbody>
                                                                {reportStats.ungraded.map((item, i) => (
                                                                    <tr key={i}><td><b>{item.student}</b></td><td>{item.assignment}</td></tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                            {reportStats.missing.length > 0 && (
                                                <div style={{ marginBottom: '1.25rem' }}>
                                                    <h5 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Missing ({reportStats.missing.length}) — past due, not submitted</h5>
                                                    <div className="missing-table-container">
                                                        <table className="missing-table">
                                                            <thead><tr><th>Student</th><th>Assignment</th></tr></thead>
                                                            <tbody>
                                                                {reportStats.missing.map((item, i) => (
                                                                    <tr key={i}><td><b>{item.student}</b></td><td>{item.assignment}</td></tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                            {reportStats.notSubmitted.length > 0 && (
                                                <div style={{ marginBottom: '1.25rem' }}>
                                                    <h5 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Not submitted ({reportStats.notSubmitted.length}) — due later or no submission yet</h5>
                                                    <div className="missing-table-container">
                                                        <table className="missing-table">
                                                            <thead><tr><th>Student</th><th>Assignment</th></tr></thead>
                                                            <tbody>
                                                                {reportStats.notSubmitted.map((item, i) => (
                                                                    <tr key={i}><td><b>{item.student}</b></td><td>{item.assignment}</td></tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            {reportStep === 'select' ? (
                                <>
                                    <button onClick={() => setShowReportModal(false)} className="btn-report">Cancel</button>
                                    <button
                                        onClick={generateReport}
                                        className="btn-report-action"
                                        disabled={reportType === 'grades' && (
                                            (reportStudentIds !== null && reportStudentIds.length === 0) ||
                                            (reportAssignmentIds !== null && reportAssignmentIds.length === 0)
                                        )}
                                    >
                                        Generate Report
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => setReportStep('select')} className="btn-report">Back</button>
                                    <button onClick={() => window.print()} className="btn-report-action">
                                        <Printer size={18} /> Print Report
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CourseGradebook;
