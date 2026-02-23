import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSubmission, updateSubmission, getFileUrl, getAssignment, runAutoGrader, getTestCases, getSubmissions } from '../../lib/api';
import type { Submission, Assignment } from '../../lib/api';
import { Button } from '../../components/ui/Button';

import './SubmissionGrader.css';

const SubmissionGrader: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const navigate = useNavigate();
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [isGrading, setIsGrading] = useState(false);
    const [gradeError, setGradeError] = useState<string | null>(null);

    const [correctnessPossible, setCorrectnessPossible] = useState(0);
    const [stylePoints, setStylePoints] = useState<string>('');
    const [efficiencyPoints, setEfficiencyPoints] = useState<string>('');
    const [deductionPoints, setDeductionPoints] = useState<string>('0');
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');
    const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [submissionId]);

    async function loadData() {
        if (!submissionId || !assignmentId) return;
        try {
            const subData = await getSubmission(parseInt(submissionId));
            const [assignData, testCases, submissionsData] = await Promise.all([
                getAssignment(assignmentId),
                getTestCases(assignmentId).catch(() => []),
                getSubmissions({ assignment_id: assignmentId, student_id: subData.student_id })
            ]);
            setSubmission(subData);
            setAssignment(assignData);
            setAllSubmissions(submissionsData);
            const cp = testCases.reduce((s, tc) => s + (tc.points || 0), 0);
            setCorrectnessPossible(cp);

            setStylePoints(subData.style_points != null ? String(subData.style_points) : '');
            setEfficiencyPoints(subData.efficiency_points != null ? String(subData.efficiency_points) : '');
            setDeductionPoints(subData.deduction_points != null ? String(subData.deduction_points) : '0');
            setGrade(subData.grade != null ? String(subData.grade) : '');
            setFeedback(subData.feedback || '');
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleRunAutoGrader() {
        if (!submissionId) return;
        setIsGrading(true);
        setGradeError(null);
        try {
            await runAutoGrader(parseInt(submissionId));
            await loadData();
        } catch (err) {
            setGradeError(err instanceof Error ? err.message : 'Auto-grader failed');
        } finally {
            setIsGrading(false);
        }
    }

    async function handleSave() {
        if (!submissionId) return;
        try {
            await updateSubmission(parseInt(submissionId), {
                style_points: stylePoints === '' ? null : parseFloat(stylePoints),
                efficiency_points: efficiencyPoints === '' ? null : parseFloat(efficiencyPoints),
                deduction_points: parseFloat(deductionPoints) || 0,
                feedback,
                status: 'graded',
            });
            navigate(`/faculty/courses/${courseId}/assignments/${assignmentId}/grading`);
        } catch (err) {
            console.error('Failed to save grade', err);
            alert('Failed to save grade');
        }
    }

    const stylePossible = assignment?.style_points_possible ?? 0;
    const efficiencyPossible = assignment?.efficiency_points_possible ?? 0;
    const totalPossible = correctnessPossible + stylePossible + efficiencyPossible;
    const correctnessScore = submission?.correctness_score ?? 0;
    const styleNum = stylePoints === '' ? 0 : parseFloat(stylePoints) || 0;
    const efficiencyNum = efficiencyPoints === '' ? 0 : parseFloat(efficiencyPoints) || 0;
    const deductionNum = parseFloat(deductionPoints) || 0;
    const totalEarned = correctnessScore + styleNum + efficiencyNum - deductionNum;
    const totalGradePct = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 10000) / 100 : null;

    if (loading) return <div className="grader-container"><div style={{ padding: '32px' }}>Loading...</div></div>;
    if (!submission || !assignment) return <div className="grader-container"><div style={{ padding: '32px' }}>Submission not found</div></div>;

    return (
        <div className="grader-container">
            {/* Left Panel: Submission Info & File */}
            <div className="grader-panel-left">
                <div className="grader-header">
                    <h2 className="grader-title">{assignment.title}</h2>
                    <div className="meta-group" style={{ display: 'flex', gap: '2rem' }}>
                        <p className="grader-meta">STUDENT ID: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{submission.student_id}</span></p>
                        <p className="grader-meta">SUBMITTED: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{new Date(submission.submitted_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span></p>
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
                                    {((sub as any).files || [{ name: sub.file_name, path: sub.file_path }]).map((f: any, i: number) => {
                                        const url = getFileUrl(f.path);
                                        const isPreviewing = previewFileUrl === url;
                                        return (
                                            <div key={i} className="file-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="file-name">{f.name}</span>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                    <Button
                                                        variant={isPreviewing ? 'primary' : 'outline'}
                                                        size="sm"
                                                        onClick={() => setPreviewFileUrl(isPreviewing ? null : url)}
                                                    >
                                                        {isPreviewing ? 'Hide Preview' : 'Preview'}
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
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

                    {previewFileUrl ? (
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
                    {submission.file_path_2 && submission.file_name_2 && (
                        <div className="file-box" style={{ marginTop: '12px' }}>
                            <span className="file-name">Test cases: {submission.file_name_2}</span>
                            <Button variant="secondary" size="sm" onClick={() => window.open(getFileUrl(submission.file_path_2!), '_blank')}>
                                Download
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Grading Form */}
            <div className="grader-panel-right">
                <h2 className="section-title" style={{ fontSize: '1.5rem', marginBottom: '24px' }}>Grading</h2>

                <div className="grading-form">
                    <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <Button
                            variant="secondary"
                            onClick={handleRunAutoGrader}
                            disabled={isGrading}
                        >
                            {isGrading ? 'Running auto-grader…' : 'Run auto-grader'}
                        </Button>
                        {gradeError && (
                            <p style={{ color: 'var(--error, #dc2626)', fontSize: '14px', margin: 0 }}>{gradeError}</p>
                        )}
                    </div>

                    <table className="grader-rubric-table" style={{ width: '100%', marginBottom: '20px', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border, #e5e7eb)' }}>
                                <th style={{ textAlign: 'left', padding: '8px' }}>Grading Criteria</th>
                                <th style={{ padding: '8px' }}>Points</th>
                                <th style={{ padding: '8px' }}>Possible</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                                <td style={{ padding: '8px' }}>Correctness</td>
                                <td style={{ padding: '8px' }}>{submission?.correctness_score ?? '—'}</td>
                                <td style={{ padding: '8px' }}>{correctnessPossible}</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                                <td style={{ padding: '8px' }}>Style</td>
                                <td style={{ padding: '8px' }}>
                                    <input
                                        type="number"
                                        min={0}
                                        max={stylePossible}
                                        step={0.5}
                                        className="form-input"
                                        style={{ width: '70px' }}
                                        value={stylePoints}
                                        onChange={(e) => setStylePoints(e.target.value)}
                                    />
                                </td>
                                <td style={{ padding: '8px' }}>{stylePossible}</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                                <td style={{ padding: '8px' }}>Efficiency</td>
                                <td style={{ padding: '8px' }}>
                                    <input
                                        type="number"
                                        min={0}
                                        max={efficiencyPossible}
                                        step={0.5}
                                        className="form-input"
                                        style={{ width: '70px' }}
                                        value={efficiencyPoints}
                                        onChange={(e) => setEfficiencyPoints(e.target.value)}
                                    />
                                </td>
                                <td style={{ padding: '8px' }}>{efficiencyPossible}</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                                <td style={{ padding: '8px' }}>Deductions</td>
                                <td style={{ padding: '8px' }}>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        className="form-input"
                                        style={{ width: '70px' }}
                                        value={deductionPoints}
                                        onChange={(e) => setDeductionPoints(e.target.value)}
                                    />
                                </td>
                                <td style={{ padding: '8px' }}>—</td>
                            </tr>
                            <tr style={{ fontWeight: 700, background: 'var(--bg-secondary, #f3f4f6)' }}>
                                <td style={{ padding: '8px' }}>Total</td>
                                <td style={{ padding: '8px' }}>{totalEarned.toFixed(1)}</td>
                                <td style={{ padding: '8px' }}>{totalPossible}</td>
                            </tr>
                        </tbody>
                    </table>
                    {totalGradePct != null && (
                        <p style={{ marginBottom: '16px', fontSize: '14px' }}>
                            <strong>Grade: {totalGradePct}%</strong> {grade != null && grade !== '' && `(saved: ${grade})`}
                        </p>
                    )}

                    <div className="form-group">
                        <label className="form-label">Feedback</label>
                        <textarea
                            rows={6}
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
        </div>
    );
};

export default SubmissionGrader;
