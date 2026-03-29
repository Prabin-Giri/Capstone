import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { getAssignment, getSubmissions, getTestCases, runTests, runCustomCode, UPLOADS_BASE } from '../../lib/api';
import { Code, Download, Eye, FolderOpen } from 'lucide-react';
import JSZip from 'jszip';
import type { Assignment, Submission, TestCase, TestResult } from '../../lib/api';
import './AssignmentDetails.css';
import { AssignmentEditor } from '../../components/ui/AssignmentEditor';
import type { EditorFile } from '../../components/ui/AssignmentEditor';

import { getUser } from '../../lib/auth';
import { showDialog } from '../../components/ui/Dialog';
import { getCommentChar, getLanguageFromFilename } from '../../lib/utils';

const AssignmentDetails: React.FC = () => {
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const { assignmentId } = useParams();
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [isRunningTests, setIsRunningTests] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const theme = (localStorage.getItem('app-theme') as 'dark' | 'light' | 'system') || 'system';

    // Lift up the state of current files from the editor so we can submit them
    const [editorFiles, setEditorFiles] = useState<EditorFile[]>([]);

    useEffect(() => {
        async function loadAssignment() {
            if (!assignmentId) return;
            try {
                const [assignmentData, submissionsData, testCaseData] = await Promise.all([
                    getAssignment(assignmentId),
                    getSubmissions({ assignment_id: assignmentId, student_id: studentId }),
                    getTestCases(assignmentId)
                ]);
                setAssignment(assignmentData);
                setSubmission(submissionsData.length > 0 ? submissionsData[0] : null);
                setAllSubmissions(submissionsData);
                setTestCases(testCaseData.filter(tc => tc.is_public));
            } catch (err) {
                console.error(err);
                setError('Failed to load assignment details.');
            } finally {
                setLoading(false);
            }
        }
        loadAssignment();
    }, [assignmentId]);

    // To load initial files from the latest submission if one exists:
    const [initialFiles, setInitialFiles] = useState<EditorFile[]>([]);

    useEffect(() => {
        async function fetchSubmissionFiles() {
            if (submission && submission.files && submission.files.length > 0) {
                try {
                    const loadedFiles = await Promise.all(
                        submission.files.map(async (file, index) => {
                            const url = `${UPLOADS_BASE}/uploads/${file.path}`;
                            const res = await fetch(url);
                            let content = '// Failed to load prior submission';
                            if (res.ok) {
                                content = await res.text();
                            }

                            return {
                                id: `submission-${index}`,
                                name: file.name,
                                content: content,
                                language: getLanguageFromFilename(file.name, assignment?.language || 'python'),
                                isStarter: false
                            };
                        })
                    );
                    setInitialFiles(loadedFiles);
                } catch (e) {
                    console.error("Error fetching past submission files", e);
                }
            } else if (submission) {
                // Fallback for old submissions without files array
                setInitialFiles([{
                    id: 'submission-0',
                    name: `submission.${assignment?.language === 'python' ? 'py' : assignment?.language === 'java' ? 'java' : 'js'}`,
                    content: '// Prior submission loaded (no files retrieved).\n// Run tests to fetch code or paste new code here.',
                    language: getLanguageFromFilename(`submission.${assignment?.language === 'python' ? 'py' : assignment?.language === 'java' ? 'java' : 'js'}`, assignment?.language || 'python'),
                    isStarter: false
                }]);
            }
        }

        fetchSubmissionFiles();
    }, [submission, assignment?.language]);

    // Set initial files to editor
    useEffect(() => {
        if (editorFiles.length === 0 && initialFiles.length > 0) {
            setEditorFiles(initialFiles);
        }
    }, [initialFiles]);

    if (loading) {
        return <div className="assignment-details"><div className="state-card">Loading...</div></div>;
    }

    if (error || !assignment) {
        return (
            <div className="assignment-details">
                <div className="state-card">
                    <h1 className="details-title">Assignment not found</h1>
                    <p className="details-subtitle">{error || 'Invalid assignment ID'}</p>
                    <Link to="/student" className="link-primary">Back to Dashboard</Link>
                </div>
            </div>
        );
    }

    // Use assignment.points if available, falling back to 100
    const points = assignment.points || 100;

    const toSafeHtml = (input: string) => {
        const raw = input ?? '';
        const looksLikeHtml = /<[^>]+>/.test(raw);
        if (!looksLikeHtml) {
            const escaped = raw
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            return escaped.replace(/\n/g, '<br />');
        }
        return raw
            .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
            .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '')
            .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '');
    };

    // Extract attachment-bubble links from description before rendering
    const instructionAttachments: { url: string; name: string }[] = [];
    const rawDescription = assignment.description || '';
    const attachBubbleRe = /<a[^>]*class="attachment-bubble"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let abMatch;
    while ((abMatch = attachBubbleRe.exec(rawDescription)) !== null) {
        instructionAttachments.push({ url: abMatch[1], name: abMatch[2].trim() });
    }
    const descriptionWithoutFiles = rawDescription.replace(/<a[^>]*class="attachment-bubble"[^>]*>.*?<\/a>/gi, '').trim();
    const descriptionHtml = toSafeHtml(descriptionWithoutFiles || (!instructionAttachments.length ? 'No description provided.' : ''));

    // Strip server-added timestamp-random prefix: "1234567890-123456789-realname.py" → "realname.py"
    function cleanFilename(storedName: string): string {
        return storedName.replace(/^\d+-\d+-/, '');
    }

    // Parse starter_code_path: supports plain string (legacy) or JSON array
    function parseStarterPaths(raw: string): string[] {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [raw];
        } catch {
            return [raw];
        }
    }

    async function handleInstructionDownload(url: string, filename: string) {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch {
            window.open(url, '_blank');
        }
    }

    async function handleLoadIntoEditor(starterPath: string) {
        const url = `${UPLOADS_BASE}/uploads/${starterPath}`;
        const filename = cleanFilename(starterPath.split('/').pop() || starterPath);
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            let newFiles: EditorFile[] = [];

            if (filename.toLowerCase().endsWith('.zip')) {
                const zip = await JSZip.loadAsync(blob);
                const codeExts = new Set(['py','java','js','ts','jsx','tsx','php','c','cpp','h','txt','md','json','xml','html','css']);
                newFiles = await Promise.all(
                    Object.values(zip.files)
                        .filter((f: JSZip.JSZipObject) => !f.dir && codeExts.has(f.name.split('.').pop()?.toLowerCase() ?? ''))
                        .map(async (f: JSZip.JSZipObject) => {
                            const content = await f.async('string');
                            const name = f.name.split('/').pop() || f.name;
                            return { id: `starter-${Date.now()}-${f.name}`, name, content, language: getLanguageFromFilename(name, assignment?.language || 'python') } as EditorFile;
                        })
                );
            } else {
                const content = await blob.text();
                newFiles = [{ id: `starter-${Date.now()}`, name: filename, content, language: getLanguageFromFilename(filename, assignment?.language || 'python') }];
            }

            if (newFiles.length === 0) {
                await showDialog({ title: 'No code files', message: 'No readable code files were found.', confirmText: 'OK' });
                return;
            }

            // Append to existing editor files instead of replacing
            setEditorFiles(prev => {
                const existingNames = new Set(prev.map(f => f.name));
                const toAdd = newFiles.filter(f => !existingNames.has(f.name));
                const merged = [...prev, ...toAdd];
                setInitialFiles(merged);
                return merged;
            });

            document.querySelector('.section:has(.assignment-editor-container)')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            console.error('Load into editor failed', e);
            await showDialog({ title: 'Error', message: 'Could not load the starter code into the editor.', confirmText: 'OK' });
        }
    }

    const displayDate = new Date(assignment.due_date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
    });

    const isPastDue = new Date() > new Date(assignment.due_date);
    let displayStatus = assignment.status;
    if (assignment.status === 'active' && isPastDue) {
        displayStatus = 'late';
    }

    const handleRunEditorTests = async (editorFiles: EditorFile[]): Promise<{ results: TestResult[], log?: string }> => {
        if (!assignment) throw new Error("No assignment loaded");
        setIsRunningTests(true);
        try {
            const detectedLang = assignment.language || (editorFiles[0] ? getLanguageFromFilename(editorFiles[0].name) : 'python');
            const comment = getCommentChar(detectedLang);
            const codeToRun = editorFiles.length === 1 ? editorFiles[0].content : editorFiles.map(f => `${comment} File: ${f.name}\n${f.content}`).join('\n\n');
            const data = await runTests(assignment.id, codeToRun, detectedLang);
            setIsRunningTests(false);
            return {
                results: data.results,
                log: `Sent ${editorFiles.length} file(s) to execution engine.\nLanguage: ${detectedLang}\nTotal length: ${codeToRun.length} bytes.`
            };
        } catch (err) {
            setIsRunningTests(false);
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to run tests: ${msg}`);
        }
    };

    const handleRunCustomInput = async (files: EditorFile[], stdin: string) => {
        if (!assignment) return { stdout: '', stderr: 'Assignment not found', exitCode: 1, timedOut: false };
        setIsRunningTests(true);
        try {
            const detectedLang = assignment.language || (files[0] ? getLanguageFromFilename(files[0].name) : 'python');
            const comment = getCommentChar(detectedLang);
            const codeToRun = files.length === 1 ? files[0].content : files.map(f => `${comment} File: ${f.name}\n${f.content}`).join('\n\n');
            const data = await runCustomCode(assignment.id, codeToRun, detectedLang, stdin);
            setIsRunningTests(false);
            return data;
        } catch (err) {
            setIsRunningTests(false);
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to execute code: ${msg}`);
        }
    };

    const handleEditorChange = (files: EditorFile[]) => {
        setEditorFiles(files);
    };

    const handleSubmitAssignment = async (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        if (!assignment || !user || editorFiles.length === 0) return;

        const confirmSubmit = await showDialog({
            title: 'Submit Assignment',
            message: 'Are you sure you want to submit your current workspace?',
            type: 'confirm',
            confirmText: 'Submit',
            cancelText: 'Cancel',
        });
        if (!confirmSubmit) return;

        try {
            const formData = new FormData();
            formData.append('student_id', user.id);
            formData.append('assignment_id', assignment.id);
            formData.append('language', assignment.language || 'python');

            // Append each file separately to preserve multiple file structures
            editorFiles.forEach(f => {
                const blob = new Blob([f.content], { type: 'text/plain' });
                formData.append('files', new File([blob], f.name));
            });

            const token = localStorage.getItem('token');
            const url = `${UPLOADS_BASE}/api/submissions`;
            const method = 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to submit assignment');
            }

            await showDialog({ title: 'Submitted!', message: 'Assignment submitted successfully!', type: 'success', confirmText: 'OK' });
            // Reload page to show new submission
            window.location.reload();
        } catch (err) {
            console.error(err);
            await showDialog({ title: 'Error', message: err instanceof Error ? err.message : 'Submission failed', type: 'alert', confirmText: 'OK' });
        }
    };

    return (
        <div className="assignment-details">
            <div className="details-header">
                <div className="details-header-left">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <h1 className="details-title">{assignment.title}</h1>
                        {assignment.language && (
                            <div className="meta-item" style={{ margin: 0, padding: '2px 6px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', flexDirection: 'column', gap: '0px' }}>
                                <Code size={10} className="meta-icon" style={{ marginBottom: '-1px' }} />
                                <span className="meta-value text-capitalize" style={{ fontSize: '0.55rem', lineHeight: '1' }}>{assignment.language}</span>
                            </div>
                        )}
                    </div>
                    <div className="details-meta" style={{ textAlign: 'left', alignItems: 'flex-start' }}>
                        <div className="meta-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                            <span className="meta-label">DUE:</span>
                            <span className="meta-value" style={{ fontSize: '1rem' }}>{displayDate}</span>
                        </div>
                        <div className="meta-row-combined" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '0.5rem' }}>
                            <div className="meta-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                                <span className="meta-label">POINTS:</span>
                                <span className="meta-value" style={{ fontSize: '1.25rem' }}>{points}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="details-header-right">
                    <div className="details-grade">
                        <div className="grade-label">Current Grade</div>
                        <div className="grade-value">
                            {submission && submission.grade !== undefined && submission.grade !== null && (submission.status === 'graded' || submission.status === 'returned')
                                ? `${Number(submission.grade).toFixed(2)}/${points.toFixed(2)}`
                                : `-/${points.toFixed(2)}`}
                        </div>
                    </div>
                    <div className="details-status">
                        <StatusBadge status={displayStatus as any} />
                    </div>
                </div>
            </div>

            <div className="section">
                <h2 className="section-title">Instructions</h2>
                {descriptionWithoutFiles.trim() && (
                    <div className="description-text" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
                )}
                {instructionAttachments.length > 0 && (
                    <div className="instruction-attachments">
                        {instructionAttachments.map((file, i) => {
                            const ext = file.name.split('.').pop()?.toLowerCase() || '';
                            const isPreviewable = /^(pdf|png|jpg|jpeg|gif|webp|svg|py|js|ts|java|cpp|c|cs|txt|json|md|html|css)$/.test(ext);
                            return (
                                <div key={i} className="instruction-file-card">
                                    <div className="instruction-file-info">
                                        <Download size={15} className="instruction-file-icon" />
                                        <span className="instruction-file-name">{file.name}</span>
                                    </div>
                                    <div className="instruction-file-actions">
                                        {isPreviewable && (
                                            <a
                                                href={file.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="instruction-file-btn preview"
                                            >
                                                <Eye size={13} /> Preview
                                            </a>
                                        )}
                                        <button
                                            className="instruction-file-btn download"
                                            onClick={() => handleInstructionDownload(file.url, file.name)}
                                        >
                                            <Download size={13} /> Download
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {testCases.length > 0 && (
                <div className="section">
                    <h2 className="section-title">
                        <Eye size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                        Sample Test Cases
                    </h2>
                    <div className="test-cases-display">
                        {testCases.map((tc, idx) => (
                            <div key={tc.id} className="test-case-card-student">
                                <div className="tc-card-header">Test Case {idx + 1} ({tc.points} pts)</div>
                                <div className="tc-io-grid">
                                    <div className="io-group">
                                        <div className="io-label">Input</div>
                                        <pre className="io-content">{tc.input || '(None)'}</pre>
                                    </div>
                                    <div className="io-group">
                                        <div className="io-label">Expected Output</div>
                                        <pre className="io-content">{tc.expected_output}</pre>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="section">
                <h2 className="section-title">Test Runner</h2>
                <div style={{ marginTop: '1rem' }}>
                    <AssignmentEditor
                        initialFiles={initialFiles}
                        language={assignment.language || 'python'}
                        theme={theme}
                        onRunTests={handleRunEditorTests}
                        onRunCustomInput={handleRunCustomInput}
                        isRunning={isRunningTests}
                        points={points}
                        onChange={handleEditorChange}
                    />
                </div>
            </div>

            {assignment.starter_code_path && parseStarterPaths(assignment.starter_code_path).length > 0 && (
                <div className="section">
                    <h2 className="section-title">Assignment Materials</h2>
                    <div className="materials-box">
                        {parseStarterPaths(assignment.starter_code_path).map((starterPath, idx) => {
                            const storedFilename = starterPath.split('/').pop() || starterPath;
                            const displayName = cleanFilename(storedFilename);
                            const downloadUrl = `${UPLOADS_BASE}/uploads/${starterPath}`;
                            return (
                                <div key={idx} className="material-item">
                                    <div className="material-info">
                                        <Download size={20} color="var(--primary-text)" />
                                        <div>
                                            <div className="material-name">{displayName}</div>
                                            <div className="material-size">Starter code file</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            className="btn btn-outline"
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                            onClick={() => handleLoadIntoEditor(starterPath)}
                                        >
                                            <FolderOpen size={14} /> Load into Editor
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                            onClick={() => handleInstructionDownload(downloadUrl, displayName)}
                                        >
                                            <Download size={14} /> Download
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="section">
                <h2 className="section-title">Grading</h2>
                <p className="description-text" style={{ marginBottom: 0 }}>
                    This assignment is graded manually by the professor. Running tests will only show if your code passes or fails the sample cases and display logs. Your final grade will appear here after the professor reviews your submission. Total points available: <strong>{points}</strong>.
                </p>
            </div>

            {allSubmissions.length > 0 && (
                <div className="section">
                    <h2 className="section-title">Submission History</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {allSubmissions.map((sub, index) => {
                            const isSubGraded = sub.status === 'graded' || sub.status === 'returned';
                            const attemptLabel = `Attempt ${allSubmissions.length - index}`;

                            return (
                                <div key={sub.id} style={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    background: 'var(--bg-surface)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{attemptLabel}</div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            Submitted: {new Date(sub.submitted_at).toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                                            <span style={{ fontWeight: 500 }}>Status:</span>{' '}
                                            <span style={{
                                                color: isSubGraded ? '#16a34a' : '#d97706',
                                                textTransform: 'capitalize'
                                            }}>
                                                {sub.status}
                                            </span>
                                            {' • '}
                                            <span style={{ fontWeight: 500 }}>Grade:</span>{' '}
                                            {isSubGraded && sub.grade !== null && sub.grade !== undefined
                                                ? `${sub.grade}/${points}`
                                                : '-'}
                                        </div>
                                    </div>
                                    <Link
                                        to={`/student/courses/${assignment.course_id}/assignments/${assignment.id}/submissions/${sub.id}`}
                                        className="btn btn-outline"

                                    >
                                        View Details
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="action-bar">
                {displayStatus === 'closed' ? (
                    <button className="btn btn-primary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                        Assignment is Closed
                    </button>
                ) : (
                    <button onClick={handleSubmitAssignment} className="btn btn-primary">
                        {submission ? 'Resubmit Assignment' : 'Submit Assignment'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default AssignmentDetails;
