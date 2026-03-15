import React, { useEffect, useState, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAssignment, getTestCases, runTests, runCode } from '../../lib/api';
import type { Assignment, TestResult } from '../../lib/api';
import { getRole } from '../../lib/auth';
import { Terminal, Play, AlertCircle, ChevronLeft } from 'lucide-react';
import './FacultyAssignmentRunner.css';

const MonacoCodeEditor = React.lazy(() => import('../../components/editor/MonacoCodeEditor'));

const PYTHON_SAMPLE = `# Your code here - will be run against assignment test cases
def main():
    pass

if __name__ == "__main__":
    main()
`;

const JAVA_SAMPLE = `// Your code here - public class must be Main
public class Main {
    public static void main(String[] args) {
    }
}
`;

const FacultyAssignmentRunner: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const basePath = getRole() === 'ta' ? '/ta' : '/faculty';
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [code, setCode] = useState(PYTHON_SAMPLE);
    const [stdin, setStdin] = useState('');
    const [running, setRunning] = useState(false);
    const [terminalLines, setTerminalLines] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [runMode, setRunMode] = useState<'tests' | 'stdin'>('tests');

    useEffect(() => {
        if (!assignmentId) return;
        let cancelled = false;
        (async () => {
            try {
                const [a, tests] = await Promise.all([
                    getAssignment(assignmentId),
                    getTestCases(assignmentId),
                ]);
                if (cancelled) return;
                setAssignment(a);
                const lang = (a.language || 'python').toLowerCase();
                setCode(lang === 'java' ? JAVA_SAMPLE : PYTHON_SAMPLE);
                if (tests.length === 0) {
                    setTerminalLines([`$ No test cases defined for this assignment. Use "Run with input" to run with custom stdin.`]);
                }
            } catch (e) {
                if (!cancelled) setError('Failed to load assignment.');
            }
        })();
        return () => { cancelled = true; };
    }, [assignmentId]);

    const appendTerminal = (lines: string[]) => {
        setTerminalLines((prev) => [...prev, ...lines]);
    };

    const handleRunTests = async () => {
        if (!assignmentId || !assignment) return;
        setRunning(true);
        setError(null);
        appendTerminal([`$ run test cases (${assignment.language || 'python'})`, '']);

        try {
            const { results } = await runTests(assignmentId, code, assignment.language || 'python');
            const lines: string[] = [];
            let passed = 0;
            results.forEach((r: TestResult, i: number) => {
                const ok = r.passed;
                if (ok) passed++;
                lines.push(`Test ${i + 1}: ${ok ? 'PASS' : 'FAIL'}${r.points != null ? ` (${r.points} pts)` : ''}`);
                if (!ok) {
                    if (r.expected != null) lines.push(`  expected: ${r.expected}`);
                    if (r.actual != null) lines.push(`  actual:   ${r.actual}`);
                    if (r.error) lines.push(`  error: ${r.error}`);
                }
            });
            lines.push('---');
            lines.push(`Passed: ${passed}/${results.length}`);
            lines.push('');
            appendTerminal(lines);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Run failed';
            setError(msg);
            appendTerminal([`Error: ${msg}`, '']);
        } finally {
            setRunning(false);
        }
    };

    const handleRunStdin = async () => {
        if (!assignment) return;
        const lang = (assignment.language || 'python').toLowerCase();
        if (lang !== 'python' && lang !== 'java') {
            appendTerminal(['$ run with input', `Error: Only Python and Java are supported for stdin run.`, '']);
            return;
        }
        setRunning(true);
        setError(null);
        appendTerminal([`$ run with input (${lang})`, '']);

        try {
            const out = await runCode(code, lang as 'python' | 'java', stdin);
            const lines: string[] = [];
            if (out.timedOut) lines.push('[TIMED OUT]');
            lines.push(`(exit code: ${out.exitCode})`);
            if (out.stdout.trim()) lines.push(out.stdout.trim());
            if (out.stderr.trim()) lines.push(out.stderr.trim());
            if (!out.stdout.trim() && !out.stderr.trim() && !out.timedOut) lines.push('(no output)');
            lines.push('');
            appendTerminal(lines);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Run failed';
            setError(msg);
            appendTerminal([`Error: ${msg}`, '']);
        } finally {
            setRunning(false);
        }
    };

    if (!assignment && !error) {
        return <div className="faculty-runner-page"><div className="faculty-runner-loading">Loading...</div></div>;
    }
    if (!assignment) {
        return (
            <div className="faculty-runner-page">
                <div className="faculty-runner-error-banner">
                    <AlertCircle size={20} />
                    {error || 'Assignment not found'}
                </div>
                <Link to={basePath}>Back to Dashboard</Link>
            </div>
        );
    }

    const lang = (assignment.language || 'python').toLowerCase();
    const monacoLang = lang === 'java' ? 'java' : 'python';

    return (
        <div className="faculty-runner-page">
            <header className="faculty-runner-header">
                <Link to={`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading`} className="faculty-runner-back">
                    <ChevronLeft size={18} />
                    Back to grading
                </Link>
                <div className="faculty-runner-title-row">
                    <Terminal size={24} className="faculty-runner-icon" />
                    <h1 className="faculty-runner-title">Run test cases</h1>
                </div>
                <p className="faculty-runner-subtitle">
                    {assignment.title} — Execute Python or Java using test datasets (Run test cases) or manual input (Run with input).
                </p>
            </header>

            <div className="faculty-runner-layout">
                <section className="faculty-runner-section editor-section">
                    <div className="faculty-runner-section-header">Editor</div>
                    <div className="faculty-runner-monaco-wrap">
                        <Suspense fallback={<div className="faculty-runner-monaco-fallback">Loading editor...</div>}>
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

                <section className="faculty-runner-section terminal-section">
                    <div className="faculty-runner-section-header terminal-header">
                        <Terminal size={18} />
                        <span>Terminal</span>
                        <div className="faculty-runner-actions">
                            <button
                                type="button"
                                className={`faculty-runner-btn ${runMode === 'tests' ? 'primary' : 'secondary'}`}
                                onClick={() => { setRunMode('tests'); handleRunTests(); }}
                                disabled={running}
                            >
                                <Play size={14} />
                                Run test cases
                            </button>
                            <button
                                type="button"
                                className={`faculty-runner-btn ${runMode === 'stdin' ? 'primary' : 'secondary'}`}
                                onClick={() => { setRunMode('stdin'); handleRunStdin(); }}
                                disabled={running}
                            >
                                <Play size={14} />
                                Run with input
                            </button>
                        </div>
                    </div>
                    <div className="faculty-runner-terminal-body">
                        <div className="faculty-runner-stdin-row">
                            <label className="faculty-runner-stdin-label">Stdin (for &quot;Run with input&quot;):</label>
                            <textarea
                                className="faculty-runner-stdin"
                                value={stdin}
                                onChange={(e) => setStdin(e.target.value)}
                                placeholder="Optional input..."
                                spellCheck={false}
                                rows={2}
                            />
                        </div>
                        <div className="faculty-runner-output">
                            {terminalLines.length === 0 ? (
                                <div className="faculty-runner-prompt-line">
                                    <span className="faculty-runner-prompt">$</span>
                                    <span className="faculty-runner-placeholder"> Run test cases or Run with input.</span>
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
                    {error && (
                        <div className="faculty-runner-error-banner inline">
                            <AlertCircle size={18} />
                            {error}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default FacultyAssignmentRunner;
