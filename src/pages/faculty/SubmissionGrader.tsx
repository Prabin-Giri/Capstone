import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSubmission, getSubmissions, updateSubmission, getFileUrl, getAssignment, runAutograde, runCustomCode, runTests } from '../../lib/api';
import type { Submission, Assignment, RubricConfig } from '../../lib/api';
import { getRole } from '../../lib/auth';
import { Button } from '../../components/ui/Button';
import AlertModal from '../../components/ui/AlertModal';
import { AssignmentEditor, type EditorFile } from '../../components/ui/AssignmentEditor';

import './SubmissionGrader.css';
import { showDialog } from '../../components/ui/Dialog';
import { getCommentChar } from '../../lib/utils';

const SubmissionGrader: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const navigate = useNavigate();
    const basePath = getRole() === 'ta' ? '/ta' : '/faculty';
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
    const [codeContent, setCodeContent] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewFileName, setPreviewFileName] = useState<string | null>(null);
    const [, setIsAutograding] = useState(false);
    const [showAttemptSelector, setShowAttemptSelector] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{ show: boolean, type: 'success' | 'error' | 'info', title: string, message: string }>({ show: false, type: 'info', title: '', message: '' });

    const [isRunningCustom, setIsRunningCustom] = useState(false);

    const [rubric, setRubric] = useState<RubricConfig | null>(null);
    const [rubricScores, setRubricScores] = useState<Record<string, number | ''>>({});

    // Form State
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');

    useEffect(() => {
        loadData();
    }, [submissionId]);

    async function loadData() {
        if (!submissionId || !assignmentId) return;
        try {
            const subData = await getSubmission(parseInt(submissionId));
            const [assignData, historyData] = await Promise.all([
                getAssignment(assignmentId),
                getSubmissions({ assignment_id: assignmentId, student_id: subData.student_id })
            ]);
            setSubmission(subData);
            setAssignment(assignData);
            if (assignData.rubric_config) {
                try {
                    const parsed = typeof assignData.rubric_config === 'string'
                        ? JSON.parse(assignData.rubric_config)
                        : assignData.rubric_config;
                    if (parsed && (parsed.sections || parsed.criteria)) {
                        const cfg = parsed as RubricConfig;
                        setRubric(cfg);
                        const initialScores: Record<string, number | ''> = {};
                        const items = cfg.sections ? cfg.sections.flatMap(s => s.items) : (cfg.criteria ?? []);
                        items.forEach(c => { if (c.id) initialScores[c.id] = ''; });
                        setRubricScores(initialScores);
                    }
                } catch (e) {
                    console.warn('Failed to parse rubric_config; ignoring in grader', e);
                }
            }
            setAllSubmissions(historyData);

            const initialGrade = subData.grade !== undefined && subData.grade !== null
                ? Number(subData.grade).toFixed(2)
                : '';
            setGrade(initialGrade);
            setFeedback(subData.feedback || '');
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (previewFileUrl && previewFileName) {
            const isCodeFile = /\.(py|java|cpp|c|h|cs|js|ts|tsx|jsx|css|html|txt|json|md|sql)$/i.test(previewFileName);
            if (isCodeFile) {
                fetchCodeContent(previewFileUrl);
            } else {
                setCodeContent(null);
            }
        } else {
            setCodeContent(null);
        }
    }, [previewFileUrl, previewFileName]);

    async function fetchCodeContent(url: string) {
        setIsPreviewLoading(true);
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch code content');
            const text = await response.text();
            setCodeContent(text);
        } catch (err) {
            console.error(err);
            setCodeContent('Error loading file content.');
        } finally {
            setIsPreviewLoading(false);
        }
    }
    async function handleAutograde(id?: number, dryRun = false) {
        const targetId = id || (submission?.id);
        if (!targetId) return;

        setIsAutograding(true);
        if (!dryRun) setShowAttemptSelector(false);
        try {
            const updatedSub = await runAutograde(targetId, dryRun);
            const newGrade = updatedSub.grade !== undefined && updatedSub.grade !== null
                ? Number(updatedSub.grade).toFixed(2)
                : '';
            setGrade(newGrade);
            setFeedback(updatedSub.feedback || '');
            
            if (!dryRun) {
                // Update the main submission if it's the one we are looking at
                if (submission?.id === updatedSub.id) {
                    setSubmission(updatedSub);
                }
                // Update the attempt list to reflect the new grade
                setAllSubmissions(prev => prev.map(s => s.id === updatedSub.id ? updatedSub : s));
                setAlertConfig({ show: true, type: 'success', title: 'Success', message: 'Autograding completed and saved successfully.' });
            } else {
                setAlertConfig({ show: true, type: 'info', title: 'Autograde Preview', message: 'Calculated grade & feedback from test cases. Click "Save" to persist.' });
            }
        } catch (err) {
            console.error(err);
            setAlertConfig({ show: true, type: 'error', title: 'Error', message: 'Autograding failed. Please check test cases and system logs.' });
        } finally {
            setIsAutograding(false);
        }
    }

    async function handleRunCustomInput(files: EditorFile[], stdin: string) {
        if (!assignment || !submissionId) return { stdout: '', stderr: 'Assignment not found', exitCode: 1, timedOut: false };
        setIsRunningCustom(true);
        try {
            const comment = getCommentChar(assignment.language || 'python');
            const codeToRun = files.map(f => `${comment} File: ${f.name}\n${f.content}`).join('\n\n');
            const data = await runCustomCode(assignment.id, codeToRun, assignment.language || 'python', stdin);
            setIsRunningCustom(false);
            return data;
        } catch (err) {
            setIsRunningCustom(false);
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to execute code: ${msg}`);
        }
    }

    async function handleRunTests(files: EditorFile[]) {
        if (!assignment) throw new Error("No assignment loaded");
        setIsRunningCustom(true);
        try {
            const comment = getCommentChar(assignment.language || 'python');
            let codeToRun = files.map(f => `${comment} File: ${f.name}\n${f.content}`).join('\n\n');
            if (files.length === 1) {
                codeToRun = files[0].content;
            }

            const data = await runTests(assignment.id, codeToRun, assignment.language || 'python');
            setIsRunningCustom(false);
            return {
                results: data.results,
                log: `Sent ${files.length} file(s) to execution engine.\nLanguage: ${assignment.language || 'python'}\nTotal length: ${codeToRun.length} bytes.`
            };
        } catch (err) {
            setIsRunningCustom(false);
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to run tests: ${msg}`);
        }
    }

    function computeRubricTotal(): number | null {
        if (!rubric) return null;
        const maxPoints = assignment?.points || 100;
        const criteria = rubric.sections ? rubric.sections.flatMap(s => s.items) : (rubric.criteria ?? []);

        const scores = criteria.map(c => {
            const raw = c.id ? rubricScores[c.id] : undefined;
            const val = typeof raw === 'number' ? raw : raw === '' || raw === undefined ? 0 : Number(raw);
            const capped = c.maxPoints != null ? Math.min(val, c.maxPoints) : val;
            return { crit: c, val: capped };
        });

        // Weighted mode: use weight % per criterion
        if (rubric.weighted) {
            let totalWeight = 0;
            let weightedSum = 0;
            scores.forEach(({ crit, val }) => {
                const w = crit.weight ?? 0;
                if (!isNaN(w) && w > 0) {
                    totalWeight += w;
                    const pctOfMax = crit.maxPoints && crit.maxPoints > 0 ? (val / crit.maxPoints) : 0;
                    weightedSum += pctOfMax * w;
                }
            });
            if (totalWeight > 0) {
                const ratio = weightedSum / totalWeight; // 0–1
                return Math.round(ratio * maxPoints * 100) / 100;
            }
        } else {
            // Unweighted: sum of points normalized by total maxPoints
            const totalEarned = scores.reduce((sum, s) => sum + (isNaN(s.val) ? 0 : s.val), 0);
            const totalPossible = scores.reduce((sum, s) => sum + (s.crit.maxPoints ?? 0), 0);
            if (totalPossible > 0) {
                const ratio = totalEarned / totalPossible;
                return Math.round(ratio * maxPoints * 100) / 100;
            }
        }
        return null;
    }

    async function handleSave() {
        if (!submissionId) return;
        const maxPoints = assignment?.points || 100;
        let enteredGrade = grade ? parseFloat(grade) : undefined;

        // If no manual grade but rubric is filled, derive grade from rubric
        if ((enteredGrade === undefined || isNaN(enteredGrade)) && rubric) {
            const rubricTotal = computeRubricTotal();
            if (rubricTotal !== null) {
                enteredGrade = rubricTotal;
                setGrade(rubricTotal.toFixed(2));
            }
        }

        if (enteredGrade !== undefined && enteredGrade > maxPoints) {
            await showDialog({ title: 'Invalid Grade', message: `Grade cannot exceed the maximum points for this assignment (${maxPoints}).`, confirmText: 'OK' });
            return;
        }

        try {
            await updateSubmission(parseInt(submissionId), {
                grade: enteredGrade,
                feedback,
                status: 'graded' // Auto-update status to graded on save
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '16px' }}>
                        {allSubmissions.map((sub, idx) => (
                            <div key={sub.id} className="submission-attempt-group">
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#4b5563', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
                                    Attempt {allSubmissions.length - idx} &bull; <span style={{ fontWeight: 'normal' }}>{new Date(sub.submitted_at).toLocaleString()}</span>
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {(sub.files || [{ name: sub.file_name, path: sub.file_path }]).map((f, i) => {
                                        const url = getFileUrl(f.path);
                                        const isPreviewing = previewFileUrl === url;
                                        return (
                                            <div key={i} className="file-box">
                                                <span className="file-name">{f.name}</span>
                                                <div className="file-actions">
                                                    <Button
                                                        variant="outline"
                                                        className="btn-pill"
                                                        size="sm"
                                                        onClick={() => {
                                                            if (isPreviewing) {
                                                                setPreviewFileUrl(null);
                                                                setPreviewFileName(null);
                                                            } else {
                                                                setPreviewFileUrl(url);
                                                                setPreviewFileName(f.name);
                                                            }
                                                        }}
                                                    >
                                                        {isPreviewing ? 'Hide Preview' : 'Preview'}
                                                    </Button>
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

                    {isPreviewLoading ? (
                        <div className="preview-placeholder">
                            <div className="loading-spinner"></div>
                            Loading preview...
                        </div>
                    ) : codeContent !== null && previewFileName ? (
                        <div className="code-preview-container" style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
                            <AssignmentEditor
                                initialFiles={[{ id: 'preview', name: previewFileName, content: codeContent, language: assignment.language || 'python' }]}
                                language={assignment.language || 'python'}
                                theme="light"
                                isRunning={isRunningCustom}
                                points={0}
                                onRunTests={handleRunTests}
                                onRunCustomInput={handleRunCustomInput}
                                readOnly={true}
                            />
                        </div>
                    ) : previewFileUrl ? (
                        <iframe
                            src={previewFileUrl}
                            className="preview-frame"
                            title="File Preview"
                        />
                    ) : (
                        <div className="preview-placeholder">
                            Select a file to preview.
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Rubric + Grading Form */}
            <div className="grader-panel-right">
                <h2 className="section-title grader-form-title">Grading</h2>

                {rubric && (
                    <div className="rubric-card">
                        <div className="rubric-header">
                            <h3 className="rubric-title">{rubric.title || 'Rubric'}</h3>
                            <p className="rubric-subtitle">
                                {rubric.weighted ? 'Weighted rubric (weights in %)' : 'Unweighted rubric'}
                            </p>
                        </div>
                        {(rubric.sections ?? []).length > 0 ? (
                            rubric.sections!.map(section => (
                                <div key={section.id} style={{ marginBottom: '1rem' }}>
                                    {section.title && (
                                        <div style={{ background: '#e5e7eb', padding: '0.4rem 0.6rem', fontWeight: 600, marginBottom: 0, color: '#000' }}>
                                            {section.title}
                                        </div>
                                    )}
                                    <div className="rubric-table-wrapper">
                                        <table className="rubric-table">
                                            <thead>
                                                <tr>
                                                    <th>Criterion</th>
                                                    {rubric.weighted && <th style={{ width: '80px' }}>Weight %</th>}
                                                    <th style={{ width: '100px' }}>Max Pts</th>
                                                    <th style={{ width: '110px' }}>Score</th>
                                                    <th>Comments / Expectations</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {section.items.map(crit => (
                                                    <tr key={crit.id}>
                                                        <td>{crit.name}</td>
                                                        {rubric.weighted && <td>{crit.weight ?? '-'}</td>}
                                                        <td>{crit.maxPoints ?? '-'}</td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className="form-input"
                                                                style={{ padding: '4px 6px' }}
                                                                min={0}
                                                                max={crit.maxPoints ?? undefined}
                                                                value={crit.id ? (rubricScores[crit.id] ?? '') : ''}
                                                                onChange={e => {
                                                                    if (!crit.id) return;
                                                                    const raw = e.target.value;
                                                                    if (raw === '') {
                                                                        setRubricScores(prev => ({ ...prev, [crit.id!]: '' }));
                                                                        return;
                                                                    }
                                                                    const num = Number(raw);
                                                                    const capped = crit.maxPoints != null ? Math.min(num, crit.maxPoints) : num;
                                                                    setRubricScores(prev => ({ ...prev, [crit.id!]: capped }));
                                                                }}
                                                            />
                                                        </td>
                                                        <td>{crit.comment || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="rubric-table-wrapper">
                                <table className="rubric-table">
                                    <thead>
                                        <tr>
                                            <th>Criterion</th>
                                            {rubric.weighted && <th style={{ width: '80px' }}>Weight %</th>}
                                            <th style={{ width: '100px' }}>Max Pts</th>
                                            <th style={{ width: '110px' }}>Score</th>
                                            <th>Comments / Expectations</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(rubric.criteria ?? []).map((crit, idx) => (
                                            <tr key={crit.id || idx}>
                                                <td>{crit.name}</td>
                                                {rubric.weighted && <td>{crit.weight ?? '-'}</td>}
                                                <td>{crit.maxPoints ?? '-'}</td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        style={{ padding: '4px 6px' }}
                                                        min={0}
                                                        max={crit.maxPoints ?? undefined}
                                                        value={crit.id ? (rubricScores[crit.id] ?? '') : ''}
                                                        onChange={e => {
                                                            if (!crit.id) return;
                                                            const raw = e.target.value;
                                                            if (raw === '') {
                                                                setRubricScores(prev => ({ ...prev, [crit.id!]: '' }));
                                                                return;
                                                            }
                                                            const num = Number(raw);
                                                            const capped = crit.maxPoints != null ? Math.min(num, crit.maxPoints) : num;
                                                            setRubricScores(prev => ({ ...prev, [crit.id!]: capped }));
                                                        }}
                                                    />
                                                </td>
                                                <td>{crit.comment || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="rubric-summary">
                            {(() => {
                                const total = computeRubricTotal();
                                const maxPts = assignment.points || 100;
                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span>
                                            Rubric total (scaled):{' '}
                                            <strong>
                                                {total !== null ? `${total.toFixed(2)}/${maxPts.toFixed(2)}` : `- / ${maxPts.toFixed(2)}`}
                                            </strong>
                                        </span>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                const nextTotal = computeRubricTotal();
                                                if (nextTotal !== null) {
                                                    setGrade(nextTotal.toString());
                                                }
                                            }}
                                        >
                                            Use as final grade
                                        </Button>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                <div className="grading-form">
                    <div style={{ marginBottom: '20px' }}>
                        <Button 
                            variant="primary" 
                            size="lg" 
                            style={{ width: '100%', marginBottom: '10px' }}
                            onClick={() => handleAutograde(undefined, true)}
                        >
                            Autograde
                        </Button>
                        <p style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
                            Automatically calculate grade based on test cases.
                        </p>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Final Grade</label>
                        <input
                            type="number"
                            min="0"
                            max={assignment.points || 100}
                            className="form-input"
                            value={grade}
                            onChange={(e) => {
                                const val = e.target.value;
                                const maxPoints = assignment.points || 100;
                                if (parseFloat(val) > maxPoints) {
                                    setGrade(maxPoints.toString());
                                } else {
                                    setGrade(val);
                                }
                            }}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Feedback</label>
                        <textarea
                            rows={8}
                            className="form-textarea"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Enter detailed feedback here..."
                        />
                    </div>

                    <div className="form-actions">
                        <Button variant="ghost" onClick={() => navigate(-1)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>
                            Save & Return to Dashboard
                        </Button>
                    </div>
                </div>
            </div>
            {/* Attempt Selection Modal */}
            {showAttemptSelector && (
                <div className="modal-overlay" onClick={() => setShowAttemptSelector(false)}>
                    <div className="modal-content attempt-selector-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Select Attempt to Autograde</h3>
                            <button className="modal-close" onClick={() => setShowAttemptSelector(false)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '16px', color: '#6b7280' }}>
                                This student has multiple submissions. Which one would you like to run the autograder on?
                            </p>
                            <div className="attempt-list">
                                {allSubmissions.map((sub, idx) => (
                                    <div key={sub.id} className="attempt-selection-item" onClick={() => handleAutograde(sub.id)}>
                                        <div className="attempt-info">
                                            <span className="attempt-number">Attempt {allSubmissions.length - idx}</span>
                                            <span className="attempt-date">{new Date(sub.submitted_at).toLocaleString()}</span>
                                        </div>
                                        <div className="attempt-action">
                                            <Button size="sm" variant="outline">Select & Run</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
