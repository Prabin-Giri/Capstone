import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import {
    getAssignment,
    getSubmissions,
    getSubmissionFileUrl,
    updateAssignment,
    runAutograde,
    runSubmissionAiDetection,
    getSubmissionAiDetections,
    getAiDetectorStatus,
} from '../../lib/api';
import type { Assignment, Submission, SubmissionAiDetectionResult, AiDetectorStatusResponse } from '../../lib/api';
import { BarChart2, Search, FlaskConical, Brain, PenLine, ChevronLeft, ShieldAlert, FileText, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import PlagiarismReportModal from './PlagiarismReportModal';
import type { PlagiarismMatch } from './PlagiarismReportModal';
import AlertModal from '../../components/ui/AlertModal';
import UserAvatar from '../../components/ui/UserAvatar';

import './GradingDashboard.css';

type AiAnalysisState = 'pending' | 'analyzed' | 'reused' | 'failed' | 'skipped' | string;

type AiDetectionMeta = {
    analysis_state: AiAnalysisState;
    analyzed_at: string | null;
    reused_from_submission_id: number | null;
};

type AiDetectionRowState = {
    loading: boolean;
    running: boolean;
    latest: SubmissionAiDetectionResult | null;
    byFile: SubmissionAiDetectionResult[];
    meta: AiDetectionMeta;
    error: string | null;
};

function pickDetectableSourceFiles(submission: Submission): Array<{ filename: string; language: 'python' | 'java' }> {
    const files = submission.files || [{ name: submission.file_name, path: submission.file_path }];
    const detected: Array<{ filename: string; language: 'python' | 'java' }> = [];
    for (const file of files) {
        const name = String(file?.name || '').trim();
        if (!name) continue;
        if (/\.py$/i.test(name)) detected.push({ filename: name, language: 'python' });
        else if (/\.java$/i.test(name)) detected.push({ filename: name, language: 'java' });
    }
    return detected;
}

function pickLatestDetectionsByFile(results: SubmissionAiDetectionResult[]): SubmissionAiDetectionResult[] {
    const latest = new Map<string, SubmissionAiDetectionResult>();
    for (const item of results || []) {
        if (!latest.has(item.file_name)) {
            latest.set(item.file_name, item);
        }
    }
    return Array.from(latest.values());
}

function getSubmissionMeta(submission: Submission): AiDetectionMeta {
    return {
        analysis_state: submission.ai_analysis_state || 'pending',
        analyzed_at: submission.ai_analyzed_at || null,
        reused_from_submission_id: submission.ai_reused_from_submission_id ?? null,
    };
}

function getHistoryMeta(
    submission: Submission,
    history: { analysis_state?: string; analyzed_at?: string | null; reused_from_submission_id?: number | null }
): AiDetectionMeta {
    return {
        analysis_state: history.analysis_state || submission.ai_analysis_state || 'pending',
        analyzed_at: history.analyzed_at ?? submission.ai_analyzed_at ?? null,
        reused_from_submission_id: history.reused_from_submission_id ?? submission.ai_reused_from_submission_id ?? null,
    };
}

function getRunMeta(runResult: {
    analysis_state?: string;
    analyzed_at?: string | null;
    reused_from_submission_id?: number | null;
}): AiDetectionMeta {
    return {
        analysis_state: runResult.analysis_state || '',
        analyzed_at: runResult.analyzed_at ?? null,
        reused_from_submission_id: runResult.reused_from_submission_id ?? null,
    };
}

const GradingDashboard: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const basePath = pathname.startsWith('/ta') ? '/ta' : '/faculty';
    const isFaculty = basePath === '/faculty';
    const isTA = basePath === '/ta';
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [groupedSubmissions, setGroupedSubmissions] = useState<Record<string, Submission[]>>({});
    // Ordered list of student_ids (for stable anon numbering)
    const [studentOrder, setStudentOrder] = useState<string[]>([]);
    const [selectedStudentSubmissions, setSelectedStudentSubmissions] = useState<Submission[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [togglingHide, setTogglingHide] = useState(false);
    const [showPlagiarismModal, setShowPlagiarismModal] = useState(false);
    const [showAiDetectionModal, setShowAiDetectionModal] = useState(false);
    const [runningTestsForAll, setRunningTestsForAll] = useState(false);
    const [studentSearchInput, setStudentSearchInput] = useState('');
    const [studentSearchFilter, setStudentSearchFilter] = useState('');
    const [alertConfig, setAlertConfig] = useState<{ show: boolean, type: 'success' | 'error' | 'info', title: string, message: string }>({ show: false, type: 'info', title: '', message: '' });
    const [plagiarismMatches, setPlagiarismMatches] = useState<PlagiarismMatch[]>([]);
    const [plagiarismPopoverStudentId, setPlagiarismPopoverStudentId] = useState<string | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [runningAiForAll, setRunningAiForAll] = useState(false);
    const [hydratingAiRows, setHydratingAiRows] = useState(false);
    const [aiRows, setAiRows] = useState<Record<number, AiDetectionRowState>>({});
    const [aiDetectorStatus, setAiDetectorStatus] = useState<AiDetectorStatusResponse | null>(null);
    const [loadingAiDetectorStatus, setLoadingAiDetectorStatus] = useState(false);

    const plagiarismStorageKey = assignmentId ? `plagiarism-flags-${assignmentId}` : '';

    const flaggedStudentIds = React.useMemo(() => {
        const ids = new Set<string>();
        for (const m of plagiarismMatches) {
            if (!m.sameGroup) {
                ids.add(m.student1.id);
                ids.add(m.student2.id);
            }
        }
        return ids;
    }, [plagiarismMatches]);

    const getMatchesForStudent = useCallback((studentId: string) => {
        return plagiarismMatches.filter(
            m => !m.sameGroup && (m.student1.id === studentId || m.student2.id === studentId)
        );
    }, [plagiarismMatches]);

    const handlePlagiarismResults = useCallback((results: PlagiarismMatch[]) => {
        setPlagiarismMatches(results);
        if (plagiarismStorageKey) {
            try {
                localStorage.setItem(plagiarismStorageKey, JSON.stringify(results));
            } catch { /* quota exceeded — ignore */ }
        }
    }, [plagiarismStorageKey]);

    useEffect(() => {
        if (plagiarismStorageKey) {
            try {
                const stored = localStorage.getItem(plagiarismStorageKey);
                if (stored) setPlagiarismMatches(JSON.parse(stored));
            } catch { /* corrupted — ignore */ }
        }
    }, [plagiarismStorageKey]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setPlagiarismPopoverStudentId(null);
            }
        }
        if (plagiarismPopoverStudentId) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [plagiarismPopoverStudentId]);

    useEffect(() => {
        loadData();
        void loadAiDetectorStatus();
    }, [assignmentId]);

    async function loadAiDetectorStatus(): Promise<AiDetectorStatusResponse | null> {
        setLoadingAiDetectorStatus(true);
        try {
            const status = await getAiDetectorStatus();
            setAiDetectorStatus(status);
            return status;
        } catch (err) {
            console.error(err);
            const fallbackStatus: AiDetectorStatusResponse = {
                enabled: false,
                ready: false,
                reason: err instanceof Error ? err.message : 'Could not load AI detector status.',
                detector: 'offline_ai_detector',
                paths: {
                    root: null,
                    script: null,
                    config: null,
                    model_dir: null,
                    python_bin: null,
                },
                model_version: null,
            };
            setAiDetectorStatus(fallbackStatus);
            return fallbackStatus;
        } finally {
            setLoadingAiDetectorStatus(false);
        }
    }

    async function loadData() {
        if (!assignmentId) return;
        try {
            const [assignmentData, submissionsData] = await Promise.all([
                getAssignment(assignmentId),
                getSubmissions({ assignment_id: assignmentId })
            ]);
            setAssignment(assignmentData);

            // Group submissions by student_id
            const grouped = submissionsData.reduce((acc, curr) => {
                if (!acc[curr.student_id]) {
                    acc[curr.student_id] = [];
                }
                acc[curr.student_id].push(curr);
                return acc;
            }, {} as Record<string, Submission[]>);

            // Sort each group by submitted_at desc (newest first)
            Object.keys(grouped).forEach(studentId => {
                grouped[studentId].sort((a, b) =>
                    new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
                );
            });

            setGroupedSubmissions(grouped);
            // Preserve stable order for anonymous numbering
            setStudentOrder(prev => {
                const existing = new Set(prev);
                const newIds = Object.keys(grouped).filter(id => !existing.has(id));
                return [...prev, ...newIds];
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    // Only hide names for TAs — faculty always sees real names
    const hideNames = isTA && !!assignment?.hide_student_names;

    // Stable anonymous label based on studentOrder list
    const anonLabel = (studentId: string) => {
        const idx = studentOrder.indexOf(studentId);
        return idx >= 0 ? `Student ${idx + 1}` : 'Student';
    };

    const latestSubmissions = React.useMemo(
        () => Object.values(groupedSubmissions).map((group) => group[0]).filter(Boolean),
        [groupedSubmissions]
    );

    const applySubmissionMetaToGroups = useCallback((submissionId: number, meta: AiDetectionMeta) => {
        setGroupedSubmissions((prev) => {
            const next: Record<string, Submission[]> = {};
            for (const [studentId, group] of Object.entries(prev)) {
                next[studentId] = group.map((item) => {
                    if (item.id !== submissionId) return item;
                    return {
                        ...item,
                        ai_analysis_state: meta.analysis_state,
                        ai_analyzed_at: meta.analyzed_at,
                        ai_reused_from_submission_id: meta.reused_from_submission_id,
                    };
                });
            }
            return next;
        });
    }, []);

    const loadAiRowsForModal = useCallback(async (submissions: Submission[]) => {
        if (submissions.length === 0) return;
        setHydratingAiRows(true);
        setAiRows((prev) => {
            const next = { ...prev };
            for (const sub of submissions) {
                const fallbackMeta = getSubmissionMeta(sub);
                next[sub.id] = {
                    loading: true,
                    running: prev[sub.id]?.running || false,
                    latest: prev[sub.id]?.latest || null,
                    byFile: prev[sub.id]?.byFile || [],
                    meta: prev[sub.id]?.meta || fallbackMeta,
                    error: null,
                };
            }
            return next;
        });

        try {
            await Promise.all(submissions.map(async (sub) => {
                try {
                    const history = await getSubmissionAiDetections(sub.id, { limit: 100 });
                    const byFile = pickLatestDetectionsByFile(history.results || []);
                    const meta = getHistoryMeta(sub, history);
                    setAiRows((prev) => ({
                        ...prev,
                        [sub.id]: {
                            loading: false,
                            running: prev[sub.id]?.running || false,
                            latest: byFile[0] || null,
                            byFile,
                            meta,
                            error: null,
                        },
                    }));
                    applySubmissionMetaToGroups(sub.id, meta);
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Failed to load AI detection results.';
                    setAiRows((prev) => ({
                        ...prev,
                        [sub.id]: {
                            loading: false,
                            running: prev[sub.id]?.running || false,
                            latest: prev[sub.id]?.latest || null,
                            byFile: prev[sub.id]?.byFile || [],
                            meta: prev[sub.id]?.meta || getSubmissionMeta(sub),
                            error: message,
                        },
                    }));
                }
            }));
        } finally {
            setHydratingAiRows(false);
        }
    }, [applySubmissionMetaToGroups]);

    const runAiForSubmission = useCallback(async (
        submission: Submission,
        opts: { skipReadinessCheck?: boolean } = {}
    ): Promise<boolean> => {
        if (!opts.skipReadinessCheck) {
            const status = await loadAiDetectorStatus();
            if (!status?.ready) {
                setAiRows((prev) => ({
                    ...prev,
                    [submission.id]: {
                        loading: false,
                        running: false,
                        latest: prev[submission.id]?.latest || null,
                        byFile: prev[submission.id]?.byFile || [],
                        meta: prev[submission.id]?.meta || getSubmissionMeta(submission),
                        error: status?.reason || 'AI detector is not ready.',
                    },
                }));
                return false;
            }
        }

        const targets = pickDetectableSourceFiles(submission);
        if (targets.length === 0) {
            setAiRows((prev) => ({
                ...prev,
                [submission.id]: {
                    loading: false,
                    running: false,
                    latest: prev[submission.id]?.latest || null,
                    byFile: prev[submission.id]?.byFile || [],
                    meta: prev[submission.id]?.meta || getSubmissionMeta(submission),
                    error: 'No .py or .java file found in this submission.',
                },
            }));
            return false;
        }

        setAiRows((prev) => ({
            ...prev,
            [submission.id]: {
                loading: false,
                running: true,
                latest: prev[submission.id]?.latest || null,
                byFile: prev[submission.id]?.byFile || [],
                meta: prev[submission.id]?.meta || getSubmissionMeta(submission),
                error: null,
            },
        }));

        try {
            const runResult = await runSubmissionAiDetection(submission.id, {
                batch: true,
            });
            const history = await getSubmissionAiDetections(submission.id, { limit: 100 });
            const byFile = pickLatestDetectionsByFile(history.results || []);
            const historyMeta = getHistoryMeta(submission, history);
            const runMeta = getRunMeta(runResult);
            const mergedMeta: AiDetectionMeta = {
                analysis_state: runMeta.analysis_state || historyMeta.analysis_state,
                analyzed_at: runMeta.analyzed_at ?? historyMeta.analyzed_at,
                reused_from_submission_id: runMeta.reused_from_submission_id ?? historyMeta.reused_from_submission_id,
            };
            setAiRows((prev) => ({
                ...prev,
                [submission.id]: {
                    loading: false,
                    running: false,
                    latest: byFile[0] || null,
                    byFile,
                    meta: mergedMeta,
                    error: null,
                },
            }));
            applySubmissionMetaToGroups(submission.id, mergedMeta);
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'AI detection failed.';
            setAiRows((prev) => ({
                ...prev,
                [submission.id]: {
                    loading: false,
                    running: false,
                    latest: prev[submission.id]?.latest || null,
                    byFile: prev[submission.id]?.byFile || [],
                    meta: prev[submission.id]?.meta || getSubmissionMeta(submission),
                    error: message,
                },
            }));
            return false;
        }
    }, [applySubmissionMetaToGroups]);

    const handleRunAiForAll = useCallback(async () => {
        if (latestSubmissions.length === 0) {
            setAlertConfig({
                show: true,
                type: 'info',
                title: 'No submissions',
                message: 'There are no latest submissions to scan.',
            });
            return;
        }
        const status = await loadAiDetectorStatus();
        if (!status?.ready) {
            setAlertConfig({
                show: true,
                type: 'info',
                title: 'AI detector unavailable',
                message: status?.reason || 'AI detector is not ready right now.',
            });
            return;
        }
        setRunningAiForAll(true);
        let success = 0;
        let failed = 0;
        for (const sub of latestSubmissions) {
            // Sequential run prevents detector overload on EC2.
            const ok = await runAiForSubmission(sub, { skipReadinessCheck: true });
            if (ok) success += 1;
            else failed += 1;
        }
        setRunningAiForAll(false);
        setAlertConfig({
            show: true,
            type: failed > 0 ? 'info' : 'success',
            title: failed > 0 ? 'AI detection completed with issues' : 'AI detection completed',
            message: failed > 0
                ? `Scanned ${success} submission(s); ${failed} failed or were skipped.`
                : `Scanned all ${success} latest submission(s).`,
        });
    }, [latestSubmissions, runAiForSubmission]);

    useEffect(() => {
        if (showAiDetectionModal) {
            const modalSubmissions = [...latestSubmissions];
            void loadAiDetectorStatus();
            void loadAiRowsForModal(modalSubmissions);
        }
    }, [showAiDetectionModal]);

    useEffect(() => {
        if (!showAiDetectionModal) return;
        const previousOverflow = document.body.style.overflow;
        const previousPaddingRight = document.body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

        document.body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }

        return () => {
            document.body.style.overflow = previousOverflow;
            document.body.style.paddingRight = previousPaddingRight;
        };
    }, [showAiDetectionModal]);

    async function handleToggleHideNames() {
        if (!assignment || !assignmentId) return;
        setTogglingHide(true);
        try {
            const newVal = assignment.hide_student_names ? 0 : 1;
            await updateAssignment(assignmentId, { hide_student_names: newVal });
            setAssignment(prev => prev ? { ...prev, hide_student_names: newVal } : prev);
        } catch (err) {
            console.error(err);
        } finally {
            setTogglingHide(false);
        }
    }

    const handleRunTestsForAll = async () => {
        if (!assignmentId) return;
        const latest = Object.values(groupedSubmissions).map((g) => g[0]).filter(Boolean);
        if (latest.length === 0) {
            setAlertConfig({
                show: true,
                type: 'info',
                title: 'No submissions',
                message: 'There are no submissions to run test cases on.',
            });
            return;
        }
        setRunningTestsForAll(true);
        let ok = 0;
        let failed = 0;
        try {
            for (const sub of latest) {
                try {
                    await runAutograde(sub.id, { testResultsOnly: true });
                    ok++;
                } catch (e) {
                    console.error(e);
                    failed++;
                }
            }
            await loadData();
            setAlertConfig({
                show: true,
                type: failed > 0 ? 'info' : 'success',
                title: 'Test runs finished',
                message:
                    failed > 0
                        ? `Completed with ${ok} success(es) and ${failed} failure(s). Check logs or grade each submission for details.`
                        : `Test results saved for all ${ok} latest submission(s). Final grades stay pending until you grade each student.`,
            });
        } catch (err) {
            console.error(err);
            setAlertConfig({
                show: true,
                type: 'error',
                title: 'Error',
                message: 'Could not finish running test cases for everyone.',
            });
        } finally {
            setRunningTestsForAll(false);
        }
    };

    const applyStudentSearch = () => {
        setStudentSearchFilter(studentSearchInput.trim());
    };

    if (loading) return <div className="grading-dashboard-container">Loading...</div>;
    if (!assignment) return <div className="grading-dashboard-container">Assignment not found</div>;

    const searchNeedle = studentSearchFilter.toLowerCase();
    const allSubmissionGroups = Object.values(groupedSubmissions);
    const filteredSubmissionGroups = !searchNeedle
        ? allSubmissionGroups
        : allSubmissionGroups.filter((group) => {
            const latest = group[0];
            const haystack = [
                latest.student_name,
                latest.student_id,
                anonLabel(latest.student_id),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(searchNeedle);
        });

    const firstGradeSubmissionId = (() => {
        for (const sid of studentOrder) {
            const g = groupedSubmissions[sid];
            if (g?.[0]?.id != null) return g[0].id;
        }
        for (const sid of Object.keys(groupedSubmissions).sort()) {
            const g = groupedSubmissions[sid];
            if (g?.[0]?.id != null) return g[0].id;
        }
        return undefined;
    })();

    const goToFirstSubmissionGrader = () => {
        if (firstGradeSubmissionId == null) {
            setAlertConfig({
                show: true,
                type: 'info',
                title: 'No submissions',
                message: 'There are no submissions to open in the grader yet.',
            });
            return;
        }
        navigate(`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading/${firstGradeSubmissionId}`);
    };

    const backToCourseHref = `${basePath}/courses/${courseId}`;
    const formatAiScore = (result: SubmissionAiDetectionResult | null) => {
        if (!result) return 'n/a';
        const score = result.calibrated_score ?? result.raw_score;
        return typeof score === 'number' ? score.toFixed(3) : 'n/a';
    };
    const aiRowBadgeClass = (label?: string | null) => {
        const normalized = String(label || '').toLowerCase();
        if (normalized.includes('likely ai')) return 'ai-label-ai';
        if (normalized.includes('likely human')) return 'ai-label-human';
        return 'ai-label-unclear';
    };
    const normalizeAiAnalysisState = (value?: string | null): AiAnalysisState => {
        const normalized = String(value || 'pending').toLowerCase().trim();
        if (normalized === 'analyzed' || normalized === 'reused' || normalized === 'failed' || normalized === 'skipped') {
            return normalized;
        }
        return 'pending';
    };
    const aiAnalysisStateClass = (value?: string | null) => {
        const normalized = normalizeAiAnalysisState(value);
        if (normalized === 'analyzed') return 'ai-state-analyzed';
        if (normalized === 'reused') return 'ai-state-reused';
        if (normalized === 'failed') return 'ai-state-failed';
        if (normalized === 'skipped') return 'ai-state-skipped';
        return 'ai-state-pending';
    };
    const aiAnalysisStateLabel = (value?: string | null) => {
        const normalized = normalizeAiAnalysisState(value);
        if (normalized === 'analyzed') return 'AI: Fresh';
        if (normalized === 'reused') return 'AI: Reused';
        if (normalized === 'failed') return 'AI: Failed';
        if (normalized === 'skipped') return 'AI: Skipped';
        return 'AI: Pending';
    };
    const aiDetectorReady = Boolean(aiDetectorStatus?.ready);
    const aiDetectorBlockedReason = aiDetectorStatus && !aiDetectorStatus.ready
        ? aiDetectorStatus.reason || 'AI detector is not ready.'
        : null;

    return (
        <div className="grading-dashboard-container">
            <div className="grading-dashboard-top">
                <div className="breadcrumb">
                    <Link to={backToCourseHref}>
                        <ChevronLeft size={14} />
                        Back to course
                    </Link>
                </div>
                <div className="grading-header-row">
                    <h1 className="grading-context-title">{assignment.title}</h1>
                </div>
                <div className="action-group">
                    <button
                        type="button"
                        onClick={goToFirstSubmissionGrader}
                        disabled={firstGradeSubmissionId == null}
                        className="btn-dashboard-action btn-grade-entry"
                    >
                        <PenLine size={18} />
                        Grade
                    </button>
                    <button
                        type="button"
                        onClick={handleRunTestsForAll}
                        disabled={runningTestsForAll}
                        className="btn-dashboard-action btn-autograde"
                    >
                        <FlaskConical size={18} />
                        {runningTestsForAll ? 'Running tests…' : 'Run tests for all'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowAiDetectionModal(true)}
                        className="btn-dashboard-action btn-ai-detection"
                    >
                        <Brain size={18} />
                        AI detection
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowPlagiarismModal(true)}
                        className="btn-dashboard-action btn-plagiarism"
                    >
                        <Search size={18} />
                        Plagiarism check
                    </button>
                    <Link
                        to={`${basePath}/courses/${courseId}/gradebook`}
                        className="btn-dashboard-action btn-gradebook"
                    >
                        <BarChart2 size={18} />
                        Gradebook
                    </Link>
                </div>
            </div>

            {isFaculty && (
                <label className="hide-names-checkbox-row">
                    <input
                        type="checkbox"
                        checked={!!assignment.hide_student_names}
                        onChange={handleToggleHideNames}
                        disabled={togglingHide}
                        className="hide-names-checkbox"
                    />
                    <span>Hide names for GA</span>
                </label>
            )}

            {isTA && assignment.hide_student_names ? (
                <div className="grading-anon-banner">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    Student names are hidden by the instructor. Students are shown anonymously.
                </div>
            ) : null}

            <div className="grading-student-search" role="search">
                <div className="grading-student-search-row">
                    <input
                        id="grading-student-search-input"
                        type="search"
                        className="grading-student-search-input"
                        placeholder="Name, ID, or Student #"
                        aria-label="Search students by name or ID"
                        value={studentSearchInput}
                        onChange={(e) => setStudentSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                applyStudentSearch();
                            }
                        }}
                        autoComplete="off"
                    />
                    <button
                        type="button"
                        className="grading-student-search-btn"
                        onClick={applyStudentSearch}
                    >
                        <Search size={18} aria-hidden />
                        Search
                    </button>
                </div>
            </div>

            <div className="grading-card">
                <table className="grading-table">
                    <thead>
                        <tr>
                            <th>Student Name</th>
                            <th>Latest Submission</th>
                            <th>Submitted Assignments</th>
                            <th>Status</th>
                            <th>Grade</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.keys(groupedSubmissions).length === 0 ? (
                            <tr>
                                <td colSpan={6} className="empty-state">
                                    No submissions found for this assignment yet.
                                </td>
                            </tr>
                        ) : filteredSubmissionGroups.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="empty-state">
                                    No students match your search. Try a different name or ID.
                                </td>
                            </tr>
                        ) : (
                            filteredSubmissionGroups.map(group => {
                                const latestSubmission = group[0]; // First one is latest due to sort
                                const displayName = hideNames
                                    ? anonLabel(latestSubmission.student_id)
                                    : (latestSubmission.student_name || latestSubmission.student_id);
                                // Only show "graded" if a grade has actually been assigned
                                const effectiveStatus = (latestSubmission.grade !== null && latestSubmission.grade !== undefined)
                                    ? latestSubmission.status
                                    : 'pending';
                                const submissionMeta = getSubmissionMeta(latestSubmission);
                                return (
                                    <tr key={latestSubmission.student_id}>
                                        <td className="text-medium">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <UserAvatar
                                                    user={hideNames
                                                        ? { name: displayName }
                                                        : { name: latestSubmission.student_name, profilePicture: latestSubmission.student_profile_picture }
                                                    }
                                                    size={32}
                                                />
                                                <span>
                                                    {hideNames
                                                        ? displayName
                                                        : (latestSubmission.student_name
                                                            ? `${latestSubmission.student_name} (${latestSubmission.student_id})`
                                                            : latestSubmission.student_id)}
                                                </span>
                                                {flaggedStudentIds.has(latestSubmission.student_id) && (
                                                    <div className="plagiarism-flag-wrapper">
                                                        <button
                                                            type="button"
                                                            className="plagiarism-flag"
                                                            onClick={() => setPlagiarismPopoverStudentId(
                                                                prev => prev === latestSubmission.student_id ? null : latestSubmission.student_id
                                                            )}
                                                            title="Click to view plagiarism details"
                                                        >
                                                            <ShieldAlert size={14} />
                                                            Plagiarism
                                                        </button>
                                                        {plagiarismPopoverStudentId === latestSubmission.student_id && (
                                                            <div className="plagiarism-popover" ref={popoverRef}>
                                                                <div className="plagiarism-popover-header">
                                                                    <h4>Plagiarism Matches</h4>
                                                                    <button
                                                                        type="button"
                                                                        className="plagiarism-popover-close"
                                                                        onClick={() => setPlagiarismPopoverStudentId(null)}
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                </div>
                                                                <div className="plagiarism-popover-body">
                                                                    {getMatchesForStudent(latestSubmission.student_id).map((match, i) => {
                                                                        const other = match.student1.id === latestSubmission.student_id
                                                                            ? match.student2 : match.student1;
                                                                        return (
                                                                            <div key={i} className="plagiarism-popover-match">
                                                                                <div className="plagiarism-popover-match-info">
                                                                                    <UserAvatar user={other} size={24} />
                                                                                    <span className="plagiarism-popover-name">{other.name}</span>
                                                                                    <span className={`plagiarism-popover-score ${
                                                                                        match.similarity > 80 ? 'score-high' :
                                                                                        match.similarity > 60 ? 'score-med' : 'score-low'
                                                                                    }`}>
                                                                                        {match.similarity}%
                                                                                    </span>
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    className="plagiarism-popover-diff-btn"
                                                                                    onClick={() => {
                                                                                        const student = latestSubmission.student_id;
                                                                                        const other = match.student1.id === student ? match.student2.id : match.student1.id;
                                                                                        navigate(`${basePath}/plagscan?assignment=${assignmentId}&student=${student}&active=${other}`);
                                                                                        setPlagiarismPopoverStudentId(null);
                                                                                    }}
                                                                                >
                                                                                    <FileText size={14} />
                                                                                    Diff
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-secondary">
                                            {new Date(latestSubmission.submitted_at).toLocaleString()}
                                        </td>
                                        <td>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSelectedStudentSubmissions(group)}
                                                style={{ boxShadow: 'none', color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
                                            >
                                                View Submissions ({group.length})
                                            </Button>
                                        </td>
                                        <td>
                                            <StatusBadge status={effectiveStatus} />
                                            <div className="ai-state-inline">
                                                <span className={`ai-state-pill ${aiAnalysisStateClass(submissionMeta.analysis_state)}`}>
                                                    {aiAnalysisStateLabel(submissionMeta.analysis_state)}
                                                </span>
                                                {submissionMeta.analysis_state === 'reused' && submissionMeta.reused_from_submission_id != null && (
                                                    <div className="ai-reuse-note">
                                                        Reused from submission #{submissionMeta.reused_from_submission_id}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-medium">
                                            {latestSubmission.grade !== undefined && latestSubmission.grade !== null
                                                ? Number(latestSubmission.grade).toFixed(2)
                                                : '-'}
                                        </td>
                                        <td>
                                            <Button
                                                size="sm"
                                                onClick={() => navigate(`${latestSubmission.id}`)}
                                                className="focus:ring-0 focus:outline-none"
                                            >
                                                Grade
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Submission View Modal */}
            {selectedStudentSubmissions && (
                <div className="modal-overlay" onClick={() => setSelectedStudentSubmissions(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <UserAvatar
                                        user={hideNames
                                            ? { name: anonLabel(selectedStudentSubmissions[0].student_id) }
                                            : { name: selectedStudentSubmissions[0].student_name, profilePicture: selectedStudentSubmissions[0].student_profile_picture }
                                        }
                                        size={40}
                                    />
                                    <h3 className="modal-title" style={{ margin: 0 }}>
                                        {hideNames
                                            ? `Submissions for ${anonLabel(selectedStudentSubmissions[0].student_id)}`
                                            : (selectedStudentSubmissions[0].student_name
                                                ? `Submissions for ${selectedStudentSubmissions[0].student_name} (${selectedStudentSubmissions[0].student_id})`
                                                : `Submissions for ${selectedStudentSubmissions[0].student_id}`)}
                                    </h3>
                                </div>
                            <button
                                className="modal-close"
                                onClick={() => setSelectedStudentSubmissions(null)}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="submission-list">
                                {selectedStudentSubmissions.map((sub) => (
                                    <div key={sub.id} className="submission-item">
                                        <div className="submission-info" style={{ marginBottom: '8px' }}>
                                            <span className="submission-date">
                                                Submitted: {new Date(sub.submitted_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {(sub.files || [{ name: sub.file_name, path: sub.file_path }]).map((f, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-body)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '6px' }}>
                                                    <span className="file-name" style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{f.name || f.path?.split('/').pop() || 'file'}</span>
                                                    <a
                                                        href={getSubmissionFileUrl(sub.id, String(f.path || f.name || ''))}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-sm btn-outline"
                                                    >
                                                        Download
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Plagiarism Report Modal */}
            {showPlagiarismModal && assignment && (
                <PlagiarismReportModal
                    assignmentId={assignment.id}
                    assignmentTitle={assignment.title}
                    basePath={basePath}
                    onClose={() => setShowPlagiarismModal(false)}
                    onPlagiarismResults={handlePlagiarismResults}
                />
            )}

            {showAiDetectionModal && (
                <div className="modal-overlay ai-modal-overlay" onClick={() => setShowAiDetectionModal(false)}>
                    <div className="modal-content ai-detection-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ margin: 0 }}>
                                AI detection
                            </h3>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setShowAiDetectionModal(false)}
                                aria-label="Close"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            <p className="ai-modal-note">
                                Results are a review signal only and should be combined with rubric evidence, test behavior, and plagiarism analysis.
                            </p>
                            {loadingAiDetectorStatus && (
                                <p className="ai-inline-error">Checking AI detector readiness...</p>
                            )}
                            {aiDetectorBlockedReason && !loadingAiDetectorStatus && (
                                <p className="ai-inline-error">{aiDetectorBlockedReason}</p>
                            )}
                            <div className="ai-modal-actions">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        void loadAiDetectorStatus();
                                        void loadAiRowsForModal([...latestSubmissions]);
                                    }}
                                    disabled={hydratingAiRows || runningAiForAll}
                                >
                                    {hydratingAiRows ? 'Refreshing…' : 'Refresh'}
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => void handleRunAiForAll()}
                                    disabled={runningAiForAll || loadingAiDetectorStatus || !aiDetectorReady || latestSubmissions.length === 0}
                                >
                                    {runningAiForAll ? 'Running for all…' : 'Run for all latest submissions'}
                                </Button>
                            </div>

                            <div className="ai-modal-table-wrap">
                                <table className="ai-modal-table">
                                    <thead>
                                        <tr>
                                            <th>Student</th>
                                            <th>Files checked</th>
                                            <th>Per-file result</th>
                                            <th>Analysis state</th>
                                            <th>Last run</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {latestSubmissions.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="empty-state">
                                                    No submissions available for AI detection.
                                                </td>
                                            </tr>
                                        ) : (
                                            latestSubmissions.map((sub) => {
                                                const state = aiRows[sub.id];
                                                const sources = pickDetectableSourceFiles(sub);
                                                const latestByFile = state?.byFile || [];
                                                const latest = state?.latest || latestByFile[0] || null;
                                                const meta = state?.meta || getSubmissionMeta(sub);
                                                const displayName = hideNames
                                                    ? anonLabel(sub.student_id)
                                                    : (sub.student_name || sub.student_id);

                                                return (
                                                    <tr key={sub.id}>
                                                        <td className="text-medium">
                                                            {hideNames
                                                                ? displayName
                                                                : (sub.student_name
                                                                    ? `${sub.student_name} (${sub.student_id})`
                                                                    : sub.student_id)}
                                                        </td>
                                                        <td>
                                                            {sources.length > 0 ? (
                                                                <div className="ai-files-list">
                                                                    {sources.map((source) => (
                                                                        <div key={source.filename} className="ai-file-item">
                                                                            {source.filename}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-secondary">No .py/.java file</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {latestByFile.length > 0 ? (
                                                                <div className="ai-result-list">
                                                                    {latestByFile.map((result) => (
                                                                        <div key={`${sub.id}-${result.file_name}-${result.id}`} className="ai-result-item">
                                                                            <div className="ai-result-item-top">
                                                                                <span className="ai-result-file">{result.file_name}</span>
                                                                                <span className={`ai-label-pill ${aiRowBadgeClass(result.label)}`}>
                                                                                    {result.label}
                                                                                </span>
                                                                            </div>
                                                                            <div className="ai-result-item-meta">
                                                                                Score: {formatAiScore(result)}
                                                                                {result.created_at ? ` • ${new Date(result.created_at).toLocaleString()}` : ''}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-secondary">Not run</span>
                                                            )}
                                                            {state?.error && (
                                                                <div className="ai-inline-error">{state.error}</div>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <span className={`ai-state-pill ${aiAnalysisStateClass(meta.analysis_state)}`}>
                                                                {aiAnalysisStateLabel(meta.analysis_state)}
                                                            </span>
                                                            {meta.analysis_state === 'reused' && meta.reused_from_submission_id != null && (
                                                                <div className="ai-reuse-note">
                                                                    No new code changes. Reused submission #{meta.reused_from_submission_id}.
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {meta.analyzed_at
                                                                ? new Date(meta.analyzed_at).toLocaleString()
                                                                : (latest?.created_at ? new Date(latest.created_at).toLocaleString() : '—')}
                                                        </td>
                                                        <td>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => void runAiForSubmission(sub)}
                                                                disabled={state?.running || runningAiForAll || loadingAiDetectorStatus || !aiDetectorReady || sources.length === 0}
                                                            >
                                                                {state?.running ? 'Running…' : 'Run'}
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
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

export default GradingDashboard;
