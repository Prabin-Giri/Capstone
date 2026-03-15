import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSubmission, getSubmissions, getFileUrl, getAssignment, runAutograde, formatGrade } from '../../lib/api';

const CODE_RUNNER_PREFILL_KEY = 'codeRunnerPrefill';
import type { Submission, Assignment } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { Code } from 'lucide-react';
import { languageFromAssignmentLanguage } from '../../lib/monacoLanguage';
import './SubmitAssignment.css';

type SubmitMode = 'upload' | 'editor';
type EditorFile = { name: string; content: string };

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
    const [isDragging, setIsDragging] = useState(false);
    const [submitMode, setSubmitMode] = useState<SubmitMode>('upload');
    const [editorFiles, setEditorFiles] = useState<EditorFile[]>([]);
    const [activeEditorIndex, setActiveEditorIndex] = useState(0);
    const [isRunningPublicTests, setIsRunningPublicTests] = useState(false);
    const [publicTestSubmission, setPublicTestSubmission] = useState<Submission | null>(null);

    const editorLanguage = useMemo(() => languageFromAssignmentLanguage(assignment?.language), [assignment?.language]);

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

    // Default editor file when assignment loads (editor mode)
    useEffect(() => {
        if (!assignment || editorFiles.length > 0) return;
        const lang = (assignment.language || '').toLowerCase();
        const defaultName =
            lang === 'python' ? 'main.py'
                : lang === 'javascript' ? 'main.js'
                    : lang === 'java' ? 'Main.java'
                        : lang === 'cpp' ? 'main.cpp'
                            : lang === 'c' ? 'main.c'
                                : 'main.txt';
        setEditorFiles([{ name: defaultName, content: '' }]);
        setActiveEditorIndex(0);
    }, [assignment, editorFiles.length]);

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

    const validateFilenameForEditor = (filename: string): boolean => {
        if (!assignment?.language) return true;
        const ext = filename.split('.').pop()?.toLowerCase();
        const map: Record<string, string[]> = {
            'python': ['py'],
            'javascript': ['js'],
            'java': ['java'],
            'cpp': ['cpp', 'c', 'h'],
            'c': ['c', 'h']
        };
        if (!map[assignment.language]) return true;
        const ok = map[assignment.language].includes(ext || '');
        if (!ok) {
            setError(`Invalid filename. Expected .${map[assignment.language].join(', .')} for ${assignment.language} assignments.`);
        }
        return ok;
    };

    const isLockedForSubmit = useMemo(() => {
        if (!assignment) return false;
        if (assignment.status === 'closed') return true;
        if (existingSubmission && (assignment.status === 'late' || (assignment.status === 'active' && new Date() > new Date(assignment.due_date)))) {
            return true;
        }
        return false;
    }, [assignment, existingSubmission]);

    const filesForCurrentMode = (): File[] => {
        if (submitMode === 'upload') return selectedFiles;
        return editorFiles.map(f => new File([f.content], f.name, { type: 'text/plain' }));
    };

    const loadFilesIntoEditor = (files: File[]) => {
        if (!files.length) return;
        const readers = files.map(file => new Promise<EditorFile>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const text = typeof reader.result === 'string' ? reader.result : '';
                resolve({ name: file.name, content: text });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        }));

        Promise.all(readers)
            .then((editorFromUpload) => {
                setEditorFiles(editorFromUpload);
                setActiveEditorIndex(0);
                setSubmitMode('editor');
            })
            .catch((err) => {
                console.error('Failed to read uploaded files for editor preview:', err);
                setError('Failed to read uploaded files for editor preview.');
            });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            // Validate each file
            for (const file of newFiles) {
                if (!validateFile(file)) return;
            }
            setSelectedFiles(prev => {
                const all = [...prev, ...newFiles];
                // Also load into Monaco editor so student can edit/run tests on the full set
                loadFilesIntoEditor(all);
                return all;
            });
            setError(null);
            setFileInputKey(Date.now()); // Forces DOM replacement of input to allow identical subsequent selections
        }
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
            const newFiles = Array.from(e.dataTransfer.files);
            for (const file of newFiles) {
                if (!validateFile(file)) return;
            }
            setSelectedFiles(prev => {
                const all = [...prev, ...newFiles];
                // Also load into Monaco editor so student can edit/run tests on the full set
                loadFilesIntoEditor(all);
                return all;
            });
            setError(null);
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignmentId) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const files = filesForCurrentMode();
            if (files.length === 0) return;
            const created = await createSubmission(assignmentId, studentId, files);
            // After submitting, take the student directly to the submission details page
            navigate(`/student/courses/${courseId}/assignments/${assignmentId}/submissions/${created.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
            setIsSubmitting(false);
        }
    };

    const handleRunPublicTests = async () => {
        if (!assignmentId) return;
        if (isLockedForSubmit) return;
        const files = filesForCurrentMode();
        if (files.length === 0) {
            setError('Add code/files first to run public tests.');
            return;
        }

        setError(null);
        setPublicTestSubmission(null);
        setIsRunningPublicTests(true);
        try {
            // 1) Create a new submission attempt from current code/files
            const created = await createSubmission(assignmentId, studentId, files);
            // 2) Run autograder with publicOnly
            const graded = await runAutograde(created.id, { publicOnly: true });
            setPublicTestSubmission(graded);

            // Refresh attempts list so student can see this attempt in history
            const submissions = await getSubmissions({ assignment_id: assignmentId, student_id: studentId });
            setAllSubmissions(submissions);
            setExistingSubmission(submissions[0] || null);
        } catch (err: any) {
            setError(err?.message || 'Failed to run public tests.');
        } finally {
            setIsRunningPublicTests(false);
        }
    };

    return (
        <div className="submit-page">
            <div className="submit-card">
                <h1 className="section-title">
                    {existingSubmission ? 'Resubmit Assignment' : 'Submit Assignment'}
                </h1>
                <p className="description-text mb-6">Upload your assignment file for grading.</p>

                <div className="submit-mode-toggle">
                    <button
                        type="button"
                        className={`mode-btn ${submitMode === 'upload' ? 'active' : ''}`}
                        onClick={() => setSubmitMode('upload')}
                        disabled={isSubmitting}
                    >
                        Upload Files
                    </button>
                    <button
                        type="button"
                        className={`mode-btn ${submitMode === 'editor' ? 'active' : ''}`}
                        onClick={() => setSubmitMode('editor')}
                        disabled={isSubmitting}
                    >
                        Write Code Here
                    </button>
                </div>

                {allSubmissions.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', marginTop: '24px' }}>Previous Attempts</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {allSubmissions.map((sub, idx) => (
                                <div key={sub.id} style={{
                                    background: 'var(--secondary-color)',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                }}>
                                    <p style={{ margin: 0, fontSize: '14px', marginBottom: '8px' }}>
                                        <strong>Attempt {allSubmissions.length - idx}</strong> <br />
                                        <span style={{ color: 'var(--text-secondary)' }}>
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
                        background: 'var(--danger-bg)',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        color: 'var(--danger-color)'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    {submitMode === 'upload' ? (
                        <div
                            className={`upload-area ${isDragging ? 'dragging' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            style={{
                                border: isDragging ? '2px dashed var(--primary-color)' : '2px dashed var(--border-color)',
                                backgroundColor: isDragging ? 'var(--light-grey)' : 'var(--bg-surface)'
                            }}
                        >
                            <input
                                key={fileInputKey}
                                type="file"
                                id="file-upload"
                                multiple
                                className="hidden"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                                disabled={isSubmitting}
                                accept={assignment?.language === 'python' ? '.py' : assignment?.language === 'javascript' ? '.js' : assignment?.language === 'java' ? '.java' : undefined}
                            />
                            <label htmlFor="file-upload" className="file-input-label cursor-pointer block h-full" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '150px' }}>
                                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)' }}>Click to upload or drag and drop</p>
                                    <p style={{ fontSize: '0.875rem', margin: '4px 0 0 0' }}>
                                        {assignment?.language ? `${assignment.language} source file required` : 'Any file'}
                                    </p>
                                </div>
                            </label>
                        </div>
                    ) : (
                        <div className="editor-area" style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                            <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '1rem' }}>
                                Write your code in Code Runner. You can run your code with custom input, run assignment tests, and submit from there.
                            </p>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => {
                                    const prefill: Record<string, unknown> = {
                                        code: editorFiles[0]?.content ?? '',
                                        language: (assignment?.language || 'python').toLowerCase(),
                                        assignmentId,
                                        courseId,
                                        assignmentTitle: assignment?.title ?? '',
                                    };
                                    sessionStorage.setItem(CODE_RUNNER_PREFILL_KEY, JSON.stringify(prefill));
                                    navigate('/run');
                                }}
                                disabled={!assignmentId || !courseId}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', fontSize: '1rem' }}
                            >
                                <Code size={20} />
                                Open Code Runner
                            </button>
                        </div>
                    )}

                    {submitMode === 'upload' && selectedFiles.length > 0 && (
                        <div style={{ background: 'var(--light-grey)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>Files to upload:</h4>
                            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                                {selectedFiles.map((f, i) => (
                                    <li key={i} style={{ marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{f.name}</span>
                                        <button type="button" onClick={() => removeFile(i)} style={{ color: 'var(--danger-color)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {publicTestSubmission && (
                        <div style={{ background: 'var(--light-grey)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
                                <strong>Public tests result</strong>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    Attempt #{publicTestSubmission.id} • Grade: {publicTestSubmission.grade != null ? formatGrade(publicTestSubmission.grade) : '—'}
                                </span>
                            </div>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: 'var(--text-secondary)', maxHeight: '220px', overflow: 'auto' }}>
                                {publicTestSubmission.feedback || 'No feedback returned.'}
                            </pre>
                        </div>
                    )}

                    {assignment?.status === 'closed' ? (
                        <div style={{ padding: '12px', background: 'var(--danger-bg)', color: 'var(--danger-color)', borderRadius: '8px', textAlign: 'center' }}>
                            This assignment is closed.
                        </div>
                    ) : existingSubmission && assignment && (assignment.status === 'late' || (assignment.status === 'active' && new Date() > new Date(assignment.due_date))) ? (
                        <div style={{ padding: '12px', background: 'var(--danger-bg)', color: 'var(--danger-color)', borderRadius: '8px', textAlign: 'center' }}>
                            Cannot resubmit a late assignment.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {submitMode === 'upload' && (
                                <>
                                    <button
                                        type="submit"
                                        className="btn btn-primary w-full"
                                        disabled={isSubmitting || selectedFiles.length === 0}
                                        style={{
                                            flex: 2,
                                            minWidth: '220px',
                                            opacity: selectedFiles.length > 0 && !isSubmitting ? 1 : 0.5
                                        }}
                                    >
                                        {isSubmitting ? 'Submitting...' : existingSubmission ? 'Resubmit Assignment' : 'Submit Assignment'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default SubmitAssignment;
