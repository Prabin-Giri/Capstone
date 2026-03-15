import React, { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { runCode, runTests, createSubmission } from '../lib/api';
import { getUser } from '../lib/auth';
import { Play, Terminal, AlertCircle, Trash2, ArrowLeft, Send, FlaskConical } from 'lucide-react';
import './CodeRunner.css';

const CODE_RUNNER_PREFILL_KEY = 'codeRunnerPrefill';

interface AssignmentContext {
    courseId: string;
    assignmentId: string;
    assignmentTitle: string;
    language: string;
}

const MonacoCodeEditor = React.lazy(() => import('../components/editor/MonacoCodeEditor'));

const PYTHON_SAMPLE = `# Python: use Run with optional input in the terminal panel
name = input("Name? ")
print("Hello,", name)
`;

const JAVA_SAMPLE = `// Java: public class must be Main
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.nextLine();
        System.out.println("Hello, " + name);
        sc.close();
    }
}
`;

type RunResult = { stdout: string; stderr: string; exitCode: number; timedOut: boolean } | null;

const CodeRunner: React.FC = () => {
    const navigate = useNavigate();
    const [language, setLanguage] = useState<'python' | 'java'>('python');
    const [code, setCode] = useState(PYTHON_SAMPLE);
    const [stdin, setStdin] = useState('');
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RunResult>(null);
    const [error, setError] = useState<string | null>(null);
    const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
    const [assignmentContext, setAssignmentContext] = useState<AssignmentContext | null>(null);
    const [runningTests, setRunningTests] = useState(false);
    const [testResults, setTestResults] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(CODE_RUNNER_PREFILL_KEY);
            if (raw) {
                sessionStorage.removeItem(CODE_RUNNER_PREFILL_KEY);
                const data = JSON.parse(raw) as { code?: string; language?: string; stdin?: string; assignmentId?: string; courseId?: string; assignmentTitle?: string };
                if (data.code != null) setCode(data.code);
                if (data.language === 'java' || data.language === 'python') setLanguage(data.language);
                if (data.stdin != null) setStdin(data.stdin);
                if (data.assignmentId && data.courseId) {
                    setAssignmentContext({
                        courseId: data.courseId,
                        assignmentId: data.assignmentId,
                        assignmentTitle: data.assignmentTitle || 'Assignment',
                        language: (data.language || 'python').toLowerCase(),
                    });
                }
            }
        } catch (_) {}
    }, []);

    const handleRun = async () => {
        setRunning(true);
        setError(null);
        setResult(null);
        setTerminalHistory((prev) => [...prev, `$ run ${language}`, '']);

        try {
            const out = await runCode(code, language, stdin);
            setResult(out);

            const lines: string[] = [];
            if (out.timedOut) lines.push('[TIMED OUT]');
            lines.push(`(exit code: ${out.exitCode})`);
            if (out.stdout.trim()) lines.push(out.stdout.trim());
            if (out.stderr.trim()) lines.push(out.stderr.trim());
            if (!out.stdout.trim() && !out.stderr.trim() && !out.timedOut) lines.push('(no output)');

            setTerminalHistory((prev) => [...prev.slice(0, -1), prev[prev.length - 1], ...lines, '']);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Run failed';
            setError(msg);
            setTerminalHistory((prev) => [...prev.slice(0, -1), prev[prev.length - 1], `Error: ${msg}`, '']);
        } finally {
            setRunning(false);
        }
    };

    const handleLanguageChange = (lang: 'python' | 'java') => {
        setLanguage(lang);
        setCode(lang === 'python' ? PYTHON_SAMPLE : JAVA_SAMPLE);
        setResult(null);
        setError(null);
    };

    const handleRunTests = async () => {
        if (!assignmentContext) return;
        setRunningTests(true);
        setError(null);
        setTestResults(null);
        setTerminalHistory((prev) => [...prev, '$ run assignment tests', '']);
        try {
            const { results } = await runTests(assignmentContext.assignmentId, code, assignmentContext.language || language);
            const passed = results.filter((r: { passed: boolean }) => r.passed).length;
            const summary = `Passed ${passed} / ${results.length} test(s).`;
            setTestResults(summary);
            const lines = results.map((r: { passed: boolean; input?: string }) => (r.passed ? '  ✓ Pass' : '  ✗ Fail') + (r.input != null ? ` (input: ${String(r.input).slice(0, 30)}${r.input.length > 30 ? '...' : ''})` : ''));
            setTerminalHistory((prev) => [...prev.slice(0, -1), prev[prev.length - 1], summary, ...lines, '']);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Run tests failed';
            setError(msg);
            setTerminalHistory((prev) => [...prev.slice(0, -1), prev[prev.length - 1], `Error: ${msg}`, '']);
        } finally {
            setRunningTests(false);
        }
    };

    const handleSubmitAssignment = async () => {
        if (!assignmentContext) return;
        const user = getUser();
        const studentId = user?.id;
        if (!studentId) {
            setError('You must be logged in to submit.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const filename = (assignmentContext.language || language) === 'java' ? 'Main.java' : 'main.py';
            const file = new File([code], filename, { type: 'text/plain' });
            const submission = await createSubmission(assignmentContext.assignmentId, studentId, [file]);
            setTerminalHistory((prev) => [...prev, '$ submit assignment', `Submitted. Submission #${submission.id}`, '']);
            navigate(`/student/courses/${assignmentContext.courseId}/assignments/${assignmentContext.assignmentId}/submissions/${submission.id}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Submit failed';
            setError(msg);
            setTerminalHistory((prev) => [...prev, '$ submit assignment', `Error: ${msg}`, '']);
        } finally {
            setSubmitting(false);
        }
    };

    const monacoLang = language === 'python' ? 'python' : 'java';

    return (
        <div className="code-runner-page">
            {assignmentContext && (
                <div className="code-runner-assignment-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 1rem', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button type="button" onClick={() => navigate(`/student/courses/${assignmentContext.courseId}/assignments/${assignmentContext.assignmentId}/submit`)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.875rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <ArrowLeft size={16} /> Back to assignment
                        </button>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Assignment: {assignmentContext.assignmentTitle}</span>
                    </div>
                </div>
            )}
            <header className="code-runner-header">
                <div className="code-runner-title-row">
                    <Terminal size={28} className="code-runner-icon" />
                    <h1 className="code-runner-title">Code Runner</h1>
                </div>
                <p className="code-runner-subtitle">
                    {assignmentContext ? 'Write your code, run it with custom input, run assignment tests, and submit.' : 'Instructors and students can execute programs in Python or Java here with manual input. Use assignment pages to run against test datasets.'}
                </p>
            </header>

            <div className="code-runner-layout">
                <section className="code-runner-section code-section">
                    <div className="code-runner-section-header">
                        <span>Editor</span>
                        <div className="code-runner-lang-tabs">
                            <button
                                type="button"
                                className={language === 'python' ? 'active' : ''}
                                onClick={() => handleLanguageChange('python')}
                            >
                                Python
                            </button>
                            <button
                                type="button"
                                className={language === 'java' ? 'active' : ''}
                                onClick={() => handleLanguageChange('java')}
                            >
                                Java
                            </button>
                        </div>
                    </div>
                    <div className="code-runner-monaco-wrap">
                        <Suspense fallback={<div className="code-runner-monaco-fallback">Loading editor...</div>}>
                            <MonacoCodeEditor
                                value={code}
                                onChange={(v) => setCode(v ?? '')}
                                language={monacoLang}
                                height={420}
                                theme="dark"
                                showMiniMap={false}
                                fontSize={13}
                            />
                        </Suspense>
                    </div>
                </section>

                <section className="code-runner-section terminal-section">
                    <div className="code-runner-section-header terminal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Terminal size={18} />
                            Terminal
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="code-runner-run-btn"
                                onClick={handleRun}
                                disabled={running}
                            >
                                <Play size={16} />
                                {running ? 'Running...' : 'Run'}
                            </button>
                            {assignmentContext && (
                                <>
                                    <button
                                        type="button"
                                        className="code-runner-run-btn"
                                        onClick={handleRunTests}
                                        disabled={runningTests}
                                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                    >
                                        <FlaskConical size={16} />
                                        {runningTests ? 'Running tests...' : 'Run tests'}
                                    </button>
                                    <button
                                        type="button"
                                        className="code-runner-run-btn"
                                        onClick={handleSubmitAssignment}
                                        disabled={submitting}
                                        style={{ background: 'var(--primary-color)', border: 'none', color: 'white' }}
                                    >
                                        <Send size={16} />
                                        {submitting ? 'Submitting...' : 'Submit assignment'}
                                    </button>
                                </>
                            )}
                            <button
                                type="button"
                                onClick={() => { setTerminalHistory([]); setResult(null); setError(null); setTestResults(null); }}
                                disabled={terminalHistory.length === 0}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.75rem', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: terminalHistory.length === 0 ? 'default' : 'pointer', opacity: terminalHistory.length === 0 ? 0.6 : 1 }}
                            >
                                <Trash2 size={14} />
                                Clear
                            </button>
                        </div>
                    </div>
                    <div className="terminal-body">
                        <div className="terminal-input-row">
                            <label className="terminal-label">Stdin (input to program):</label>
                            <textarea
                                className="terminal-stdin"
                                value={stdin}
                                onChange={(e) => setStdin(e.target.value)}
                                placeholder="Optional input..."
                                spellCheck={false}
                                rows={2}
                            />
                        </div>
                        <div className="terminal-output">
                            {terminalHistory.length === 0 ? (
                                <div className="terminal-prompt-line">
                                    <span className="terminal-prompt">$</span>
                                    <span className="terminal-placeholder"> Click Run to execute your code.</span>
                                </div>
                            ) : (
                                terminalHistory.map((line, i) => (
                                    <div key={i} className={line.startsWith('$') ? 'terminal-prompt-line' : 'terminal-output-line'}>
                                        {line.startsWith('$') ? (
                                            <>
                                                <span className="terminal-prompt">{line}</span>
                                            </>
                                        ) : (
                                            <span className="terminal-text">{line || '\u00A0'}</span>
                                        )}
                                    </div>
                                ))
                            )}
                            {running && (
                                <div className="terminal-prompt-line">
                                    <span className="terminal-prompt">$</span>
                                    <span className="terminal-cursor">▌</span>
                                </div>
                            )}
                        </div>
                    </div>
                    {error && (
                        <div className="code-runner-error terminal-error">
                            <AlertCircle size={18} />
                            {error}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default CodeRunner;
