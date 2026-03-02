import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCourseGrades, getCourseGradesExportUrl } from '../../lib/api';
import type { GradebookData } from '../../lib/api';
import { getRole } from '../../lib/auth';
import { Download, FileSpreadsheet, FileText, ChevronLeft, BarChart2, Printer, X, PieChart } from 'lucide-react';
import './CourseGradebook.css';

interface ReportStats {
    average: number;
    median: number;
    highest: number;
    lowest: number;
    submissionRate: number;
    distribution: Record<string, number>; // A, B, C, D, F
    missingGrades: { student: string; assignment: string }[];
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

    // Report State
    const [reportStep, setReportStep] = useState<'select' | 'view'>('select');
    const [reportType, setReportType] = useState<'summary' | 'missing' | 'insights'>('summary');
    const [reportStats, setReportStats] = useState<ReportStats | null>(null);

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
        const url = getCourseGradesExportUrl(courseId, exportFormat);
        window.open(url, '_blank');
        setShowExportModal(false);
    };

    const generateReport = () => {
        if (!data) return;

        const { students, assignments } = data;
        const allGrades: number[] = [];
        let totalPossibleGrades = students.length * assignments.length;
        let actualGradesCount = 0;
        const missingGrades: { student: string; assignment: string }[] = [];
        const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

        students.forEach(student => {
            assignments.forEach(assignment => {
                const grade = student.grades[assignment.id];
                if (grade !== null && grade !== undefined) {
                    allGrades.push(grade);
                    actualGradesCount++;

                    if (grade >= 90) distribution.A++;
                    else if (grade >= 80) distribution.B++;
                    else if (grade >= 70) distribution.C++;
                    else if (grade >= 60) distribution.D++;
                    else distribution.F++;
                } else {
                    missingGrades.push({
                        student: student.name,
                        assignment: assignment.title
                    });
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
            totalStudents: students.length,
            gradedAssignments: assignments.length
        });

        setReportStep('view');
    };

    const getGradeClass = (grade: number) => {
        if (grade >= 90) return 'grade-A';
        if (grade >= 80) return 'grade-B';
        if (grade >= 70) return 'grade-C';
        if (grade >= 60) return 'grade-D';
        return 'grade-F';
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading gradebook...</div>;
    if (!data) return <div className="p-8 text-center text-red-500">Failed to load gradebook</div>;

    const { course, assignments, students } = data;

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
                    <p className="page-subtitle">{assignments.length} Assignments • {students.length} Students</p>
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

            {/* Gradebook Table */}
            <div className="gradebook-table-container">
                <table className="gradebook-table">
                    <thead>
                        <tr>
                            <th style={{ position: 'sticky', left: 0, zIndex: 10 }}>Student Name</th>
                            <th>Student ID</th>
                            {assignments.map(a => (
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
                        </tr>
                    </thead>
                    <tbody>
                        {students.map(student => (
                            <tr key={student.id}>
                                <td style={{ position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 10, borderRight: '1px solid var(--border-color)' }}>
                                    <div className="student-name">{student.name}</div>
                                </td>
                                <td>
                                    <div className="student-id">{student.id}</div>
                                </td>
                                {assignments.map(a => {
                                    const grade = student.grades[a.id];
                                    const isGraded = grade !== null && grade !== undefined;
                                    return (
                                        <td key={a.id}>
                                            {isGraded ? (
                                                <span className={`grade-badge ${getGradeClass(grade)}`}>
                                                    {grade}
                                                </span>
                                            ) : (
                                                <span className="grade-missing">-</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
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
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                Select a format to download the gradebook.
                            </p>

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
                            <h3>{reportStep === 'select' ? 'Generate Grade Report' : 'Course Grade Report'}</h3>
                            <button onClick={() => setShowReportModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {reportStep === 'select' ? (
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
                                </div>
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
                                            <div className="missing-table-container">
                                                <table className="missing-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Student</th>
                                                            <th>Assignment</th>
                                                            <th>Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {reportStats.missingGrades.map((item, i) => (
                                                            <tr key={i}>
                                                                <td><b>{item.student}</b></td>
                                                                <td>{item.assignment}</td>
                                                                <td><span className="status-badge-missing">Missing</span></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            {reportStep === 'select' ? (
                                <>
                                    <button onClick={() => setShowReportModal(false)} className="btn-report">Cancel</button>
                                    <button onClick={generateReport} className="btn-report-action">Generate Report</button>
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
