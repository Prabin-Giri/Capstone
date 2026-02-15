import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSubmission, getSubmissions, getFileUrl } from '../../lib/api';
import type { Submission } from '../../lib/api';
import './SubmitAssignment.css';

const STUDENT_ID = 'student-001'; // In a real app, get from auth context

const SubmitAssignment: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [existingSubmission, setExistingSubmission] = useState<Submission | null>(null);

    // Check for existing submission
    useEffect(() => {
        async function checkExisting() {
            if (!assignmentId) return;
            try {
                const submissions = await getSubmissions({
                    assignment_id: assignmentId,
                    student_id: STUDENT_ID
                });
                if (submissions.length > 0) {
                    setExistingSubmission(submissions[0]);
                }
            } catch (err) {
                console.error('Failed to check existing submissions:', err);
            }
        }
        checkExisting();
    }, [assignmentId]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile || !assignmentId) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const submission = await createSubmission(assignmentId, STUDENT_ID, selectedFile);
            navigate(
                `/student/courses/${courseId}/assignments/${assignmentId}/submissions/${submission.id}`
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="submit-page">
            <div className="submit-card">
                <h1 className="section-title">
                    {existingSubmission ? 'Resubmit Assignment' : 'Submit Assignment'}
                </h1>
                <p className="description-text mb-6">Upload your assignment file for grading.</p>

                {existingSubmission && (
                    <div style={{
                        background: '#fef3c7',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        marginBottom: '16px'
                    }}>
                        <p style={{ margin: 0, fontSize: '14px' }}>
                            <strong>Previous submission:</strong> {existingSubmission.file_name}
                            <br />
                            <span style={{ color: '#666' }}>
                                Submitted: {new Date(existingSubmission.submitted_at).toLocaleString()}
                            </span>
                            <br />
                            <a
                                href={getFileUrl(existingSubmission.file_path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#2563eb' }}
                            >
                                Download previous file
                            </a>
                        </p>
                    </div>
                )}

                {error && (
                    <div style={{
                        background: '#fee2e2',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        color: '#dc2626'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="upload-area">
                        <input
                            type="file"
                            id="file-upload"
                            className="hidden"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                            disabled={isSubmitting}
                        />
                        <label htmlFor="file-upload" className="file-input-label cursor-pointer block h-full">
                            {selectedFile ? (
                                <span className="text-gray-900 font-semibold">{selectedFile.name}</span>
                            ) : (
                                <span>Click to upload file</span>
                            )}
                        </label>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary w-full"
                        disabled={!selectedFile || isSubmitting}
                        style={{ width: '100%', opacity: selectedFile && !isSubmitting ? 1 : 0.5 }}
                    >
                        {isSubmitting ? 'Submitting...' : existingSubmission ? 'Resubmit Assignment' : 'Submit Assignment'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default SubmitAssignment;
