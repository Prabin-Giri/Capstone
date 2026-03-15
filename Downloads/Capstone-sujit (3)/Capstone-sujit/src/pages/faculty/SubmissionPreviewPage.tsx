import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { getSubmission, getAssignment, getFileUrl, runTests, runCode } from '../../lib/api';
import type { Submission, Assignment } from '../../lib/api';
import { getRole } from '../../lib/auth';
import { languageFromFilename } from '../../lib/monacoLanguage';
import { Play, Terminal, ChevronLeft, Trash2 } from 'lucide-react';
import './FacultyAssignmentRunner.css';

const MonacoCodeEditor = React.lazy(() => import('../../components/editor/MonacoCodeEditor'));

const SubmissionPreviewPage: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const [searchParams] = useSearchParams();
    const fileIndex = Math.max(0, parseInt(searchParams.get('file') || '0', 10));
    const basePath = getRole() === 'ta' ? '/ta' : '/faculty';

    const [submission, setSubmission] = useState<Submission | null>(null);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [codeContent, setCodeContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [terminalLines, setTerminalLines] = useState<string[]>([]);
    const [stdin, setStdin] = useState('');
    const [running, setRunning] = useState(false);
    const [currentFileIndex, setCurrentFileIndex] = useState(fileIndex);

    const files = submission ? (submission.files || [{ name: submission.file_name, path: submission.file_path }]) : [];

    useEffect(() => {
        if (!submissionId || !assignmentId) return;
        let cancelled = false;
        (async () => {
            try {
                const [sub, assign] = await Promise.all([
                    getSubmission(parseInt(submissionId, 10)),
                    getAssignment(assignmentId)
                ]);
                if (cancelled) return;
                setSubmission(sub);
                setAssignment(assign);
            } catch (e) {
                if (!cancelled) setError('Failed to load submission.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [submissionId, assignmentId]);

    useEffect(() => {
        if (!submission) return;
        const list = submission.files || [{ name: submission.file_name, path: submission.file_path }];
        if (list.length === 0) return;
        const idx = Math.min(currentFileIndex, list.length - 1);
        const file = list[idx];
        const url = getFileUrl(file.path);
        let cancelled = false;
        setCodeContent(null);
        fetch(url)
            .then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.text(); })
            .then(text => { if (!cancelled) setCodeContent(text); })
            .catch(() => { if (!cancelled) setCodeContent('Error loading file.'); });
        return () => { cancelled = true; };
    }, [submission, currentFileIndex]);

    const handleRunTests = async () => {
        if (!assignmentId || !assignment || codeContent == null || !submission) return;
        const trimmed = codeContent.trim();
        if (!trimmed || /^\(exit code|\n?\s*Test \d+:\s*(PASS|FAIL)/m.test(trimmed) || /^Passed:\s*\d+\/\d+/m.test(trimmed)) {
            setTerminalLines(prev => [...prev, '$ run test cases', 'Error: Content does not look like source code. Preview a code file (e.g. .py).', '']);
            return;
        }
        setRunning(true);
        setTerminalLines(prev => [...prev, `$ run test cases (${assignment.language || 'python'})`, '']);
        try {
            const fileList = submission.files || [{ name: submission.file_name, path: submission.file_path }];
            const currentFileName = fileList[Math.min(currentFileIndex, fileList.length - 1)]?.name;
            const { results } = await runTests(
                assignmentId,
                codeContent,
                assignment.language || 'python',
                parseInt(submissionId!, 10),
                currentFileName
            );
            const passed = results.filter(r => r.passed).length;
            const lines: string[] = [];
            results.forEach((r, i) => {
                lines.push(`Test ${i + 1}: ${r.passed ? 'PASS' : 'FAIL'}`);
                if (!r.passed) {
                    if (r.expected != null) lines.push(`  expected: ${r.expected}`);
                    if (r.actual != null) lines.push(`  actual:   ${r.actual}`);
                    if (r.error) lines.push(`  error: ${r.error}`);
                }
            });
            lines.push('---', `Passed: ${passed}/${results.length}`, '');
            setTerminalLines(prev => [...prev, ...lines]);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Run failed';
            setTerminalLines(prev => [...prev, `Error: ${msg}`, '']);
        } finally {
            setRunning(false);
        }
    };

    const handleRunWithInput = async () => {
        if (!assignment || codeContent == null || !submission) return;
        const trimmed = codeContent.trim();
        if (!trimmed || /^\(exit code|\n?\s*Test \d+:\s*(PASS|FAIL)/m.test(trimmed) || /^Passed:\s*\d+\/\d+/m.test(trimmed)) {
            setTerminalLines(prev => [...prev, '$ run with input', 'Error: Content does not look like source code.', '']);
            return;
        }
        const lang = (assignment.language || 'python').toLowerCase();
        if (lang !== 'python' && lang !== 'java') {
            setTerminalLines(prev => [...prev, '$ run with input', `Unsupported language: ${lang}. Use Python or Java.`, '']);
            return;
        }
        setRunning(true);
        setTerminalLines(prev => [...prev, `$ run with input (${lang})`, '']);
        try {
            const out = await runCode(codeContent, lang as 'python' | 'java', stdin);
            const lines: string[] = [];
            if (out.timedOut) lines.push('[TIMED OUT]');
            lines.push(`(exit code: ${out.exitCode})`);
            if (out.stdout.trim()) lines.push(out.stdout.trim());
            if (out.stderr.trim()) lines.push(out.stderr.trim());
            if (!out.stdout.trim() && !out.stderr.trim() && !out.timedOut) lines.push('(no output)');
            setTerminalLines(prev => [...prev, ...lines, '']);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Run failed';
            setTerminalLines(prev => [...prev, `Error: ${msg}`, '']);
        } finally {
            setRunning(false);
        }
    };

    const openInCodeRunner = () => {
        if (codeContent != null) {
            try {
                const lang = (assignment?.language || 'python').toLowerCase();
                sessionStorage.setItem('codeRunnerPrefill', JSON.stringify({
                    code: codeContent,
                    language: lang === 'java' ? 'java' : 'python',
                    stdin: stdin || ''
                }));
            } catch (_) {}
        }
        window.open('/run', '_blank', 'noopener,noreferrer');
    };

    if (loading) return <div className="faculty-runner-page"><div className="faculty-runner-loading">Loading...</div></div>;
    if (error || !submission || !assignment) {
        return (
            <div className="faculty-runner-page">
                <p style={{ color: '#dc2626' }}>{error || 'Submission not found.'}</p>
                <Link to={`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading/${submissionId}`}>Back to grader</Link>
            </div>
        );
    }

    const currentFile = files[Math.min(currentFileIndex, files.length - 1)];
    const editorLang = languageFromFilename(currentFile?.name) || 'python';

    return (
        <div className="faculty-runner-page">
            <header className="faculty-runner-header">
                <Link to={`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading/${submissionId}`} className="faculty-runner-back">
                    <ChevronLeft size={18} />
                    Back to grader
                </Link>
                <div className="faculty-runner-title-row">
                    <Terminal size={24} className="faculty-runner-icon" />
                    <h1 className="faculty-runner-title">Preview &amp; run tests</h1>
                </div>
                <p className="faculty-runner-subtitle">
                    Submission by {submission.student_id} — {assignment.title}. {files.length > 1 ? 'Switch file below.' : ''}
                </p>
            </header>

            <div className="faculty-runner-layout">
                <section className="faculty-runner-section editor-section">
                    <div className="faculty-runner-section-header">
                        Editor
                        {files.length > 1 && (
                            <select
                                className="preview-file-select"
                                value={currentFileIndex}
                                onChange={e => setCurrentFileIndex(parseInt(e.target.value, 10))}
                            >
                                {files.map((f, i) => (
                                    <option key={i} value={i}>{f.name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div className="faculty-runner-monaco-wrap">
                        {codeContent === null ? (
                            <div className="faculty-runner-monaco-fallback">Loading file...</div>
                        ) : (
                            <Suspense fallback={<div className="faculty-runner-monaco-fallback">Loading editor...</div>}>
                                <MonacoCodeEditor
                                    value={codeContent}
                                    onChange={value => setCodeContent(value ?? '')}
                                    language={editorLang}
                                    height={420}
                                    theme="dark"
                                    showMiniMap={false}
                                    fontSize={13}
                                />
                            </Suspense>
                        )}
                    </div>
                </section>

                <section className="faculty-runner-section terminal-section">
                    <div className="faculty-runner-section-header terminal-header">
                        <Terminal size={18} />
                        <span>Terminal</span>
                        <div className="faculty-runner-actions">
                            <button type="button" className="faculty-runner-btn primary" onClick={handleRunTests} disabled={running}>
                                <Play size={14} />
                                {running ? 'Running...' : 'Run test cases'}
                            </button>
                            <button type="button" className="faculty-runner-btn secondary" onClick={handleRunWithInput} disabled={running}>
                                <Play size={14} />
                                Run with input
                            </button>
                            <button type="button" className="faculty-runner-btn secondary" onClick={() => setTerminalLines([])} disabled={terminalLines.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Trash2 size={14} />
                                Clear
                            </button>
                        </div>
                    </div>
                    <div className="faculty-runner-terminal-body">
                        <div className="faculty-runner-stdin-row" style={{ marginBottom: '0.5rem' }}>
                            <label className="faculty-runner-stdin-label">Manual input (for Run with input):</label>
                            <textarea
                                className="faculty-runner-stdin-input"
                                value={stdin}
                                onChange={e => setStdin(e.target.value)}
                                placeholder="Optional stdin..."
                                rows={2}
                                style={{ width: '100%', resize: 'vertical', padding: '0.5rem', fontSize: '0.85rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                            />
                        </div>
                        <div className="faculty-runner-output">
                            {terminalLines.length === 0 ? (
                                <div className="faculty-runner-prompt-line">
                                    <span className="faculty-runner-prompt">$</span>
                                    <span className="faculty-runner-placeholder"> Click Run test cases to execute against assignment tests.</span>
                                </div>
                            ) : (
                                terminalLines.map((line, i) => (
                                    <div key={i} className={line.startsWith('$') ? 'faculty-runner-prompt-line' : 'faculty-runner-output-line'}>
                                        {line.startsWith('$') ? <span className="faculty-runner-prompt">{line}</span> : <span className="faculty-runner-text">{line || '\u00A0'}</span>}
                                    </div>
                                ))
                            )}
                            {running && (
                                <div className="faculty-runner-prompt-line">
                                    <span className="faculty-runner-prompt">$</span>
                                    <span className="faculty-runner-cursor">▌</span>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default SubmissionPreviewPage;
