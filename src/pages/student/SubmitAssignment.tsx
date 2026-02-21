import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSubmission, getSubmissions, getFileUrl, getAssignment } from '../../lib/api';
import type { Submission, Assignment } from '../../lib/api';
import { getUser } from '../../lib/auth';
import './SubmitAssignment.css';

const SubmitAssignment: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [fileInputKey, setFileInputKey] = useState(Date.now());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [existingSubmission, setExistingSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [assignment, setAssignment] = useState<Assignment | null>(null);

    // Fetch assignment and submission data
    useEffect(() => {
        async function loadData() {
            if (!assignmentId) return;
            try {
                const [submissions, assignmentData] = await Promise.all([
                    getSubmissions({
                        assignment_id: assignmentId,
                        student_id: studentId
                    }),
                    getAssignment(assignmentId)
                ]);
                if (submissions.length > 0) {
                    setExistingSubmission(submissions[0]);
                    setAllSubmissions(submissions);
                }
                setAssignment(assignmentData);
            } catch (err) {
                console.error('Failed to load data:', err);
            }
        }
        loadData();
    }, [assignmentId, studentId]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setSelectedFiles(prev => [...prev, ...newFiles]);
            setError(null);
            setFileInputKey(Date.now()); // Forces DOM replacement of input to allow identical subsequent selections
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedFiles.length === 0 || !assignmentId) return;

        setIsSubmitting(true);
        setError(null);

        try {
            if (assignmentId) {
                await createSubmission(assignmentId, studentId, selectedFiles);
                navigate(`/student/courses/${courseId}/assignments/${assignmentId}`);
            }
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

                {allSubmissions.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', marginTop: '24px' }}>Previous Attempts</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {allSubmissions.map((sub, idx) => (
                                <div key={sub.id} style={{
                                    background: '#fef3c7',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                }}>
                                    <p style={{ margin: 0, fontSize: '14px', marginBottom: '8px' }}>
                                        <strong>Attempt {allSubmissions.length - idx}</strong> <br />
                                        <span style={{ color: '#666' }}>
                                            Submitted: {new Date(sub.submitted_at).toLocaleString()}
                                        </span>
                                    </p>
                                    <ul className="file-list" style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                                        {(sub.files || [{ name: sub.file_name, path: sub.file_path }]).map((f, i) => (
                                            <li key={i} style={{ marginBottom: '4px' }}>
                                                <span>{f.name}</span>{' '}
                                                <a
                                                    href={getFileUrl(f.path)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ color: '#2563eb', marginLeft: '8px' }}
                                                >
                                                    (Download)
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
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
                    <div className="upload-area" style={{ marginBottom: '1rem', padding: '1.5rem', textAlign: 'center', border: '2px dashed #d1d5db', borderRadius: '8px', cursor: 'pointer', background: '#f9fafb' }}>
                        <input
                            key={fileInputKey}
                            type="file"
                            id="file-upload"
                            multiple
                            className="hidden"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                            disabled={isSubmitting}
                        />
                        <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'block', width: '100%' }}>
                            <span style={{ color: '#4f46e5', fontWeight: 500 }}>Click to select files</span>
                        </label>
                    </div>

                    {selectedFiles.length > 0 && (
                        <div style={{ background: '#f3f4f6', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>Files to upload:</h4>
                            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                                {selectedFiles.map((f, i) => (
                                    <li key={i} style={{ marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{f.name}</span>
                                        <button type="button" onClick={() => removeFile(i)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {assignment?.status === 'closed' ? (
                        <div style={{ padding: '12px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', textAlign: 'center' }}>
                            This assignment is closed.
                        </div>
                    ) : existingSubmission && assignment && (assignment.status === 'late' || (assignment.status === 'active' && new Date() > new Date(assignment.due_date))) ? (
                        <div style={{ padding: '12px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', textAlign: 'center' }}>
                            Cannot resubmit a late assignment.
                        </div>
                    ) : (
                        <button
                            type="submit"
                            className="btn btn-primary w-full"
                            disabled={selectedFiles.length === 0 || isSubmitting}
                            style={{ width: '100%', opacity: (selectedFiles.length > 0) && !isSubmitting ? 1 : 0.5 }}
                        >
                            {isSubmitting ? 'Submitting...' : existingSubmission ? 'Resubmit Assignment' : 'Submit Assignment'}
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
};

export default SubmitAssignment;
