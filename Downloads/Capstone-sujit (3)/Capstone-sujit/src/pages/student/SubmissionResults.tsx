import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSubmission, getFileUrl, getSubmissions, getAssignment, runAutograde, runTests, formatGrade } from '../../lib/api';
import type { Submission, Assignment, TestResult } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { languageFromFilename } from '../../lib/monacoLanguage';
import './SubmissionResults.css';

const MonacoCodeEditor = React.lazy(() => import('../../components/editor/MonacoCodeEditor'));

const SubmissionResults: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [previewFileName, setPreviewFileName] = useState<string | null>(null);
    const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
    const [codeContent, setCodeContent] = useState<string>('');
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [publicTestSubmission, setPublicTestSubmission] = useState<Submission | null>(null);
    const [isRunningPublicTests, setIsRunningPublicTests] = useState(false);
    const [terminalLines, setTerminalLines] = useState<string[]>([]);

    useEffect(() => {
        async function loadSubmission() {
            if (!submissionId || !assignmentId) return;
            try {
                const [data, submissionsData, assignmentData] = await Promise.all([
                    getSubmission(parseInt(submissionId, 10)),
                    getSubmissions({ assignment_id: assignmentId, student_id: studentId }),
                    getAssignment(assignmentId)
                ]);
                setSubmission(data);
                setAllSubmissions(submissionsData);
                setAssignment(assignmentData);
            } catch (err) {
                setError('Failed to load submission');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        loadSubmission();
    }, [submissionId, assignmentId, studentId]);

    // Automatically open the main submitted file in the Monaco editor
    useEffect(() => {
        if (!submission) return;
        if (previewFileName || previewFileUrl) return;

        const files = submission.files && submission.files.length > 0
            ? submission.files
            : [{ name: submission.file_name, path: submission.file_path }];

        if (!files.length) return;

        const first = files[0];
        setPreviewFileName(first.name);
        setPreviewFileUrl(getFileUrl(first.path));
    }, [submission, previewFileName, previewFileUrl]);

    useEffect(() => {
        if (!previewFileUrl || !previewFileName) return;
        const isCodeFile = /\.(py|java|cpp|c|h|cs|js|ts|tsx|jsx|css|html|txt|json|md|sql)$/i.test(previewFileName);
        if (!isCodeFile) {
            setCodeContent('Preview is not available for this file type. Use Download instead.');
            return;
        }

        let cancelled = false;
        async function fetchCode() {
            setIsPreviewLoading(true);
            try {
                const res = await fetch(previewFileUrl);
                if (!res.ok) throw new Error('Failed to load file');
                const text = await res.text();
                if (!cancelled) {
                    setCodeContent(text);
                }
            } catch (e) {
                if (!cancelled) {
                    setCodeContent('Error loading file content.');
                }
            } finally {
                if (!cancelled) {
                    setIsPreviewLoading(false);
                }
            }
        }
        fetchCode();

        return () => {
            cancelled = true;
        };
    }, [previewFileUrl, previewFileName]);

    const editorLanguage = useMemo(
        () => languageFromFilename(previewFileName),
        [previewFileName]
    );

    const handleRunPublicTests = async () => {
        if (!submission || !assignment) return;
        const trimmed = codeContent.trim();
        if (!trimmed) {
            setTerminalLines(prev => [...prev, '$ run public tests', 'Error: No code loaded in preview. Select a code file first.', '']);
            return;
        }

        setIsRunningPublicTests(true);
        setPublicTestSubmission(null);
        setError(null);
        setTerminalLines(prev => [...prev, `$ run public tests (${assignment.language || 'python'})`, '']);

        try {
            const graded = await runAutograde(submission.id, { publicOnly: true });
            setPublicTestSubmission(graded);

            const { results } = await runTests(
                assignmentId!,
                codeContent,
                assignment.language || 'python',
                submission.id
            );

            const publicResults = results.filter((r: TestResult) => r.is_public === 1);
            const passed = publicResults.filter(r => r.passed).length;
            const lines: string[] = [];
            publicResults.forEach((r, i) => {
                lines.push(`Test ${i + 1}: ${r.passed ? 'PASS' : 'FAIL'}`);
                if (!r.passed) {
                    if (r.expected != null) lines.push(`  expected: ${r.expected}`);
                    if (r.actual != null) lines.push(`  actual:   ${r.actual}`);
                    if (r.error) lines.push(`  error: ${r.error}`);
                }
            });
            lines.push('---', `Passed public tests: ${passed}/${publicResults.length}`, '');
            setTerminalLines(prev => [...prev, ...lines]);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to run public tests.';
            setError('Failed to run public tests.');
            setTerminalLines(prev => [...prev, `Error: ${msg}`, '']);
        } finally {
            setIsRunningPublicTests(false);
        }
    };

    if (loading) {
        return (
            <div className="submission-results">
                <div className="loading-state">
                    <p>Loading submission...</p>
                </div>
            </div>
        );
    }

    if (error || !submission) {
        return (
            <div className="submission-results">
                <div className="mb-4" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <Link to={`/student/courses/${courseId}/assignments/${assignmentId}`} className="text-gray-500 hover:text-gray-900 back-link">
                        &larr; Back to Assignment
                    </Link>
                </div>
                <div className="results-header">
                    <h1 className="results-title">Submission Not Found</h1>
                </div>
                <p style={{ color: '#dc2626' }}>{error || 'This submission does not exist.'}</p>
            </div>
        );
    }

    return (
        <div className="submission-results">
            <div className="mb-4" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Link to={`/student/courses/${courseId}/assignments/${assignmentId}`} className="text-gray-500 hover:text-gray-900 back-link">
                    &larr; Back to Assignment
                </Link>
            </div>

            <div className="results-header">
                <h1 className="results-title">Submission Details</h1>
                <span className={`status-pill status-${submission.status}`} style={{
                    padding: '2px 8px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: submission.status === 'graded' ? 'var(--success-bg)' : submission.status === 'pending' ? 'var(--secondary-color)' : 'var(--light-grey)',
                    color: 'var(--text-primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 'fit-content',
                    textTransform: 'capitalize'
                }}>
                    {submission.status}
                </span>
            </div>

            <div className="results-content" style={{ marginTop: '24px' }}>
                <div style={{
                    background: 'var(--bg-surface)',
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '20px'
                }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>File Information</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            <tr>
                                <td style={{ padding: '8px 0', color: 'var(--text-secondary)', verticalAlign: 'top' }}>Files Submitted:</td>
                                <td style={{ padding: '8px 0', fontWeight: 500 }}>
                                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                        {(submission.files || [{ name: submission.file_name, path: submission.file_path }]).map((f, i) => {
                                            const url = getFileUrl(f.path);
                                            return (
                                                <li key={i} style={{ marginBottom: '4px' }}>
                                                    {f.name}{' '}
                                                    <button
                                                        type="button"
                                                        style={{
                                                            marginLeft: '8px',
                                                            fontSize: '0.8rem',
                                                            borderRadius: '999px',
                                                            padding: '2px 10px',
                                                            border: '1px solid var(--border-color)',
                                                            background: 'var(--bg-surface)',
                                                            cursor: 'pointer'
                                                        }}
                                                        onClick={() => {
                                                            setPreviewFileName(f.name);
                                                            setPreviewFileUrl(url);
                                                        }}
                                                    >
                                                        Preview in editor
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </td>
                            </tr>
                            <tr>
                                <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>Submitted At:</td>
                                <td style={{ padding: '8px 0' }}>{new Date(submission.submitted_at).toLocaleString()}</td>
                            </tr>
                            {submission.updated_at !== submission.submitted_at && (
                                <tr>
                                    <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>Last Updated:</td>
                                    <td style={{ padding: '8px 0' }}>{new Date(submission.updated_at).toLocaleString()}</td>
                                </tr>
                            )}
                            {submission.grade !== null && submission.grade !== undefined && (submission.status === 'graded' || submission.status === 'returned') && (
                                <tr>
                                    <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>Grade:</td>
                                    <td style={{ padding: '8px 0', fontWeight: 600, color: '#16a34a' }}>{formatGrade(submission.grade)}/{assignment?.points || 100}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {submission.feedback && (submission.status === 'graded' || submission.status === 'returned') && (
                    <div style={{
                        background: 'var(--bg-surface)',
                        padding: '20px',
                        borderRadius: '8px',
                        marginBottom: '20px'
                    }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Instructor Feedback</h3>
                        <p style={{ margin: 0, lineHeight: 1.6, wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>{submission.feedback}</p>
                    </div>
                )}

                {previewFileName && (
                    <div className="student-runner-layout">
                        <section className="student-runner-section editor-section">
                            <div className="student-runner-section-header">
                                <span>Editor</span>
                            </div>
                            <div className="student-runner-monaco-wrap">
                                {isPreviewLoading ? (
                                    <div className="student-runner-monaco-fallback">Loading file...</div>
                                ) : (
                                    <React.Suspense fallback={<div className="student-runner-monaco-fallback">Loading editor…</div>}>
                                        <MonacoCodeEditor
                                            value={codeContent}
                                            language={editorLanguage}
                                            height={360}
                                            readOnly
                                            theme="dark"
                                            showMiniMap
                                            wordWrap="on"
                                            fontSize={14}
                                        />
                                    </React.Suspense>
                                )}
                            </div>
                        </section>

                        <section className="student-runner-section terminal-section">
                            <div className="student-runner-section-header terminal-header">
                                <span className="student-runner-header-icon">
                                    $
                                </span>
                                <span>Public test output</span>
                                <button
                                    type="button"
                                    className="student-runner-btn primary"
                                    onClick={handleRunPublicTests}
                                    disabled={isRunningPublicTests}
                                >
                                    {isRunningPublicTests ? 'Running…' : 'Run Public Tests'}
                                </button>
                            </div>
                            <div className="student-runner-terminal-body">
                                <div className="student-runner-output">
                                    {terminalLines.length === 0 ? (
                                        <div className="student-runner-prompt-line">
                                            <span className="student-runner-prompt">$</span>
                                            <span className="student-runner-placeholder"> Click Run Public Tests to execute against assignment public tests.</span>
                                        </div>
                                    ) : (
                                        terminalLines.map((line, i) => (
                                            <div key={i} className={line.startsWith('$') ? 'student-runner-prompt-line' : 'student-runner-output-line'}>
                                                {line.startsWith('$') ? (
                                                    <span className="student-runner-prompt">{line}</span>
                                                ) : (
                                                    <span className="student-runner-text">{line || '\u00A0'}</span>
                                                )}
                                            </div>
                                        ))
                                    )}
                                    {isRunningPublicTests && (
                                        <div className="student-runner-prompt-line">
                                            <span className="student-runner-prompt">$</span>
                                            <span className="student-runner-cursor">▌</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '24px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {(submission.files || [{ name: submission.file_name, path: submission.file_path }]).map((f, i) => (
                            <a
                                key={i}
                                href={getFileUrl(f.path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-outline btn-pill"
                            >
                                Download {f.name}
                            </a>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary btn-pill"
                        onClick={handleRunPublicTests}
                        disabled={isRunningPublicTests}
                    >
                        {isRunningPublicTests ? 'Running public tests...' : 'Run Public Tests Again'}
                    </button>
                    <Link
                        to={`/student/courses/${courseId}/assignments/${assignmentId}/submit`}
                        className="btn btn-primary btn-pill"
                    >
                        Resubmit Assignment
                    </Link>
                </div>

                {publicTestSubmission && (
                    <div style={{
                        background: 'var(--bg-surface)',
                        padding: '20px',
                        borderRadius: '8px',
                        marginTop: '20px'
                    }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Public Tests Result (latest run)</h3>
                        <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            Grade: {publicTestSubmission.grade ?? '—'}/{assignment?.points || 100}
                        </p>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: 'var(--text-secondary)', maxHeight: '220px', overflow: 'auto' }}>
                            {publicTestSubmission.feedback || 'No feedback returned.'}
                        </pre>
                    </div>
                )}

                {allSubmissions.length > 0 && (
                    <div className="section" style={{ marginTop: '32px' }}>
                        <h2 className="section-title" style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '16px' }}>Submission History</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {allSubmissions.map((sub, index) => {
                                const isSubGraded = sub.status === 'graded' || sub.status === 'returned';
                                const attemptLabel = `Attempt ${allSubmissions.length - index}`;
                                const isCurrent = sub.id === parseInt(submissionId || '0', 10);

                                return (
                                    <div key={sub.id} style={{
                                        border: isCurrent ? '2px solid var(--primary-light)' : '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        padding: '16px',
                                        background: isCurrent ? 'var(--light-grey)' : 'var(--bg-surface)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                                {attemptLabel}
                                                {isCurrent && (
                                                    <span style={{
                                                        color: 'var(--text-primary)',
                                                        marginLeft: '8px',
                                                        fontSize: '12px',
                                                        background: 'var(--light-grey)',
                                                        padding: '2px 8px',
                                                        borderRadius: '12px'
                                                    }}>
                                                        Current View
                                                    </span>
                                                )}
                                            </div>
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
                                                    ? `${formatGrade(sub.grade)}/${assignment?.points || 100}`
                                                    : `-/${assignment?.points || 100}`}
                                            </div>
                                        </div>
                                        {!isCurrent && (
                                            <Link
                                                to={`/student/courses/${courseId}/assignments/${assignmentId}/submissions/${sub.id}`}
                                                className="btn btn-outline"
                                                style={{ borderColor: 'var(--text-primary)', color: 'var(--text-primary)' }}
                                            >
                                                View Details
                                            </Link>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SubmissionResults;
