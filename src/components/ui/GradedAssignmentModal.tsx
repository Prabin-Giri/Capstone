import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import type { Submission, Assignment, RubricConfig } from '../../lib/api';
import './GradedAssignmentModal.css';

interface GradedAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    submission: Submission | null;
    assignment: Assignment | null;
}

function parseAssignmentRubric(raw: string | RubricConfig | undefined | null): RubricConfig | null {
    let parsed: unknown;
    if (raw == null) return null;
    if (typeof raw === 'string') {
        if (!raw.trim()) return null;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return null;
        }
    } else {
        parsed = raw;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const p = parsed as RubricConfig;
    if (p.sections && Array.isArray(p.sections)) {
        return { title: p.title ?? '', weighted: !!p.weighted, sections: p.sections };
    }
    if (p.criteria && Array.isArray(p.criteria)) {
        return {
            title: p.title || '',
            weighted: !!p.weighted,
            sections: [{ id: 'sec-1', title: '', items: p.criteria }],
        };
    }
    return null;
}

export const GradedAssignmentModal: React.FC<GradedAssignmentModalProps> = ({
    isOpen,
    onClose,
    submission,
    assignment,
}) => {
    if (!isOpen || !submission || !assignment) {
        return null;
    }

    const rubric = useMemo(() => parseAssignmentRubric(assignment?.rubric_config ?? null), [assignment?.rubric_config]);
    const rubricScores = useMemo(() => {
        if (!submission?.rubric_scores) return null;
        try {
            if (typeof submission.rubric_scores === 'string') {
                return JSON.parse(submission.rubric_scores);
            }
            return submission.rubric_scores;
        } catch {
            return null;
        }
    }, [submission?.rubric_scores]);

    const assignmentPoints = assignment.points ?? 100;

    return (
        <div className="graded-modal-overlay" onClick={onClose}>
            <div className="graded-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="graded-modal-header">
                    <h2>{assignment.title}</h2>
                    <button className="graded-modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="graded-modal-body">
                    {/* Grade Section */}
                    <div className="modal-section">
                        <h3 className="modal-section-title">Your Grade</h3>
                        <div className="grade-display">
                            {submission.grade !== null && submission.grade !== undefined ? (
                                <>
                                    <span className="grade-score">{Number(submission.grade).toFixed(2)}</span>
                                    <span className="grade-max">/ {assignmentPoints}</span>
                                </>
                            ) : (
                                <span className="grade-not-graded">Not graded yet</span>
                            )}
                        </div>
                    </div>

                    {/* Feedback Section */}
                    {submission.feedback && submission.feedback.trim() && (
                        <div className="modal-section">
                            <h3 className="modal-section-title">Instructor Feedback</h3>
                            <div className="feedback-text">{submission.feedback}</div>
                        </div>
                    )}

                    {/* Rubric Section */}
                    {rubric && rubric.sections && rubric.sections.length > 0 && (
                        <div className="modal-section">
                            <h3 className="modal-section-title">Grading Rubric</h3>
                            {rubric.sections.map((section) => {
                                const sectionTotal = section.items.reduce((sum, item) => {
                                    const max = item.maxPoints ?? 0;
                                    return sum + (max || 0);
                                }, 0);
                                const sectionEarned = section.items.reduce((sum, item) => {
                                    const score = item.id && rubricScores ? (rubricScores[item.id] ?? 0) : 0;
                                    return sum + (Number(score) || 0);
                                }, 0);

                                return (
                                    <div key={section.id} className="modal-rubric-section">
                                        {section.title?.trim() && (
                                            <div className="modal-section-header">
                                                <span className="section-title">{section.title}</span>
                                                {rubricScores && (
                                                    <span className="section-score">
                                                        {sectionEarned.toFixed(0)} / {sectionTotal}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        <table className="modal-rubric-table">
                                            <thead>
                                                <tr>
                                                    <th className="col-criterion">Criterion</th>
                                                    <th className="col-max-points">Rubric Points</th>
                                                    {rubricScores && (
                                                        <th className="col-earned-points">Points Earned</th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {section.items.map((c) => {
                                                    const score = c.id && rubricScores ? rubricScores[c.id] : null;
                                                    const isScored = score !== null && score !== undefined && score !== '';
                                                    return (
                                                        <tr key={c.id} className={isScored ? 'scored' : ''}>
                                                            <td className="criterion-name">{c.name || '—'}</td>
                                                            <td className="criterion-max">{c.maxPoints ?? '—'}</td>
                                                            {rubricScores && (
                                                                <td className="criterion-score">
                                                                    {isScored ? `${score}` : '—'}
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Autograder Feedback */}
                    {submission.auto_feedback && submission.auto_feedback.trim() && (
                        <div className="modal-section">
                            <h3 className="modal-section-title">Autograder Report</h3>
                            <pre className="auto-feedback-block">{submission.auto_feedback}</pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GradedAssignmentModal;
