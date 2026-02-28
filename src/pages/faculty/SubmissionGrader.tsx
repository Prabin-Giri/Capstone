import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSubmission, getSubmissions, updateSubmission, getFileUrl, getAssignment, runAutograde } from '../../lib/api';
import type { Submission, Assignment } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Play } from 'lucide-react';

import './SubmissionGrader.css';

const SubmissionGrader: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const navigate = useNavigate();
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
    const [codeContent, setCodeContent] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewFileName, setPreviewFileName] = useState<string | null>(null);
    const [isAutograding, setIsAutograding] = useState(false);
    const [showAttemptSelector, setShowAttemptSelector] = useState(false);

    // Form State
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');

    useEffect(() => {
        loadData();
    }, [submissionId]);

    async function loadData() {
        if (!submissionId || !assignmentId) return;
        try {
            const subData = await getSubmission(parseInt(submissionId));
            const [assignData, historyData] = await Promise.all([
                getAssignment(assignmentId),
                getSubmissions({ assignment_id: assignmentId, student_id: subData.student_id })
            ]);
            setSubmission(subData);
            setAssignment(assignData);
            setAllSubmissions(historyData);

            setGrade(subData.grade?.toString() || '');
            setFeedback(subData.feedback || '');
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (previewFileUrl && previewFileName) {
            const isCodeFile = /\.(py|java|cpp|c|h|cs|js|ts|tsx|jsx|css|html|txt|json|md|sql)$/i.test(previewFileName);
            if (isCodeFile) {
                fetchCodeContent(previewFileUrl);
            } else {
                setCodeContent(null);
            }
        } else {
            setCodeContent(null);
        }
    }, [previewFileUrl, previewFileName]);

    async function fetchCodeContent(url: string) {
        setIsPreviewLoading(true);
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch code content');
            const text = await response.text();
            setCodeContent(text);
        } catch (err) {
            console.error(err);
            setCodeContent('Error loading file content.');
        } finally {
            setIsPreviewLoading(false);
        }
    }
    async function handleAutograde(id?: number) {
        const targetId = id || (submission?.id);
        if (!targetId) return;

        setIsAutograding(true);
        setShowAttemptSelector(false);
        try {
            const updatedSub = await runAutograde(targetId);
            setGrade(updatedSub.grade?.toString() || '');
            setFeedback(updatedSub.feedback || '');
            // Update the main submission if it's the one we are looking at
            if (submission?.id === updatedSub.id) {
                setSubmission(updatedSub);
            }
            // Update the attempt list to reflect the new grade
            setAllSubmissions(prev => prev.map(s => s.id === updatedSub.id ? updatedSub : s));

            alert('Autograding completed successfully.');
        } catch (err) {
            console.error(err);
            alert('Autograding failed. Please check test cases and system logs.');
        } finally {
            setIsAutograding(false);
        }
    }

    async function handleSave() {
        if (!submissionId) return;
        try {
            await updateSubmission(parseInt(submissionId), {
                grade: grade ? parseFloat(grade) : undefined,
                feedback,
                status: 'graded' // Auto-update status to graded on save
            });
            navigate(`/faculty/courses/${courseId}/assignments/${assignmentId}/grading`);
        } catch (err) {
            console.error('Failed to save grade', err);
            alert('Failed to save grade');
        }
    }

    if (loading) return <div className="grader-container"><div style={{ padding: '32px' }}>Loading...</div></div>;
    if (!submission || !assignment) return <div className="grader-container"><div style={{ padding: '32px' }}>Submission not found</div></div>;

    return (
        <div className="grader-container">
            {/* Left Panel: Submission Info & File */}
            <div className="grader-panel-left">
                <div className="grader-header">
                    <h2 className="grader-title">{assignment.title}</h2>
                    <div className="meta-group" style={{ display: 'flex', gap: '2rem' }}>
                        <p className="grader-meta">STUDENT ID: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{submission.student_id}</span></p>
                        <p className="grader-meta">SUBMITTED: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{new Date(submission.submitted_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span></p>
                    </div>
                </div>

                <div className="info-card">
                    <h3 className="section-title">Submission Artifacts</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '16px' }}>
                        {allSubmissions.map((sub, idx) => (
                            <div key={sub.id} className="submission-attempt-group">
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#4b5563', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
                                    Attempt {allSubmissions.length - idx} &bull; <span style={{ fontWeight: 'normal' }}>{new Date(sub.submitted_at).toLocaleString()}</span>
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {(sub.files || [{ name: sub.file_name, path: sub.file_path }]).map((f, i) => {
                                        const url = getFileUrl(f.path);
                                        const isPreviewing = previewFileUrl === url;
                                        return (
                                            <div key={i} className="file-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="file-name">{f.name}</span>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                    <Button
                                                        variant={isPreviewing ? 'primary' : 'outline'}
                                                        size="sm"
                                                        onClick={() => {
                                                            if (isPreviewing) {
                                                                setPreviewFileUrl(null);
                                                                setPreviewFileName(null);
                                                            } else {
                                                                setPreviewFileUrl(url);
                                                                setPreviewFileName(f.name);
                                                            }
                                                        }}
                                                    >
                                                        {isPreviewing ? 'Hide Preview' : 'Preview'}
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => window.open(url, '_blank')}
                                                    >
                                                        Download
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {isPreviewLoading ? (
                        <div className="preview-placeholder">
                            <div className="loading-spinner"></div>
                            Loading preview...
                        </div>
                    ) : codeContent !== null ? (
                        <div className="code-preview-container">
                            <pre className="code-block">
                                <code>{codeContent}</code>
                            </pre>
                        </div>
                    ) : previewFileUrl ? (
                        <iframe
                            src={previewFileUrl}
                            className="preview-frame"
                            title="File Preview"
                        />
                    ) : (
                        <div className="preview-placeholder">
                            Select a file to preview.
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Grading Form */}
            <div className="grader-panel-right">
                <h2 className="section-title" style={{ fontSize: '1.5rem', marginBottom: '24px' }}>Grading</h2>

                <div className="grading-form">
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                        <Button
                            variant="primary"
                            type="button"
                            className="btn-autograde-single"
                            onClick={() => {
                                if (allSubmissions.length > 1) {
                                    setShowAttemptSelector(true);
                                } else {
                                    handleAutograde();
                                }
                            }}
                            isLoading={isAutograding}
                        >
                            <Play size={16} />
                            Autograde Submission
                        </Button>
                        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                            Runs all test cases against the submission and updates grade/feedback.
                        </p>
                    </div>

                    <div className="divider" style={{ borderTop: '1px solid #e5e7eb', margin: '8px 0 24px 0' }}></div>

                    <div className="form-group">
                        <label className="form-label">Grade (0-100)</label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            className="form-input"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Feedback</label>
                        <textarea
                            rows={8}
                            className="form-textarea"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Enter detailed feedback here..."
                        />
                    </div>

                    <div className="form-actions">
                        <Button variant="ghost" onClick={() => navigate(-1)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>
                            Save & Return to Dashboard
                        </Button>
                    </div>
                </div>
            </div>
            {/* Attempt Selection Modal */}
            {showAttemptSelector && (
                <div className="modal-overlay" onClick={() => setShowAttemptSelector(false)}>
                    <div className="modal-content attempt-selector-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Select Attempt to Autograde</h3>
                            <button className="modal-close" onClick={() => setShowAttemptSelector(false)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '16px', color: '#6b7280' }}>
                                This student has multiple submissions. Which one would you like to run the autograder on?
                            </p>
                            <div className="attempt-list">
                                {allSubmissions.map((sub, idx) => (
                                    <div key={sub.id} className="attempt-selection-item" onClick={() => handleAutograde(sub.id)}>
                                        <div className="attempt-info">
                                            <span className="attempt-number">Attempt {allSubmissions.length - idx}</span>
                                            <span className="attempt-date">{new Date(sub.submitted_at).toLocaleString()}</span>
                                        </div>
                                        <div className="attempt-action">
                                            <Button size="sm" variant="outline">Select & Run</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubmissionGrader;
