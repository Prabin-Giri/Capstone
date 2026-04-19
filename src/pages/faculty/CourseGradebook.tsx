import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { getCourseGrades, getCourseGradesExportUrl, getCourseCatalogId } from '../../lib/api';
import type { GradebookData, CourseGradesExportType } from '../../lib/api';
import { Download, FileSpreadsheet, FileText, BarChart2, Printer, X, PieChart, Search, Filter, FileDown } from 'lucide-react';
import './CourseGradebook.css';

function triggerDownload(url: string) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string | number) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function escapeHtml(value: string | number) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

type CellStatus = 'graded' | 'ungraded' | 'missing' | 'not_submitted';

interface AssignmentStat {
    assignmentId: string;
    assignmentTitle: string;
    mean: number;
    median: number;
    highest: number;
    lowest: number;
    count: number;
}

interface ReportStats {
    average: number;
    median: number;
    highest: number;
    lowest: number;
    submissionRate: number;
    distribution: Record<string, number>;
    missingGrades: { student: string; assignment: string; status: 'ungraded' | 'missing' | 'not_submitted' }[];
    totalStudents: number;
    gradedAssignments: number;
    /** Per-assignment: mean, median, highest, lowest */
    assignmentStats: AssignmentStat[];
    /** Per-student, per-assignment: score (percentage) or status */
    studentRows: { studentName: string; studentId: string; cells: { assignmentId: string; assignmentTitle: string; score: number | null; rawScore: number | null; status: CellStatus }[] }[];
    /** When scope is student or assignment */
    scopeStudentId?: string;
    scopeStudentName?: string;
    scopeAssignmentId?: string;
    scopeAssignmentTitle?: string;
}

