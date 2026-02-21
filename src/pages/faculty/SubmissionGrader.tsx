import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSubmission, getSubmissions, updateSubmission, getFileUrl, getAssignment } from '../../lib/api';
import type { Submission, Assignment } from '../../lib/api';
import { Button } from '../../components/ui/Button';

import './SubmissionGrader.css';

const SubmissionGrader: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const navigate = useNavigate();
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);

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
                                                        onClick={() => setPreviewFileUrl(isPreviewing ? null : url)}
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

                    {previewFileUrl ? (
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
        </div>
    );
};

export default SubmissionGrader;
