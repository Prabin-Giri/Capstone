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
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [testCasesFile, setTestCasesFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [existingSubmission, setExistingSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [isDragging, setIsDragging] = useState(false);

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

    // Fetch assignment details for validation
    useEffect(() => {
        if (assignmentId) {
            getAssignment(assignmentId).then(setAssignment).catch(console.error);
        }
    }, [assignmentId]);

    const validateFile = (file: File): boolean => {
        if (!assignment?.language) return true; // No restriction

        const ext = file.name.split('.').pop()?.toLowerCase();
        let valid = true;

        // Simple mapping; can be expanded
        const map: Record<string, string[]> = {
            'python': ['py'],
            'javascript': ['js'],
            'java': ['java'],
            'cpp': ['cpp', 'c', 'h'],
            'c': ['c', 'h']
        };

        if (map[assignment.language]) {
            valid = map[assignment.language].includes(ext || '');
        }

        if (!valid) {
            setError(`Invalid file type. Expected .${map[assignment.language].join(', .')} file for ${assignment.language} assignment.`);
            return false;
        }
        return true;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            if (!validateFile(file)) return;
            setSelectedFile(file);
            setError(null);
        }
    };

    const handleTestCasesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) setTestCasesFile(e.target.files[0]);
        else setTestCasesFile(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (!validateFile(file)) return;
            setSelectedFile(file);
            setError(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile || !assignmentId) return;

        setIsSubmitting(true);
        setError(null);

        try {
            if (assignmentId) {
                await createSubmission(assignmentId, studentId, selectedFile, testCasesFile ?? undefined);
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
                    <div
                        className={`upload-area ${isDragging ? 'dragging' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        style={{
                            border: isDragging ? '2px dashed #2563eb' : '2px dashed #e5e7eb',
                            backgroundColor: isDragging ? '#eff6ff' : '#f9fafb'
                        }}
                    >
                        <input
                            type="file"
                            id="file-upload"
                            className="hidden"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                            disabled={isSubmitting}
                            accept={assignment?.language === 'python' ? '.py' : assignment?.language === 'javascript' ? '.js' : assignment?.language === 'java' ? '.java' : undefined}
                        />
                        <label htmlFor="file-upload" className="file-input-label cursor-pointer block h-full" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '150px' }}>
                            <div style={{ textAlign: 'center', color: '#6b7280' }}>
                                <p style={{ margin: 0, fontWeight: 500, color: '#374151' }}>Click to upload or drag and drop</p>
                                <p style={{ fontSize: '0.875rem', margin: '4px 0 0 0' }}>
                                    {assignment?.language ? `${assignment.language} source file required` : 'Any file'}
                                </p>
                            </div>
                        </label>
                    </div>
                    <p className="description-text" style={{ marginTop: '8px', marginBottom: '12px', fontSize: '14px' }}>Code file (required)</p>

                    <div className="upload-area" style={{ marginTop: '16px' }}>
                        <input
                            type="file"
                            id="test-cases-upload"
                            className="hidden"
                            onChange={(e) => setTestCasesFile(e.target.files?.[0] ?? null)}
                            style={{ display: 'none' }}
                            disabled={isSubmitting}
                        />
                        <label htmlFor="test-cases-upload" className="file-input-label cursor-pointer block h-full">
                            {testCasesFile ? (
                                <span className="text-gray-900 font-semibold">{testCasesFile.name}</span>
                            ) : (
                                <span>Test cases file (optional, e.g. Excel)</span>
                            )}
                        </label>
                    </div>

                    {(selectedFile || testCasesFile) && (
                        <div style={{ background: '#f3f4f6', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>Files to upload:</h4>
                            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                                {selectedFile && <li style={{ marginBottom: '4px' }}>{selectedFile.name} <button type="button" onClick={() => setSelectedFile(null)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Remove</button></li>}
                                {testCasesFile && <li style={{ marginBottom: '4px' }}>{testCasesFile.name} (test cases) <button type="button" onClick={() => setTestCasesFile(null)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Remove</button></li>}
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
                            disabled={!selectedFile || isSubmitting}
                            style={{ width: '100%', opacity: selectedFile && !isSubmitting ? 1 : 0.5 }}
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