const CourseGradebook: React.FC = () => {
    const { courseId } = useParams();
    const { pathname, search } = useLocation();
    const basePath = pathname.startsWith('/ta') ? '/ta' : '/faculty';
    const assignmentFilterFromQuery = useMemo(() => {
        const value = new URLSearchParams(search).get('assignmentId');
        return value ? value.trim() : '';
    }, [search]);
    const studentFilterFromQuery = useMemo(() => {
        const value = new URLSearchParams(search).get('studentId');
        return value ? value.trim() : '';
    }, [search]);
    const [data, setData] = useState<GradebookData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('csv');
    const [exportType, setExportType] = useState<CourseGradesExportType>('assignments');
    const [exportStudentId, setExportStudentId] = useState('');
    const [exportStudentSearch, setExportStudentSearch] = useState('');
    const [exportAssignmentIds, setExportAssignmentIds] = useState<string[]>([]);
    const [exportAssignmentSearch, setExportAssignmentSearch] = useState('');
    const [showTableExportModal, setShowTableExportModal] = useState(false);

    // Report State
    const [reportStep, setReportStep] = useState<'select' | 'view'>('select');
    const [reportType, setReportType] = useState<'summary' | 'missing' | 'insights'>('summary');
    const [reportStats, setReportStats] = useState<ReportStats | null>(null);
    const [reportScope, setReportScope] = useState<'overall' | 'student' | 'assignment'>('overall');
    const [reportScopeStudentId, setReportScopeStudentId] = useState('');
    const [reportScopeAssignmentId, setReportScopeAssignmentId] = useState('');

    // Filters
    const [filterStudent, setFilterStudent] = useState(studentFilterFromQuery);
    const [filterAssignmentId, setFilterAssignmentId] = useState<string>(assignmentFilterFromQuery); // '' = all

    useEffect(() => {
        if (courseId) {
            loadGradebook();
        }
    }, [courseId]);

    useEffect(() => {
        setFilterAssignmentId(assignmentFilterFromQuery);
    }, [assignmentFilterFromQuery]);

    useEffect(() => {
        setFilterStudent(studentFilterFromQuery);
    }, [studentFilterFromQuery]);

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
        if (exportType === 'student' && !exportStudentId) return;
        if ((exportType === 'assignments' || exportType === 'final') && exportAssignmentIds.length === 0) return;
        const url = getCourseGradesExportUrl(courseId, exportFormat, {
            type: exportType,
            ...(exportType === 'student' && exportStudentId ? { studentId: exportStudentId } : {}),
            ...((exportType === 'assignments' || exportType === 'final') && exportAssignmentIds.length > 0 ? { assignmentIds: exportAssignmentIds } : {}),
        });
        triggerDownload(url);
        setShowExportModal(false);
    };

    // When opening export modal, default to all assignments selected
    useEffect(() => {
        if (showExportModal && data) {
            setExportAssignmentIds(data.assignments.map(a => a.id));
        }
    }, [showExportModal, data?.assignments?.length]);

    const getCellStatus = (student: GradebookData['students'][0], assignmentId: string): CellStatus => {
        const grade = student.grades[assignmentId];
        if (grade !== null && grade !== undefined) return 'graded';
        const submitted = student.submitted?.[assignmentId];
        if (submitted) return 'ungraded';
        
        // Find assignment to check due date
        const assignment = data?.assignments.find(a => a.id === assignmentId);
        if (assignment?.due_date) {
            const dueDate = new Date(assignment.due_date);
            const now = new Date();
            if (now > dueDate) return 'missing';
        }
        
        return 'not_submitted';
    };

    const generateReport = () => {
        if (!data) return;

        const { students, assignments } = data;
        const allGrades: number[] = [];
        let totalPossibleGrades = students.length * assignments.length;
        let actualGradesCount = 0;
        const missingGrades: { student: string; assignment: string; status: 'ungraded' | 'missing' | 'not_submitted' }[] = [];
        const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

        const studentRowsFull = students.map(student => {
            const cells = assignments.map(assignment => {
                const rawGrade = student.grades[assignment.id];
                const status = getCellStatus(student, assignment.id);
                
                let grade = null;
                if (status === 'graded' && rawGrade != null) {
                    const pointsPossible = assignment.points || 100;
                    grade = pointsPossible > 0 ? (rawGrade / pointsPossible) * 100 : 0;
                    
                    allGrades.push(grade);
                    actualGradesCount++;
                    if (grade >= 90) distribution.A++;
                    else if (grade >= 80) distribution.B++;
                    else if (grade >= 70) distribution.C++;
                    else if (grade >= 60) distribution.D++;
                    else distribution.F++;
                } else {
                    missingGrades.push({ student: student.name, assignment: assignment.title, status: status as 'ungraded' | 'missing' | 'not_submitted' });
                }
                
                return {
                    assignmentId: assignment.id,
                    assignmentTitle: assignment.title,
                    score: grade ?? null,
                    rawScore: (status === 'graded' ? rawGrade : null) as number | null,
                    status: status as CellStatus
                };
            });
            return { studentName: student.name, studentId: student.id, cells };
        });

        const assignmentStats: AssignmentStat[] = assignments.map(a => {
            const grades = students
                .map(s => s.grades[a.id])
                .filter((g): g is number => g != null && typeof g === 'number');
            const sorted = [...grades].sort((x, y) => x - y);
            const sum = grades.reduce((acc, g) => acc + g, 0);
            const mean = grades.length ? sum / grades.length : 0;
            const median = sorted.length
                ? sorted.length % 2 === 1
                    ? sorted[Math.floor(sorted.length / 2)]
                    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                : 0;
            const highest = sorted.length ? sorted[sorted.length - 1] : 0;
            const lowest = sorted.length ? sorted[0] : 0;
            return {
                assignmentId: a.id,
                assignmentTitle: a.title,
                mean,
                median,
                highest,
                lowest,
                count: grades.length
            };
        });

        let studentRows = studentRowsFull;
        let scopeStudentId: string | undefined;
        let scopeStudentName: string | undefined;
        let scopeAssignmentId: string | undefined;
        let scopeAssignmentTitle: string | undefined;

        if (reportScope === 'student' && reportScopeStudentId) {
            studentRows = studentRowsFull.filter(r => r.studentId === reportScopeStudentId);
            const st = students.find(s => s.id === reportScopeStudentId);
            if (st) {
                scopeStudentId = st.id;
                scopeStudentName = st.name;
            }
        } else if (reportScope === 'assignment' && reportScopeAssignmentId) {
            const a = assignments.find(x => x.id === reportScopeAssignmentId);
            if (a) {
                scopeAssignmentId = a.id;
                scopeAssignmentTitle = a.title;
                studentRows = studentRowsFull.map(row => ({
                    ...row,
                    cells: row.cells.filter(c => c.assignmentId === reportScopeAssignmentId)
                }));
            }
        }

        allGrades.sort((a, b) => a - b);
        const sum = allGrades.reduce((a, b) => a + b, 0);
        const average = allGrades.length ? sum / allGrades.length : 0;
        const median = allGrades.length
            ? allGrades.length % 2 === 1
                ? allGrades[Math.floor(allGrades.length / 2)]
                : (allGrades[allGrades.length / 2 - 1] + allGrades[allGrades.length / 2]) / 2
            : 0;

        const newStats: ReportStats = {
            average,
            median,
            highest: allGrades.length ? allGrades[allGrades.length - 1] : 0,
            lowest: allGrades.length ? allGrades[0] : 0,
            submissionRate: totalPossibleGrades ? (actualGradesCount / totalPossibleGrades) * 100 : 0,
            distribution,
            missingGrades,
            totalStudents: students.length,
            gradedAssignments: assignments.length,
            assignmentStats,
            studentRows,
            scopeStudentId,
            scopeStudentName,
            scopeAssignmentId,
            scopeAssignmentTitle
        };
        setReportStats(newStats);
        setReportStep('view');

        const html = buildReportHtml({ stats: newStats, course: data.course, reportType });
        if (html) {
            const w = window.open('', '_blank');
            if (w) {
                w.document.write(html);
                w.document.close();
            }
        }
    };

    const getGradeClass = (grade: number, pointsPossible: number = 100) => {
        const pct = pointsPossible > 0 ? (grade / pointsPossible) * 100 : 0;
        if (pct >= 90) return 'grade-A';
        if (pct >= 80) return 'grade-B';
        if (pct >= 70) return 'grade-C';
        if (pct >= 60) return 'grade-D';
        return 'grade-F';
    };

    const buildReportHtml = (override?: { stats: ReportStats; course: { name: string; id: string; term: string }; reportType: 'summary' | 'missing' | 'insights' }): string => {
        const stats = override?.stats ?? reportStats;
        const course = override?.course ?? data?.course;
        const type = override?.reportType ?? reportType;
        if (!stats || !course) return '';
        const gc = (score: number) => score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
        const assignmentRows = (stats.scopeAssignmentId
            ? stats.assignmentStats.filter(a => a.assignmentId === stats.scopeAssignmentId)
            : stats.assignmentStats
        ).map(a => `
            <tr>
                <td>${stats.scopeAssignmentId ? `<b>${escapeHtml(a.assignmentTitle)}</b>` : escapeHtml(a.assignmentTitle)}</td>
                <td>${a.count ? a.mean.toFixed(2) : '—'}</td>
                <td>${a.count ? a.median.toFixed(2) : '—'}</td>
                <td>${a.count ? a.highest.toFixed(2) : '—'}</td>
                <td>${a.count ? a.lowest.toFixed(2) : '—'}</td>
                <td>${a.count}</td>
            </tr>`).join('');
        const studentHeaderCells = stats.studentRows[0]?.cells.map(c => `<th>${escapeHtml(c.assignmentTitle)}</th>`).join('') ?? '';
        const studentRows = stats.studentRows.map(row => {
            const cells = row.cells.map(c => {
                if (c.status === 'graded' && c.score != null && c.rawScore != null) return `<td><span class="badge grade-${gc(c.score)}">${c.rawScore.toFixed(2)}</span></td>`;
                if (c.status === 'ungraded') return '<td><span class="badge ungraded">Ungraded</span></td>';
                if (c.status === 'missing') return '<td><span class="badge missing">Missing</span></td>';
                return '<td><span class="badge upcoming">Not submitted</span></td>';
            }).join('');
            return `<tr><td><b>${escapeHtml(row.studentName)}</b></td><td>${escapeHtml(row.studentId)}</td>${cells}</tr>`;
        }).join('');
        const distRows = type === 'summary' && stats.distribution
            ? Object.entries(stats.distribution).map(([grade, count]) => {
                const max = Math.max(...Object.values(stats.distribution));
                const pct = max ? ((count / max) * 100).toFixed(0) : '0';
                return `<div class="dist-item"><div class="dist-bar" style="height:${pct}%"></div><span>${grade}</span><span>${count}</span></div>`;
            }).join('')
            : '';
        const missingRows = stats.missingGrades.map(m => {
            let label = 'Not submitted';
            let cls = 'upcoming';
            if (m.status === 'ungraded') { label = 'Ungraded'; cls = 'ungraded'; }
            else if (m.status === 'missing') { label = 'Missing'; cls = 'missing'; }
            
            return `<tr><td><b>${escapeHtml(m.student)}</b></td><td>${escapeHtml(m.assignment)}</td>
            <td><span class="badge ${cls}">${label}</span></td></tr>`;
        }).join('');
        const scopeLine = stats.scopeStudentName
            ? `<p><strong>Summary for student:</strong> ${escapeHtml(stats.scopeStudentName)}</p>`
            : stats.scopeAssignmentTitle
                ? `<p><strong>Summary for assignment:</strong> ${escapeHtml(stats.scopeAssignmentTitle)}</p>`
                : '';
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><title>Insights Report – ${escapeHtml(course.name)}</title>
<style>
*{box-sizing:border-box} body{font-family:system-ui,sans-serif;margin:1.5rem;color:#1a1a1a;max-width:1200px}
.header{display:flex;justify-content:space-between;align-items:flex-start;background:#f0f0f0;padding:1rem;border-radius:8px;margin-bottom:1.5rem}
.actions{display:flex;gap:0.75rem;margin-bottom:1.5rem;flex-wrap:wrap}
.btn{padding:0.5rem 1rem;border-radius:6px;cursor:pointer;font-weight:600;border:1px solid #ccc;background:#fff}
.btn-primary{background:#6b2d3c;color:#fff;border-color:#6b2d3c}
h2{margin:1rem 0 0.5rem;font-size:1.1rem}
table{width:100%;border-collapse:collapse;margin-bottom:1.5rem}
th,td{border:1px solid #ddd;padding:0.5rem 0.75rem;text-align:left}
th{background:#f5f5f5;font-weight:600}
.badge{padding:0.2rem 0.5rem;border-radius:4px;font-size:0.85em}
.grade-A, .grade-B, .grade-C, .grade-D{background:#d4edda;color:#155724}
.badge.grade-F{background:#f8d7da;color:#721c24}
.badge.ungraded{background:#fff3cd;color:#856404}
.badge.missing{background:#f8d7da;color:#721c24}
.badge.upcoming{background:#e9ecef;color:#6c757d}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:1rem;margin-bottom:1.5rem}
.stat{background:#f8f9fa;padding:1rem;border-radius:8px;text-align:center}
.stat-label{font-size:0.8rem;color:#666}
.stat-value{font-size:1.25rem;font-weight:700}
.dist-chart{display:flex;gap:1rem;align-items:flex-end;margin:1rem 0}
.dist-item{display:flex;flex-direction:column;align-items:center;gap:0.25rem}
.dist-bar{width:32px;min-height:4px;background:#6b2d3c;border-radius:4px}
@media print{.actions{display:none!important}}
</style>
</head>
<body>
<div class="header">
<div>
<h1 style="margin:0">${escapeHtml(course.name)}</h1>
<p style="margin:0.25rem 0 0;font-size:0.9rem;color:#666">${escapeHtml(getCourseCatalogId(course))} • ${escapeHtml(course.term)}</p>
${scopeLine}
</div>
<div style="text-align:right">
<div style="font-size:0.8rem;color:#666">Generated on</div>
<div>${new Date().toLocaleDateString()}</div>
</div>
</div>
<div class="actions no-print">
<button class="btn btn-primary" onclick="window.print()">Download PDF</button>
</div>
${stats.assignmentStats.length > 0 ? `
<h2>Per-assignment statistics</h2>
<table>
<thead><tr><th>Assignment</th><th>Mean</th><th>Median</th><th>Highest</th><th>Lowest</th><th>Graded (n)</th></tr></thead>
<tbody>${assignmentRows}</tbody>
</table>` : ''}
${stats.studentRows.length > 0 ? `
<h2>Student scores</h2>
<table>
<thead><tr><th>Student Name</th><th>Student ID</th>${studentHeaderCells}</tr></thead>
<tbody>${studentRows}</tbody>
</table>` : ''}
${type === 'summary' && stats ? `
<h2>Key metrics</h2>
<div class="stats">
<div class="stat"><div class="stat-label">Class Average</div><div class="stat-value">${stats.average.toFixed(1)}%</div></div>
<div class="stat"><div class="stat-label">Median</div><div class="stat-value">${stats.median.toFixed(1)}%</div></div>
<div class="stat"><div class="stat-label">Highest</div><div class="stat-value">${stats.highest}%</div></div>
<div class="stat"><div class="stat-label">Lowest</div><div class="stat-value">${stats.lowest}%</div></div>
<div class="stat"><div class="stat-label">Submission rate</div><div class="stat-value">${stats.submissionRate.toFixed(1)}%</div></div>
<div class="stat"><div class="stat-label">Total students</div><div class="stat-value">${stats.totalStudents}</div></div>
</div>
${distRows ? `<h2>Grade distribution</h2><div class="dist-chart">${distRows}</div>` : ''}` : ''}
${stats.missingGrades.length > 0 ? `
<h2>Missing grades (${stats.missingGrades.length})</h2>
<table>
<thead><tr><th>Student</th><th>Assignment</th><th>Status</th></tr></thead>
<tbody>${missingRows}</tbody>
</table>` : ''}
</body>
</html>`;
    };

    const escapeHtml = (s: string) =>
        String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    const openReportInNewTab = () => {
        const html = buildReportHtml();
        if (!html) return;
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(html);
        w.document.close();
    };

    const downloadReportPdf = () => {
        const html = buildReportHtml();
        if (!html) return;
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 250);
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading gradebook...</div>;
    if (!data) return <div className="p-8 text-center text-red-500">Failed to load gradebook</div>;

    const { course, assignments, students } = data;
    const q = filterStudent.trim().toLowerCase();
    const filteredStudents = q
        ? students.filter(s => s.name.toLowerCase().includes(q) || (s.id && String(s.id).toLowerCase().includes(q)) || (s.email && s.email.toLowerCase().includes(q)))
        : students;
    const filteredAssignments = filterAssignmentId
        ? assignments.filter(a => a.id === filterAssignmentId)
        : assignments;
    const showSummaryColumns = filterAssignmentId === '';

    const showOverall = filterStudent !== '' || filterAssignmentId !== '';

    const getStudentTotals = (student: typeof students[0]) => {
        const possible = filteredAssignments.reduce((sum, a) => sum + (a.points || 100), 0);
        const earned = filteredAssignments.reduce((sum, a) => {
            const g = student.grades[a.id];
            return sum + (g !== null && g !== undefined ? Number(g) : 0);
        }, 0);
        const percentage = possible > 0 ? (earned / possible) * 100 : null;
        return { earned, possible, percentage };
    };

    const visibleExportAssignments = data?.assignments.filter(a => !exportAssignmentSearch.trim() || a.title.toLowerCase().includes(exportAssignmentSearch.trim().toLowerCase())) ?? [];
    const visibleExportStudents = data?.students.filter(s => !exportStudentSearch.trim() || s.name.toLowerCase().includes(exportStudentSearch.trim().toLowerCase()) || (s.id && String(s.id).toLowerCase().includes(exportStudentSearch.trim().toLowerCase()))) ?? [];
    const selectedExportStudent = data?.students.find(s => s.id === exportStudentId) ?? null;
    const exportDisabled = (exportType === 'student' && !exportStudentId) || ((exportType === 'assignments' || exportType === 'final') && exportAssignmentIds.length === 0);
    const selectedAssignment = filterAssignmentId ? assignments.find(a => a.id === filterAssignmentId) ?? null : null;
    const currentTableColumns = [
        'Student Name',
        'Student ID',
        ...filteredAssignments.map(a => `${a.title} (${a.points || 100} pts)`),
        ...(showSummaryColumns ? ['Total', 'Percentage'] : []),
    ];
    const currentTableRows = filteredStudents.map(student => {
        const assignmentCells = filteredAssignments.map(a => {
            const grade = student.grades[a.id];
            const isGraded = grade !== null && grade !== undefined;
            const hasSubmission = student.submitted?.[a.id];
            if (isGraded) return Number(grade).toFixed(2);
            if (hasSubmission) return 'Ungraded';
            return getCellStatus(student, a.id) === 'missing' ? 'Missing' : 'Not submitted';
        });
        const totals = getStudentTotals(student);
        return [
            student.name,
            student.id,
            ...assignmentCells,
            ...(showSummaryColumns ? [
                totals.possible > 0 ? `${totals.earned.toFixed(0)}/${totals.possible.toFixed(0)}` : '—',
                totals.percentage !== null ? `${totals.percentage.toFixed(1)}%` : '—',
            ] : []),
        ];
    });

    const handleDownloadCurrentTable = (format: 'csv' | 'excel') => {
        const safeCourseName = course.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
        const safeScope = selectedAssignment?.title ? selectedAssignment.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') : 'all_assignments';
        const fileBase = `${safeCourseName || 'course'}_${safeScope || 'gradebook'}_table`;

        if (format === 'csv') {
            const csv = [currentTableColumns, ...currentTableRows]
                .map(row => row.map(escapeCsvValue).join(','))
                .join('\n');
            downloadBlob(`${fileBase}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        } else {
            const tableHtml = `
                <table>
                    <thead><tr>${currentTableColumns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}</tr></thead>
                    <tbody>
                        ${currentTableRows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
                    </tbody>
                </table>`;
            const html = `
                <html>
                    <head><meta charset="utf-8"></head>
                    <body>${tableHtml}</body>
                </html>`;
            downloadBlob(`${fileBase}.xls`, new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }));
        }

        setShowTableExportModal(false);
    };

    return (
        <div className="course-gradebook">
            {/* Header */}
            <div className="gradebook-header">
                <div>
                    <h1 className="page-title">{course.name}</h1>
                    <p className="page-subtitle">
                        {filteredAssignments.length} Assignment{filteredAssignments.length !== 1 ? 's' : ''} • {filteredStudents.length} Student{filteredStudents.length !== 1 ? 's' : ''}
                        {showOverall && <span className="filter-active-hint"> (filtered)</span>}
                    </p>
                </div>

                <div className="gradebook-actions">
                    <Link to={`${basePath}/courses/${courseId}`} className="btn-course-home">
                        Course Home
                    </Link>
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

            {/* Filters */}
            <div className="gradebook-filters">
                <div className="gradebook-filter-group">
                    <Search size={16} className="filter-icon" />
                    <input
                        type="text"
                        placeholder="Filter by student (name, ID, or email)"
                        value={filterStudent}
                        onChange={e => setFilterStudent(e.target.value)}
                        className="gradebook-filter-input"
                    />
                </div>
                <div className="gradebook-filter-group">
                    <Filter size={16} className="filter-icon" />
                    <select
                        value={filterAssignmentId}
                        onChange={e => setFilterAssignmentId(e.target.value)}
                        className="gradebook-filter-select"
                    >
                        <option value="">All assignments</option>
                        {assignments.map(a => (
                            <option key={a.id} value={a.id}>{a.title}</option>
                        ))}
                    </select>
                </div>
                <div className="gradebook-filter-actions">
                    {showOverall && (
                        <button
                            type="button"
                            onClick={() => { setFilterStudent(''); setFilterAssignmentId(''); }}
                            className="gradebook-filter-overall"
                        >
                            Overall
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setShowTableExportModal(true)}
                        className="gradebook-filter-download"
                    >
                        <FileDown size={16} />
                        Download Table
                    </button>
                </div>
            </div>

            {/* Gradebook Table */}
            <div className="gradebook-table-container">
                <table className="gradebook-table">
                    <thead>
                        <tr>
                            <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 20, background: 'var(--primary-color)', color: '#fff' }}>Student Name</th>
                            <th>Student ID</th>
                            {filteredAssignments.map(a => (
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
                            {showSummaryColumns && <th className="summary-col">Total</th>}
                            {showSummaryColumns && <th className="summary-col">Percentage</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStudents.map(student => (
                            <tr key={student.id}>
                                <td style={{ position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 10, borderRight: '1px solid var(--border-color)' }}>
                                    <div className="student-name">{student.name}</div>
                                </td>
                                <td>
                                    <div className="student-id">{student.id}</div>
                                </td>
                                {filteredAssignments.map(a => {
                                    const grade = student.grades[a.id];
                                    const isGraded = grade !== null && grade !== undefined;
                                    const hasSubmission = student.submitted?.[a.id];
                                    return (
                                        <td key={a.id}>
                                            {isGraded ? (
                                                <span className={`grade-badge ${getGradeClass(grade, a.points)}`}>
                                                    {Number(grade).toFixed(2)}
                                                </span>
                                            ) : hasSubmission ? (
                                                <span className="status-badge-ungraded">Ungraded</span>
                                            ) : getCellStatus(student, a.id) === 'missing' ? (
                                                <span className="status-badge-missing">Missing</span>
                                            ) : (
                                                <span className="status-badge-not-submitted">Not submitted</span>
                                            )}
                                        </td>
                                    );
                                })}
                                {showSummaryColumns && (() => {
                                    const totals = getStudentTotals(student);
                                    return (
                                        <>
                                            <td className="summary-cell">
                                                {totals.possible > 0
                                                    ? <span className="total-badge">{totals.earned.toFixed(0)}/{totals.possible.toFixed(0)}</span>
                                                    : <span className="status-badge-not-submitted">—</span>}
                                            </td>
                                            <td className="summary-cell">
                                                {totals.percentage !== null
                                                    ? <span className={`grade-badge ${getGradeClass(totals.percentage, 100)}`}>{totals.percentage.toFixed(1)}%</span>
                                                    : <span className="status-badge-not-submitted">—</span>}
                                            </td>
                                        </>
                                    );
                                })()}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Export Modal */}
            {showExportModal && (
                <div className="modal-overlay">
                    <div className="modal-content export-modal-dialog">
                        <div className="modal-header">
                            <h3>Download Grades</h3>
                            <button onClick={() => setShowExportModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p className="export-modal-intro">
                                Choose what to export and the file format.
                            </p>

                            <section className="export-modal-section">
                                <div className="export-modal-section-head">
                                    <label className="export-modal-label">What to export</label>
                                    <span className="export-modal-hint">Pick the grades set you want to download.</span>
                                </div>
                                <div className="export-choice-row export-choice-row--three">
                                    {(['assignments', 'final', 'student'] as const).map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setExportType(t)}
                                            className={`report-card-btn export-choice-chip ${exportType === t ? 'selected' : ''}`}
                                        >
                                            {t === 'assignments' && 'Assignment grades'}
                                            {t === 'final' && 'Final grades'}
                                            {t === 'student' && 'Individual student'}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            {(exportType === 'assignments' || exportType === 'final') && data && data.assignments.length > 0 && (
                                <section className="export-modal-section export-picker-panel">
                                    <div className="export-modal-section-head">
                                        <label className="export-modal-label">Select assignments</label>
                                        <span className="export-selection-pill">{exportAssignmentIds.length} of {data.assignments.length} selected</span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search assignments..."
                                        value={exportAssignmentSearch}
                                        onChange={e => setExportAssignmentSearch(e.target.value)}
                                        className="export-modal-search"
                                    />
                                    <div className="export-quick-actions">
                                        <button type="button" className="btn-report export-quick-btn" onClick={() => setExportAssignmentIds(data.assignments.map(a => a.id))}>Select all</button>
                                        <button type="button" className="btn-report export-quick-btn" onClick={() => setExportAssignmentIds([])}>Deselect all</button>
                                    </div>
                                    <div className="export-scroll-panel">
                                        {visibleExportAssignments.map(a => (
                                                <label key={a.id} className="export-checkbox-row">
                                                    <input
                                                        type="checkbox"
                                                        checked={exportAssignmentIds.includes(a.id)}
                                                        onChange={e => {
                                                            if (e.target.checked) setExportAssignmentIds(prev => [...prev, a.id]);
                                                            else setExportAssignmentIds(prev => prev.filter(id => id !== a.id));
                                                        }}
                                                    />
                                                    <span className="export-checkbox-text">{a.title}</span>
                                                </label>
                                            ))}
                                        {visibleExportAssignments.length === 0 && (
                                            <div className="export-empty-state">No assignments match.</div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {exportType === 'student' && data && (
                                <section className="export-modal-section export-picker-panel">
                                    <div className="export-modal-section-head">
                                        <label className="export-modal-label">Select student</label>
                                        {selectedExportStudent && <span className="export-selection-pill">{selectedExportStudent.name}</span>}
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search by name or ID..."
                                        value={exportStudentSearch}
                                        onChange={e => setExportStudentSearch(e.target.value)}
                                        className="export-modal-search"
                                    />
                                    <div className="export-scroll-panel export-scroll-panel--student">
                                        {visibleExportStudents.map(s => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => setExportStudentId(s.id)}
                                                    className={`export-student-row ${exportStudentId === s.id ? 'selected' : ''}`}
                                                >
                                                    <span>{s.name}</span>
                                                    <span className="export-student-id">{s.id}</span>
                                                </button>
                                            ))}
                                        {visibleExportStudents.length === 0 && (
                                            <div className="export-empty-state">No students match.</div>
                                        )}
                                    </div>
                                </section>
                            )}

                            <section className="export-modal-section export-format-panel">
                                <div className="export-modal-section-head">
                                    <label className="export-modal-label">Format</label>
                                    <span className="export-modal-hint">Choose the file type you want to download.</span>
                                </div>
                                <div className="report-grid export-format-grid">
                                    <label className={`report-card-btn export-format-card ${exportFormat === 'csv' ? 'selected' : ''}`}>
                                        <div className="report-card-header">
                                            <input
                                                type="radio"
                                                name="exportFormat"
                                                value="csv"
                                                checked={exportFormat === 'csv'}
                                                onChange={() => setExportFormat('csv')}
                                                style={{ display: 'none' }}
                                            />
                                            <div className="icon-box"><FileText size={24} /></div>
                                            <div className="report-title">CSV</div>
                                        </div>
                                        <div className="report-desc">Plain text, opens in Excel.</div>
                                    </label>
                                    <label className={`report-card-btn export-format-card ${exportFormat === 'excel' ? 'selected' : ''}`}>
                                        <div className="report-card-header">
                                            <input
                                                type="radio"
                                                name="exportFormat"
                                                value="excel"
                                                checked={exportFormat === 'excel'}
                                                onChange={() => setExportFormat('excel')}
                                                style={{ display: 'none' }}
                                            />
                                            <div className="icon-box"><FileSpreadsheet size={24} /></div>
                                            <div className="report-title">Excel</div>
                                        </div>
                                        <div className="report-desc">.xlsx spreadsheet.</div>
                                    </label>
                                </div>
                            </section>
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
                                disabled={exportDisabled}
                            >
                                <Download size={18} /> Download {exportFormat === 'excel' ? 'Excel' : 'CSV'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showTableExportModal && (
                <div className="modal-overlay">
                    <div className="modal-content table-export-modal-dialog">
                        <div className="modal-header">
                            <h3>Download Current Table</h3>
                            <button onClick={() => setShowTableExportModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p className="export-modal-intro">
                                Download exactly what is currently visible in the gradebook table.
                            </p>
                            <div className="table-export-summary">
                                <div className="table-export-stat">
                                    <span className="table-export-stat-label">Students</span>
                                    <strong>{filteredStudents.length}</strong>
                                </div>
                                <div className="table-export-stat">
                                    <span className="table-export-stat-label">Assignments</span>
                                    <strong>{filteredAssignments.length}</strong>
                                </div>
                                <div className="table-export-stat">
                                    <span className="table-export-stat-label">View</span>
                                    <strong>{selectedAssignment ? selectedAssignment.title : 'Overall'}</strong>
                                </div>
                            </div>
                            <section className="export-modal-section export-format-panel">
                                <div className="export-modal-section-head">
                                    <label className="export-modal-label">Choose format</label>
                                    <span className="export-modal-hint">Both downloads include the rows and columns shown below.</span>
                                </div>
                                <div className="report-grid export-format-grid">
                                    <button type="button" className="report-card-btn export-format-card" onClick={() => handleDownloadCurrentTable('csv')}>
                                        <div className="report-card-header">
                                            <div className="icon-box"><FileText size={24} /></div>
                                            <div className="report-title">CSV</div>
                                        </div>
                                        <div className="report-desc">Best for spreadsheet filtering and import.</div>
                                    </button>
                                    <button type="button" className="report-card-btn export-format-card" onClick={() => handleDownloadCurrentTable('excel')}>
                                        <div className="report-card-header">
                                            <div className="icon-box"><FileSpreadsheet size={24} /></div>
                                            <div className="report-title">Excel</div>
                                        </div>
                                        <div className="report-desc">Opens directly as an Excel-compatible worksheet.</div>
                                    </button>
                                </div>
                            </section>
                        </div>
                        <div className="modal-footer">
                            <button onClick={() => setShowTableExportModal(false)} className="btn-report">
                                Cancel
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
                            <h3>{reportStep === 'select' ? 'Generate Insights Report' : 'Insights Report'}</h3>
                            <button onClick={() => { setShowReportModal(false); setReportStep('select'); }} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {reportStep === 'select' ? (
                                <div>
                                    <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                                        Choose the type of insight you want to see.
                                    </p>
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>What kind of insight?</label>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {(['overall', 'student', 'assignment'] as const).map(scope => (
                                                <button
                                                    key={scope}
                                                    type="button"
                                                    onClick={() => setReportScope(scope)}
                                                    className={`report-card-btn ${reportScope === scope ? 'selected' : ''}`}
                                                    style={{ flex: '1 1 120px', padding: '0.6rem 0.75rem', minWidth: 0 }}
                                                >
                                                    {scope === 'overall' && 'Overall'}
                                                    {scope === 'student' && 'Individual student'}
                                                    {scope === 'assignment' && 'Individual assignment'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {reportScope === 'student' && data && (
                                        <div style={{ marginBottom: '1.25rem' }}>
                                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Select student</label>
                                            <select
                                                value={reportScopeStudentId}
                                                onChange={e => setReportScopeStudentId(e.target.value)}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                                            >
                                                <option value="">— Choose student —</option>
                                                {data.students.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    {reportScope === 'assignment' && data && (
                                        <div style={{ marginBottom: '1.25rem' }}>
                                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Select assignment</label>
                                            <select
                                                value={reportScopeAssignmentId}
                                                onChange={e => setReportScopeAssignmentId(e.target.value)}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                                            >
                                                <option value="">— Choose assignment —</option>
                                                {data.assignments.map(a => (
                                                    <option key={a.id} value={a.id}>{a.title}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Report type</label>
                                        <div className="report-grid">
                                            <button
                                                onClick={() => setReportType('summary')}
                                                className={`report-card-btn ${reportType === 'summary' ? 'selected' : ''}`}
                                            >
                                                <div className="report-card-header">
                                                    <div className="icon-box"><PieChart size={24} /></div>
                                                    <div className="report-title">Course Summary</div>
                                                </div>
                                                <div className="report-desc">Averages, distribution, mean/median per assignment.</div>
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
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="report-view">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', background: 'var(--light-grey)', padding: '1rem', borderRadius: '8px' }}>
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{course.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{getCourseCatalogId(course)} • {course.term}</div>
                                            {reportStats?.scopeStudentName && (
                                                <div style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>Summary for student: <strong>{reportStats.scopeStudentName}</strong></div>
                                            )}
                                            {reportStats?.scopeAssignmentTitle && (
                                                <div style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>Summary for assignment: <strong>{reportStats.scopeAssignmentTitle}</strong></div>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Generated on</div>
                                            <div>{new Date().toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <button type="button" onClick={() => setReportStep('select')} className="btn-report" style={{ marginRight: '0.5rem' }}>← Back</button>
                                    </div>

                                    {/* Per-assignment statistics: mean, median, highest, lowest */}
                                    {reportStats?.assignmentStats && reportStats.assignmentStats.length > 0 && (
                                        <div style={{ marginBottom: '2rem' }}>
                                            <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <BarChart2 size={18} /> Per-assignment statistics
                                            </h4>
                                            <div className="missing-table-container" style={{ overflowX: 'auto' }}>
                                                <table className="missing-table gradebook-report-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Assignment</th>
                                                            <th>Mean</th>
                                                            <th>Median</th>
                                                            <th>Highest</th>
                                                            <th>Lowest</th>
                                                            <th>Graded (n)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {reportStats.scopeAssignmentId
                                                            ? reportStats.assignmentStats.filter(a => a.assignmentId === reportStats.scopeAssignmentId).map(a => (
                                                                <tr key={a.assignmentId}>
                                                                    <td><b>{a.assignmentTitle}</b></td>
                                                                    <td>{a.count ? a.mean.toFixed(2) : '—'}</td>
                                                                    <td>{a.count ? a.median.toFixed(2) : '—'}</td>
                                                                    <td>{a.count ? a.highest.toFixed(2) : '—'}</td>
                                                                    <td>{a.count ? a.lowest.toFixed(2) : '—'}</td>
                                                                    <td>{a.count}</td>
                                                                </tr>
                                                            ))
                                                            : reportStats.assignmentStats.map(a => (
                                                                <tr key={a.assignmentId}>
                                                                    <td>{a.assignmentTitle}</td>
                                                                    <td>{a.count ? a.mean.toFixed(2) : '—'}</td>
                                                                    <td>{a.count ? a.median.toFixed(2) : '—'}</td>
                                                                    <td>{a.count ? a.highest.toFixed(2) : '—'}</td>
                                                                    <td>{a.count ? a.lowest.toFixed(2) : '—'}</td>
                                                                    <td>{a.count}</td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Student scores: each student's scores and status per assignment */}
                                    {reportStats?.studentRows && reportStats.studentRows.length > 0 && (
                                        <div style={{ marginBottom: '2rem' }}>
                                            <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <BarChart2 size={18} /> Student Scores
                                            </h4>
                                            <div className="missing-table-container" style={{ overflowX: 'auto' }}>
                                                <table className="missing-table gradebook-report-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Student Name</th>
                                                            <th>Student ID</th>
                                                            {reportStats.studentRows[0]?.cells.map(c => (
                                                                <th key={c.assignmentId}>{c.assignmentTitle}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {reportStats.studentRows.map((row, i) => (
                                                            <tr key={i}>
                                                                <td><b>{row.studentName}</b></td>
                                                                <td>{row.studentId}</td>
                                                                {row.cells.map(c => (
                                                                    <td key={c.assignmentId}>
                                                                        {c.status === 'graded' && c.score != null && c.rawScore != null ? (
                                                                            <span className={`grade-badge ${getGradeClass(c.rawScore, assignments.find(a => a.id === c.assignmentId)?.points)}`}>
                                                                                {c.rawScore.toFixed(2)}
                                                                            </span>
                                                                        ) : c.status === 'ungraded' ? (
                                                                            <span className="status-badge-ungraded">Ungraded</span>
                                                                        ) : (
                                                                            <span className="status-badge-missing">Not submitted</span>
                                                                        )}
                                                                    </td>
                                                                ))}
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

                                    {/* Missing Grades */}
                                    {(reportType === 'missing' || reportType === 'summary') && reportStats && reportStats.missingGrades.length > 0 && (
                                        <div>
                                            <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <BarChart2 size={18} /> Missing Grades ({reportStats.missingGrades.length})
                                            </h4>
                                            {Array.from(new Set(reportStats.missingGrades.map(item => item.assignment))).map(assignmentName => {
                                                const assignmentMissing = reportStats.missingGrades.filter(m => m.assignment === assignmentName);
                                                return (
                                                    <details key={assignmentName} style={{ marginBottom: '1rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '8px' }}>
                                                        <summary style={{ padding: '0.8rem 1rem', cursor: 'pointer', fontWeight: 600, outline: 'none' }}>
                                                            {assignmentName} <span style={{ fontWeight: 'normal', color: 'var(--text-secondary, #6b7280)' }}>({assignmentMissing.length} missing)</span>
                                                        </summary>
                                                        <div className="missing-table-container" style={{ margin: 0, borderTop: '1px solid var(--border-color, #e5e7eb)', borderRadius: '0 0 8px 8px' }}>
                                                            <table className="missing-table" style={{ margin: 0 }}>
                                                                <thead>
                                                                    <tr>
                                                                        <th>Student</th>
                                                                        <th>Status</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {assignmentMissing.map((item, i) => (
                                                                        <tr key={i}>
                                                                            <td><b>{item.student}</b></td>
                                                                            <td>
                                                                                <span className={item.status === 'ungraded' ? 'status-badge-ungraded' : 'status-badge-missing'}>
                                                                                    {item.status === 'ungraded' ? 'Ungraded' : 'Not submitted'}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </details>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            {reportStep === 'select' ? (
                                <>
                                    <button onClick={() => { setShowReportModal(false); setReportStep('select'); }} className="btn-report">Cancel</button>
                                    <button
                                        onClick={generateReport}
                                        className="btn-report-action"
                                        disabled={
                                            reportScope === 'student' ? !reportScopeStudentId :
                                            reportScope === 'assignment' ? !reportScopeAssignmentId : false
                                        }
                                    >
                                        Show report
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => setReportStep('select')} className="btn-report">Back</button>
                                    <button onClick={openReportInNewTab} className="btn-report" type="button">
                                        <FileDown size={18} /> Open in new tab
                                    </button>
                                    <button onClick={downloadReportPdf} className="btn-report-action" type="button">
                                        <Download size={18} /> Download PDF
                                    </button>
                                    <button onClick={() => window.print()} className="btn-report">
                                        <Printer size={18} /> Print
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
