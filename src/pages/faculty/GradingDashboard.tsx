import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getAssignment, getSubmissions, getFileUrl, autoGradeAssignment } from '../../lib/api';
import type { Assignment, Submission } from '../../lib/api';
import { getRole } from '../../lib/auth';
import { BarChart2, Search, Play } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import PlagiarismReportModal from './PlagiarismReportModal';
import AutoGradingConfigModal from './AutoGradingConfigModal';
import AlertModal from '../../components/ui/AlertModal';

import './GradingDashboard.css';

const GradingDashboard: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const basePath = getRole() === 'ta' ? '/ta' : '/faculty';
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [groupedSubmissions, setGroupedSubmissions] = useState<Record<string, Submission[]>>({});
    const [selectedStudentSubmissions, setSelectedStudentSubmissions] = useState<Submission[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [showPlagiarismModal, setShowPlagiarismModal] = useState(false);
    const [showAutoGradeModal, setShowAutoGradeModal] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{ show: boolean, type: 'success' | 'error' | 'info', title: string, message: string }>({ show: false, type: 'info', title: '', message: '' });

    useEffect(() => {
        loadData();
    }, [assignmentId]);

    async function loadData() {
        if (!assignmentId) return;
        try {
            const [assignmentData, submissionsData] = await Promise.all([
                getAssignment(assignmentId),
                getSubmissions({ assignment_id: assignmentId })
            ]);
            setAssignment(assignmentData);

            // Group submissions by student_id
            const grouped = submissionsData.reduce((acc, curr) => {
                if (!acc[curr.student_id]) {
                    acc[curr.student_id] = [];
                }
                acc[curr.student_id].push(curr);
                return acc;
            }, {} as Record<string, Submission[]>);

            // Sort each group by submitted_at desc (newest first)
            Object.keys(grouped).forEach(studentId => {
                grouped[studentId].sort((a, b) =>
                    new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
                );
            });

            setGroupedSubmissions(grouped);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    const handleAutoGrade = async (config: { latePenalty: string; timeout: number }) => {
        if (!assignmentId) return;
        try {
            await autoGradeAssignment(assignmentId, config.latePenalty, config.timeout);
            await loadData(); // Reload to show new grades
            setAlertConfig({ show: true, type: 'success', title: 'Success', message: 'Autograding completed successfully.' });
        } catch (err) {
            console.error(err);
            setAlertConfig({ show: true, type: 'error', title: 'Error', message: 'Autograding failed. Please check test cases and system logs.' });
        }
    };

    if (loading) return <div className="grading-dashboard-container">Loading...</div>;
    if (!assignment) return <div className="grading-dashboard-container">Assignment not found</div>;

    return (
        <div className="grading-dashboard-container">
            <div className="dashboard-header">
                <div>
                    <div className="breadcrumb">
                        <Link to={`${basePath}/courses/${courseId}`}>Back to Course</Link>
                        <span>/</span>
                        <span>{assignment.title}</span>
                    </div>
                    <h1 className="dashboard-title">Grading Dashboard</h1>
                </div>
                <div className="action-group">
                    <button
                        onClick={() => setShowAutoGradeModal(true)}
                        className="btn-dashboard-action btn-autograde"
                    >
                        <Play size={20} />
                        Auto-Grade All
                    </button>
                    <button
                        onClick={() => setShowPlagiarismModal(true)}
                        className="btn-dashboard-action btn-plagiarism"
                    >
                        <Search size={20} />
                        Check Plagiarism
                    </button>
                    <Link
                        to={`${basePath}/courses/${courseId}/gradebook`}
                        className="btn-dashboard-action btn-gradebook"
                    >
                        <BarChart2 size={20} />
                        View Reports & Gradebook
                    </Link>
                </div>
            </div>

            <div className="grading-card">
                <table className="grading-table">
                    <thead>
                        <tr>
                            <th>Student ID</th>
                            <th>Latest Submission</th>
                            <th>Submitted Assignments</th>
                            <th>Status</th>
                            <th>Grade</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.keys(groupedSubmissions).length === 0 ? (
                            <tr>
                                <td colSpan={6} className="empty-state">
                                    No submissions found for this assignment yet.
                                </td>
                            </tr>
                        ) : (
                            Object.values(groupedSubmissions).map(group => {
                                const latestSubmission = group[0]; // First one is latest due to sort
                                return (
                                    <tr key={latestSubmission.student_id}>
                                        <td className="text-medium">{latestSubmission.student_id}</td>
                                        <td className="text-secondary">
                                            {new Date(latestSubmission.submitted_at).toLocaleString()}
                                        </td>
                                        <td>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSelectedStudentSubmissions(group)}
                                                style={{ boxShadow: 'none', color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
                                            >
                                                View Submissions ({group.length})
                                            </Button>
                                        </td>
                                        <td>
                                            <StatusBadge status={latestSubmission.status} />
                                        </td>
                                        <td className="text-medium">
                                            {latestSubmission.grade !== undefined && latestSubmission.grade !== null
                                                ? latestSubmission.grade.toFixed(2)
                                                : '-'}
                                        </td>
                                        <td>
                                            <Button
                                                size="sm"
                                                onClick={() => navigate(`${latestSubmission.id}`)}
                                                className="focus:ring-0 focus:outline-none"
                                            >
                                                Grade
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Submission View Modal */}
            {selectedStudentSubmissions && (
                <div className="modal-overlay" onClick={() => setSelectedStudentSubmissions(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                Submissions for {selectedStudentSubmissions[0].student_id}
                            </h3>
                            <button
                                className="modal-close"
                                onClick={() => setSelectedStudentSubmissions(null)}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="submission-list">
                                {selectedStudentSubmissions.map((sub) => (
                                    <div key={sub.id} className="submission-item">
                                        <div className="submission-info" style={{ marginBottom: '8px' }}>
                                            <span className="submission-date">
                                                Submitted: {new Date(sub.submitted_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {(sub.files || [{ name: sub.file_name, path: sub.file_path }]).map((f, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-body)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '6px' }}>
                                                    <span className="file-name" style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{f.name}</span>
                                                    <a
                                                        href={getFileUrl(f.path)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-sm btn-outline"
                                                        style={{
                                                            textDecoration: 'none',
                                                            color: 'var(--text-primary)',
                                                            borderColor: 'var(--border-color)',
                                                            boxShadow: 'none',
                                                            outline: 'none'
                                                        }}
                                                    >
                                                        Download
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Plagiarism Report Modal */}
            {showPlagiarismModal && assignment && (
                <PlagiarismReportModal
                    assignmentId={assignment.id}
                    assignmentTitle={assignment.title}
                    onClose={() => setShowPlagiarismModal(false)}
                />
            )}

            {/* Auto-Grading Config Modal */}
            {showAutoGradeModal && assignment && (
                <AutoGradingConfigModal
                    assignmentId={assignment.id}
                    onClose={() => setShowAutoGradeModal(false)}
                    onStart={handleAutoGrade}
                />
            )}

            {/* Alert Modal */}
            {alertConfig.show && (
                <AlertModal
                    type={alertConfig.type}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    onClose={() => setAlertConfig({ ...alertConfig, show: false })}
                />
            )}
        </div>
    );
};

export default GradingDashboard;
