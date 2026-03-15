import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSubmission, getSubmissions, updateSubmission, getFileUrl, getAssignment, getAssignmentRubricCriteria, runTests, runCode, formatGrade, roundGrade, safeFetch } from '../../lib/api';
import type { Submission, Assignment, AssignmentRubricCriterion } from '../../lib/api';
import { getRole } from '../../lib/auth';
import { Button } from '../../components/ui/Button';
import { Play, Terminal, Trash2 } from 'lucide-react';
import AlertModal from '../../components/ui/AlertModal';

import './SubmissionGrader.css';

const MonacoCodeEditor = React.lazy(() => import('../../components/editor/MonacoCodeEditor'));

const SubmissionGrader: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const navigate = useNavigate();
    const basePath = getRole() === 'ta' ? '/ta' : '/faculty';
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [alertConfig, setAlertConfig] = useState<{ show: boolean, type: 'success' | 'error' | 'info', title: string, message: string }>({ show: false, type: 'info', title: '', message: '' });

    // Form State
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');
    const [rubricCriteria, setRubricCriteria] = useState<AssignmentRubricCriterion[]>([]);
    const [rubricScores, setRubricScores] = useState<Record<number, number | ''>>({});
    const [previewCode, setPreviewCode] = useState<string | null>(null);
    const [previewStdin, setPreviewStdin] = useState('');
    const [previewRunning, setPreviewRunning] = useState(false);
    const [previewTerminalLines, setPreviewTerminalLines] = useState<string[]>([]);

    useEffect(() => {
        loadData();
    }, [submissionId]);

    // Load code preview for the current submission (first file)
    useEffect(() => {
        const loadCode = async () => {
            if (!submission) {
                setPreviewCode(null);
                return;
            }
            const primaryFile = (submission.files && submission.files[0]) || { name: submission.file_name, path: submission.file_path };
            if (!primaryFile?.path) {
                setPreviewCode(null);
                return;
            }
            try {
                const url = getFileUrl(primaryFile.path);
                const res = await safeFetch(url);
                if (!res.ok) {
                    setPreviewCode(res.status === 404 ? 'File not found. It may have been deleted or not yet uploaded.' : 'Unable to load code preview.');
                    return;
                }
                const text = await res.text();
                setPreviewCode(text);
            } catch (err) {
                setPreviewCode(err instanceof Error ? err.message : 'Unable to load code preview.');
            }
        };
        loadCode();
    }, [submission]);

    async function loadData() {
        if (!submissionId || !assignmentId) return;
        try {
            const subData = await getSubmission(parseInt(submissionId));
            const [assignData, historyData, criteria] = await Promise.all([
                getAssignment(assignmentId),
                getSubmissions({ assignment_id: assignmentId, student_id: subData.student_id }),
                getAssignmentRubricCriteria(assignmentId).catch(() => [])
            ]);
            // Always treat the latest attempt as the active one for grading
            const sortedHistory = [...historyData].sort(
                (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
            );
            const activeSubmission = sortedHistory[0] || subData;

            setSubmission(activeSubmission);
            setAssignment(assignData);
            setAllSubmissions(sortedHistory.length > 0 ? sortedHistory : [subData]);
            setGrade(activeSubmission.grade != null ? formatGrade(activeSubmission.grade) : '');
            setFeedback(activeSubmission.feedback || '');
            setRubricCriteria(Array.isArray(criteria) ? criteria : []);
            const initialScores: Record<number, number | ''> = {};
            if (Array.isArray(criteria) && criteria.length > 0 && activeSubmission.feedback && activeSubmission.feedback.includes('RUBRIC_JSON:')) {
                try {
                    const idx = activeSubmission.feedback.lastIndexOf('RUBRIC_JSON:');
                    const jsonPart = activeSubmission.feedback.substring(idx + 'RUBRIC_JSON:'.length).trim();
                    const parsed = JSON.parse(jsonPart);
                    if (parsed?.scores && typeof parsed.scores === 'object') {
                        criteria.forEach((c: AssignmentRubricCriterion) => {
                            const val = parsed.scores[c.id] ?? parsed.scores[`criterion-${c.id}`];
                            if (typeof val === 'number') initialScores[c.id] = val;
                        });
                    }
                } catch (_) {}
            }
            if (Array.isArray(criteria)) criteria.forEach((c: AssignmentRubricCriterion) => { if (initialScores[c.id] === undefined) initialScores[c.id] = ''; });
            setRubricScores(initialScores);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    const handleRunPreviewTests = async () => {
        if (!assignment || !submission || previewCode == null) return;
        const trimmed = previewCode.trim();
        if (!trimmed) {
            setPreviewTerminalLines(prev => [...prev, '$ run test cases', 'Error: No code loaded for this submission.', '']);
            return;
        }
        setPreviewRunning(true);
        setPreviewTerminalLines(prev => [...prev, `$ run test cases (${assignment.language || 'python'})`, '']);
        try {
            const { results } = await runTests(
                assignment.id,
                previewCode,
                assignment.language || 'python',
                submission.id
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
            setPreviewTerminalLines(prev => [...prev, ...lines]);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Run failed';
            setPreviewTerminalLines(prev => [...prev, `Error: ${msg}`, '']);
        } finally {
            setPreviewRunning(false);
        }
    };

    const handleRunPreviewWithInput = async () => {
        if (!assignment || previewCode == null) return;
        const trimmed = previewCode.trim();
        if (!trimmed) {
            setPreviewTerminalLines(prev => [...prev, '$ run with input', 'Error: No code loaded.', '']);
            return;
        }
        const lang = (assignment.language || 'python').toLowerCase();
        if (lang !== 'python' && lang !== 'java') {
            setPreviewTerminalLines(prev => [...prev, '$ run with input', `Unsupported language: ${lang}. Use Python or Java for manual input.`, '']);
            return;
        }
        setPreviewRunning(true);
        setPreviewTerminalLines(prev => [...prev, `$ run with input (${lang})`, '']);
        try {
            const out = await runCode(previewCode, lang as 'python' | 'java', previewStdin);
            const lines: string[] = [];
            if (out.timedOut) lines.push('[TIMED OUT]');
            lines.push(`(exit code: ${out.exitCode})`);
            if (out.stdout.trim()) lines.push(out.stdout.trim());
            if (out.stderr.trim()) lines.push(out.stderr.trim());
            if (!out.stdout.trim() && !out.stderr.trim() && !out.timedOut) lines.push('(no output)');
            setPreviewTerminalLines(prev => [...prev, ...lines, '']);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Run failed';
            setPreviewTerminalLines(prev => [...prev, `Error: ${msg}`, '']);
        } finally {
            setPreviewRunning(false);
        }
    };

    const isWeightedRubric = useMemo(() => rubricCriteria.some(c => (c.weight ?? 0) > 0), [rubricCriteria]);
    const weightSum = useMemo(() => rubricCriteria.reduce((s, c) => s + ((c.weight ?? 0) > 0 ? Number(c.weight) : 0), 0), [rubricCriteria]);

    const rubricTotal = useMemo(() => {
        return rubricCriteria.reduce((sum, c) => sum + (typeof rubricScores[c.id] === 'number' ? rubricScores[c.id] as number : 0), 0);
    }, [rubricCriteria, rubricScores]);
    const rubricMax = useMemo(() => rubricCriteria.reduce((sum, c) => sum + (c.points || 0), 0), [rubricCriteria]);

    const weightedTotal = useMemo(() => {
        if (!isWeightedRubric || weightSum <= 0) return null;
        let sum = 0;
        rubricCriteria.forEach(c => {
            const w = (c.weight ?? 0) > 0 ? Number(c.weight) : 0;
            if (w <= 0) return;
            const earned = typeof rubricScores[c.id] === 'number' ? rubricScores[c.id] as number : 0;
            const max = c.points || 1;
            sum += (earned / max) * w;
        });
        return Math.round(sum * 100) / 100;
    }, [rubricCriteria, rubricScores, isWeightedRubric, weightSum]);

    /** Rubric score scaled to assignment total points (for "Use as grade") */
    const rubricGradeEquivalent = useMemo(() => {
        const maxPoints = assignment?.points ?? 100;
        if (maxPoints <= 0) return null;
        if (isWeightedRubric && weightedTotal != null) {
            return Math.round((weightedTotal / 100) * maxPoints * 100) / 100;
        }
        if (rubricMax > 0) {
            return Math.round((rubricTotal / rubricMax) * maxPoints * 100) / 100;
        }
        return null;
    }, [assignment?.points, isWeightedRubric, weightedTotal, rubricTotal, rubricMax]);

    async function handleSave() {
        if (!submissionId) return;
        const maxPoints = assignment?.points || 100;
        const enteredGrade = grade ? parseFloat(grade) : undefined;
        if (enteredGrade !== undefined && enteredGrade > maxPoints) {
            alert(`Grade cannot exceed the maximum points for this assignment (${maxPoints}).`);
            return;
        }
        try {
            let finalFeedback = feedback;
            if (rubricCriteria.length > 0) {
                const scores: Record<number, number> = {};
                rubricCriteria.forEach(c => { scores[c.id] = typeof rubricScores[c.id] === 'number' ? rubricScores[c.id] as number : 0; });
                const rubricData: Record<string, unknown> = { total: rubricTotal, max: rubricMax, scores: {} };
                rubricCriteria.forEach(c => { (rubricData.scores as Record<number, number>)[c.id] = typeof rubricScores[c.id] === 'number' ? rubricScores[c.id] as number : 0; });
                if (isWeightedRubric && weightedTotal != null) rubricData.weightedTotal = weightedTotal;
                finalFeedback = (feedback || '').trim() + (feedback ? '\n\n' : '') + '--- Rubric ---\nRUBRIC_JSON:' + JSON.stringify(rubricData);
            }
            await updateSubmission(parseInt(submissionId), {
                grade: enteredGrade !== undefined ? roundGrade(enteredGrade) : undefined,
                feedback: finalFeedback,
                status: 'graded'
            });
            navigate(`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading`);
        } catch (err) {
            console.error('Failed to save grade', err);
            setAlertConfig({ show: true, type: 'error', title: 'Error', message: 'Failed to save grade.' });
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
                    <div className="meta-group">
                        <p className="grader-meta">STUDENT ID: <span className="meta-value">{submission.student_id}</span></p>
                        <p className="grader-meta">SUBMITTED: <span className="meta-value">{new Date(submission.submitted_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span></p>
                    </div>
                </div>

                <div className="info-card">
                    <h3 className="section-title">Submission Artifacts</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {allSubmissions.map((sub, idx) => (
                            <div key={sub.id} className="submission-attempt-group">
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#4b5563', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
                                    Attempt {allSubmissions.length - idx} &bull; <span style={{ fontWeight: 'normal' }}>{new Date(sub.submitted_at).toLocaleString()}</span>
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {(sub.files || [{ name: sub.file_name, path: sub.file_path }]).map((f, i) => {
                                        const url = getFileUrl(f.path);
                                        return (
                                            <div key={i} className="file-box">
                                                <span className="file-name">{f.name}</span>
                                                <div className="file-actions">
                                                    <Button
                                                        variant="primary"
                                                        className="btn-pill"
                                                        size="sm"
                                                        onClick={() => window.open(url, '_blank')}
                                                    >
                                                        Download
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                    </div>

                {/* Inline code + test runner below artifacts */}
                <div className="info-card">
                    <div style={{ marginBottom: '0.75rem' }}>
                        <h3 className="section-title" style={{ marginBottom: 0 }}>Preview</h3>
                    </div>
                    <div className="inline-runner-layout">
                        <section className="inline-editor-section">
                            <div className="inline-section-header">
                                <span>Code preview (primary file)</span>
                                <button
                                    type="button"
                                    className="inline-fullscreen-btn"
                                    onClick={() => navigate(`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading/${submission.id}/preview?file=0`)}
                                >
                                    Open full preview
                                </button>
                            </div>
                            <div className="inline-editor-body">
                                {previewCode == null ? (
                                    <div className="preview-hint">Loading code…</div>
                                ) : (
                                    <Suspense fallback={<div className="preview-hint">Loading editor…</div>}>
                                        <MonacoCodeEditor
                                            value={previewCode}
                                            language={(assignment?.language || 'python').toLowerCase()}
                                            height={260}
                                            readOnly
                                            theme="dark"
                                            showMiniMap={false}
                                            wordWrap="on"
                                            fontSize={13}
                                        />
                                    </Suspense>
                                )}
                            </div>
                            <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                                        <Button size="sm" variant="outline" onClick={handleRunPreviewTests} disabled={previewRunning} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Play size={14} />
                                            {previewRunning ? 'Running…' : 'Run test cases'}
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={handleRunPreviewWithInput} disabled={previewRunning} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Play size={14} />
                                            Run with input
                                        </Button>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Manual input (for Run with input)</label>
                                    <textarea
                                        rows={2}
                                        className="form-textarea"
                                        value={previewStdin}
                                        onChange={e => setPreviewStdin(e.target.value)}
                                        placeholder="Optional stdin..."
                                        style={{ minHeight: '48px', resize: 'vertical', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>
                        </section>
                        <section className="inline-terminal-section">
                            <div className="inline-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <Terminal size={16} />
                                    Output
                                </span>
                                <Button size="sm" variant="ghost" onClick={() => setPreviewTerminalLines([])} disabled={previewTerminalLines.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Trash2 size={14} />
                                    Clear
                                </Button>
                            </div>
                            <div className="inline-terminal-body">
                                {previewTerminalLines.length === 0 ? (
                                    <div className="inline-terminal-line">
                                        <span className="inline-terminal-prompt">$</span>
                                        <span className="inline-terminal-placeholder"> Click "Run test cases" to execute against assignment tests.</span>
                                    </div>
                                ) : (
                                    previewTerminalLines.map((line, i) => (
                                        <div key={i} className={line.startsWith('$') ? 'inline-terminal-line' : 'inline-terminal-output'}>
                                            {line.startsWith('$') ? (
                                                <span className="inline-terminal-prompt">{line}</span>
                                            ) : (
                                                <span className="inline-terminal-text">{line || '\u00A0'}</span>
                                            )}
                                        </div>
                                    ))
                                )}
                                {previewRunning && (
                                    <div className="inline-terminal-line">
                                        <span className="inline-terminal-prompt">$</span>
                                        <span className="inline-terminal-cursor">▌</span>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            {/* Right Panel: Grading Form */}
            <div className="grader-panel-right">
                <h2 className="section-title grader-form-title">Grading</h2>

                <div className="grading-form">
                    {rubricCriteria.length > 0 && (() => {
                        const byCategory = rubricCriteria.reduce<Record<string, AssignmentRubricCriterion[]>>((acc, c) => {
                            const key = (c.category || '').trim() || '\u200b'; // \u200b = no category
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(c);
                            return acc;
                        }, {});
                        const categoryOrder: string[] = [];
                        rubricCriteria.forEach(c => {
                            const key = (c.category || '').trim() || '\u200b';
                            if (!categoryOrder.includes(key)) categoryOrder.push(key);
                        });
                        return (
                        <div className="form-group rubric-grading-section" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-surface)' }}>
                            <label className="form-label" style={{ marginBottom: '0.75rem', display: 'block' }}>
                                Rubric {getRole() === 'ta' && <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', fontSize: '0.85em' }}>(grade by criteria)</span>}
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {categoryOrder.map(catKey => (
                                    <div key={catKey}>
                                        {catKey !== '\u200b' && (
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>{catKey}</div>
                                        )}
                                        {byCategory[catKey]?.map(c => (
                                            <div key={c.id} style={{ marginBottom: '0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <span style={{ flex: '1', minWidth: '120px', fontSize: '0.9rem' }}>{c.criterion_name}</span>
                                                    {(c.weight ?? 0) > 0 && (
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: '32px' }}>{c.weight}%</span>
                                                    )}
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={c.points}
                                                        step={0.5}
                                                        className="form-input"
                                                        value={rubricScores[c.id] ?? ''}
                                                        onChange={e => {
                                                            const v = e.target.value;
                                                            setRubricScores(prev => ({ ...prev, [c.id]: v === '' ? '' : Math.min(c.points, Math.max(0, parseFloat(v) || 0)) }));
                                                        }}
                                                        placeholder="0"
                                                        style={{ width: '72px' }}
                                                    />
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>/ {c.points}</span>
                                                </div>
                                                {c.description && (
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem', marginLeft: 0 }}>{c.description}</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                {isWeightedRubric && weightedTotal != null ? (
                                    <>
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Weighted total: {weightedTotal} / 100</span>
                                        {rubricGradeEquivalent != null && (
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>→ {rubricGradeEquivalent} / {assignment?.points ?? 100}</span>
                                        )}
                                        <Button size="sm" variant="outline" onClick={() => rubricGradeEquivalent != null && setGrade(formatGrade(rubricGradeEquivalent))}>Use as final grade</Button>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Total: {rubricTotal} / {rubricMax}</span>
                                        {rubricGradeEquivalent != null && (
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>→ {rubricGradeEquivalent} / {assignment?.points ?? 100}</span>
                                        )}
                                        <Button size="sm" variant="outline" onClick={() => rubricGradeEquivalent != null && setGrade(formatGrade(rubricGradeEquivalent))}>Use as final grade</Button>
                                    </>
                                )}
                            </div>
                        </div>
                        );
                    })()}
                    <div className="grader-form-divider"></div>
                    <div className="form-group">
                        <label className="form-label">Grade (0-{assignment.points || 100})</label>
                        <input type="number" min="0" max={assignment.points || 100} step="0.01" className="form-input" value={grade} onChange={e => { const val = e.target.value; const maxPoints = assignment.points || 100; setGrade(parseFloat(val) > maxPoints ? maxPoints.toString() : val); }} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Feedback</label>
                        <textarea rows={8} className="form-textarea" value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Enter detailed feedback here..." />
                    </div>
                    <div className="form-actions">
                        <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
                        <Button onClick={handleSave}>Save & Return to Dashboard</Button>
                    </div>
                </div>
            </div>

            {/* Alert Modal */}
            {alertConfig.show && (
                <AlertModal
                    type={alertConfig.type}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    onClose={() => setAlertConfig({ ...alertConfig, show: false })}
                />
            )}
        </div>
    );
};

export default SubmissionGrader;
