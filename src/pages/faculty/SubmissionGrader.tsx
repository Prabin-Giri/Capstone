import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSubmission, updateSubmission, getFileUrl, getAssignment } from '../../lib/api';
import type { Submission, Assignment } from '../../lib/api';
import { Button } from '../../components/ui/Button';

import './SubmissionGrader.css';

const SubmissionGrader: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const navigate = useNavigate();
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [showPreview, setShowPreview] = useState(false);

    // Form State
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');

    useEffect(() => {
        loadData();
    }, [submissionId]);

    async function loadData() {
        if (!submissionId || !assignmentId) return;
        try {
            const [subData, assignData] = await Promise.all([
                getSubmission(parseInt(submissionId)),
                getAssignment(assignmentId)
            ]);
            setSubmission(subData);
            setAssignment(assignData);

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
                    <h3 className="section-title">Submission Artifact</h3>
                    <div className="file-box">
                        <span className="file-name">{submission.file_name}</span>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowPreview(!showPreview)}
                            >
                                {showPreview ? 'Hide Artifact' : 'Preview Artifact'}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => window.open(getFileUrl(submission.file_path), '_blank')}
                            >
                                Download
                            </Button>
                        </div>
                    </div>

                    {showPreview ? (
                        <iframe
                            src={getFileUrl(submission.file_path)}
                            className="preview-frame"
                            title="File Preview"
                        />
                    ) : (
                        <div className="preview-placeholder">
                            Click user file to view preview.
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
