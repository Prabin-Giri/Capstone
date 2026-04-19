import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    getSubmission,
    getSubmissions,
    updateSubmission,
    getSubmissionFileUrl,
    getAssignment,
    runAutograde,
    runCustomCode,
    runTests,
    getAssignmentGroups,
    gradeAssignmentGroup,
} from '../../lib/api';
import type {
    Submission,
    Assignment,
    RubricConfig,
    TestResult,
    AssignmentGroup,
} from '../../lib/api';
import { Button } from '../../components/ui/Button';
import AlertModal from '../../components/ui/AlertModal';
import { AssignmentEditor, type EditorFile } from '../../components/ui/AssignmentEditor';
import UserAvatar from '../../components/ui/UserAvatar';
import { CheckCircle, Clock, Search, Users, ClipboardList, X, PanelLeftClose, PanelRightClose, ChevronLeft, CalendarDays, Layers, ShieldAlert, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

import './SubmissionGrader.css';
import { getLanguageFromFilename, buildAssignmentExecutionPayload } from '../../lib/utils';

const SubmissionGrader: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const basePath = pathname.startsWith('/ta') ? '/ta' : '/faculty';

    const [submission, setSubmission] = useState<Submission | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [allStudentSubmissions, setAllStudentSubmissions] = useState<Submission[]>([]);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
    const [workspaceFiles, setWorkspaceFiles] = useState<EditorFile[]>([]);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [, setIsAutograding] = useState(false);
    const [showAttemptSelector, setShowAttemptSelector] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{ show: boolean, type: 'success' | 'error' | 'info', title: string, message: string }>({ show: false, type: 'info', title: '', message: '' });
    const [isRunningCustom, setIsRunningCustom] = useState(false);
    const [rubric, setRubric] = useState<RubricConfig | null>(null);
    const [rubricScores, setRubricScores] = useState<Record<string, number | ''>>({});
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');
    const [studentSearch, setStudentSearch] = useState('');
    const [activeAttemptIndex, setActiveAttemptIndex] = useState(0);
    const [testSummary, setTestSummary] = useState<{ passed: number | null; total: number | null }>({ passed: null, total: null });

    // ─── Draft grade buffer (REFS — immune to stale closures) ─────────────────
    // Using refs instead of state so that saveDraftForCurrent() writes are
    // immediately visible to loadData() even within the same React batch.
    // A counter state triggers sidebar re-renders when drafts change.
    type DraftEntry = { grade: string; feedback: string; rubricScores: Record<string, number | ''> };
    const pendingGradesRef = useRef<Record<string, DraftEntry>>({});
    const draftIdsRef = useRef<Set<string>>(new Set());
    const [draftVersion, setDraftVersion] = useState(0); // bump to re-render sidebar
    void draftVersion; // read to suppress lint — value only triggers re-renders

    // Tracks what the form looked like when loaded from DB (or draft restore).
    // saveDraftForCurrent compares against this to avoid marking unchanged students.
    const cleanStateRef = useRef<DraftEntry>({ grade: '', feedback: '', rubricScores: {} });

    // Group Grading State
    const [assignmentGroups, setAssignmentGroups] = useState<AssignmentGroup[]>([]);
    const [gradeByGroup, setGradeByGroup] = useState(() => localStorage.getItem('grader_group_mode') === 'true');

    // Anonymous grading — TA context detected from URL (same as basePath logic)
    const _isTA = basePath === '/ta';
    const [hideNames, setHideNames] = useState(false);

    // Mobile drawers
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
    const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

    // Sidebar states initialized from localStorage for persistence across student switches
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('grader_left_collapsed');
        return saved === null ? false : saved === 'true';
    });
    const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(() => {
        return localStorage.getItem('grader_right_collapsed') === 'true';
    });

    // Sidebar widths — initialized from localStorage (px). Left must fit name + badge; never cap at ~130px.
    const LEFT_MIN = 220;
    const LEFT_MAX = 420;
    const LEFT_DEFAULT = 280;
    const RIGHT_MIN = 380;
    const [leftWidth, setLeftWidth] = useState(() => {
        const saved = localStorage.getItem('grader_left_width');
        if (!saved) return LEFT_DEFAULT;
        const n = parseInt(saved, 10);
        if (Number.isNaN(n)) return LEFT_DEFAULT;
        // Legacy bug: max drag was 130px or init used value/4 — treat tiny values as corrupt
        if (n < LEFT_MIN) return LEFT_DEFAULT;
        return Math.min(n, LEFT_MAX);
    });
    const [rightWidth, setRightWidth] = useState(() => {
        const saved = localStorage.getItem('grader_right_width');
        return saved ? parseInt(saved) : RIGHT_MIN;
    });

    const [isResizingLeft, setIsResizingLeft] = useState(false);
    const [isResizingRight, setIsResizingRight] = useState(false);
    const [isNarrowLayout, setIsNarrowLayout] = useState(() =>
        typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)').matches : false
    );
    const containerRef = useRef<HTMLDivElement>(null);
    const loadedAttemptIdRef = useRef<number | null>(null);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 900px)');
        const sync = () => setIsNarrowLayout(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    // Persistence helpers
    const toggleLeftSidebar = (val: boolean) => {
        setIsLeftSidebarCollapsed(val);
        localStorage.setItem('grader_left_collapsed', String(val));
    };

    const toggleRightSidebar = (val: boolean) => {
        setIsRightSidebarCollapsed(val);
        localStorage.setItem('grader_right_collapsed', String(val));
    };

    const parseTestSummary = (text?: string | null) => {
        if (!text) return { passed: null, total: null };
        const ratio = text.match(/(\d+)\s*\/\s*(\d+)/);
        if (ratio) return { passed: Number(ratio[1]), total: Number(ratio[2]) };
        const passLines = (text.match(/(^|\n).*(pass|passed|✅).*/gi) || []).length;
        const failLines = (text.match(/(^|\n).*(fail|failed|❌).*/gi) || []).length;
        if (passLines + failLines > 0) return { passed: passLines, total: passLines + failLines };

        // Fallback: infer total from explicit test case entries like "Test Case 1"
        const testCaseMentions = text.match(/test\s*case\s*#?\s*\d+/gi) || [];
        const uniqueCases = new Set(
            testCaseMentions
                .map(m => {
                    const n = m.match(/\d+/);
                    return n ? n[0] : '';
                })
                .filter(Boolean)
        );
        if (uniqueCases.size > 0) return { passed: 0, total: uniqueCases.size };

        return { passed: null, total: null };
    };

    useEffect(() => {
        loadData();
    }, [submissionId]);

    // Fetch all students for the assignment (once per assignmentId)
    useEffect(() => {
        if (!assignmentId) return;
        getSubmissions({ assignment_id: assignmentId }).then(data => {
            // Keep only the latest submission per student
            const latestByStudent: Record<string, Submission> = {};
            data.forEach(s => {
                if (!latestByStudent[s.student_id] || new Date(s.submitted_at) > new Date(latestByStudent[s.student_id].submitted_at)) {
                    latestByStudent[s.student_id] = s;
                }
            });
            setAllStudentSubmissions(Object.values(latestByStudent));
        }).catch(console.error);
    }, [assignmentId]);

    // (AI analysis removed from grading page)

    // Left sidebar resize — min/max in px so student names and grade badges stay visible
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizingLeft || !containerRef.current) return;
            const left = containerRef.current.getBoundingClientRect().left;
            setLeftWidth(Math.max(LEFT_MIN, Math.min(e.clientX - left, LEFT_MAX)));
        };
        const onUp = () => {
            setIsResizingLeft(false);
            localStorage.setItem('grader_left_width', String(leftWidth));
        };
        if (isResizingLeft) { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, [isResizingLeft, leftWidth]);

    // Right sidebar resize (expand only — min = RIGHT_MIN)
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizingRight || !containerRef.current) return;
            const right = containerRef.current.getBoundingClientRect().right;
            setRightWidth(Math.max(RIGHT_MIN, Math.min(right - e.clientX, 740)));
        };
        const onUp = () => {
            setIsResizingRight(false);
            localStorage.setItem('grader_right_width', String(rightWidth));
        };
        if (isResizingRight) { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, [isResizingRight, rightWidth]);

    // Current attempt for this student (must not be a late `const` after hooks — TDZ if hooks/deps read it during render)
    const activeAttempt = useMemo((): Submission | null => {
        if (!submission) return null;
        return allSubmissions[activeAttemptIndex] || submission;
    }, [submission, allSubmissions, activeAttemptIndex]);

    // Sync workspace with current active attempt
    useEffect(() => {
        if (loading || !submission || allSubmissions.length === 0) return;

        const attemptForWorkspace = allSubmissions[activeAttemptIndex] || submission;

        // Conditions for loading:
        // 1. Workspace is already open (user is navigating attempts while viewing code)
        // 2. Initial load (auto-open on first arrival)
        const shouldLoad = isWorkspaceOpen || !loadedAttemptIdRef.current;
        const isNewAttempt = loadedAttemptIdRef.current !== attemptForWorkspace.id;

        if (shouldLoad && isNewAttempt) {
            const files = attemptForWorkspace.files || [{ name: attemptForWorkspace.file_name, path: attemptForWorkspace.file_path }];
            const primary = files[0];
            if (primary && primary.path) {
                void loadAttemptWorkspace(files, attemptForWorkspace.id, primary.path);
                loadedAttemptIdRef.current = attemptForWorkspace.id;
            }
        }
    }, [loading, submission?.id, activeAttemptIndex, allSubmissions.length, isWorkspaceOpen]);

    // ─── Core: save current form to ref (synchronous, no batching issues) ─────
    function saveDraftForCurrent(): boolean {
        if (!submissionId) return false;

        // Only save if something actually changed from the loaded/clean state
        const clean = cleanStateRef.current;
        const isDirty = grade !== clean.grade ||
            feedback !== clean.feedback ||
            JSON.stringify(rubricScores) !== JSON.stringify(clean.rubricScores);

        if (!isDirty) return false; // Nothing changed — don't mark as draft

        pendingGradesRef.current = {
            ...pendingGradesRef.current,
            [submissionId]: { grade, feedback, rubricScores }
        };
        draftIdsRef.current = new Set(draftIdsRef.current).add(submissionId);
        setDraftVersion(v => v + 1);
        return true;
    }

    // Helper: update a single field in the draft ref for current student
    function markDraftField(field: Partial<DraftEntry>) {
        if (!submissionId) return;
        const existing = pendingGradesRef.current[submissionId] || { grade, feedback, rubricScores };
        pendingGradesRef.current = {
            ...pendingGradesRef.current,
            [submissionId]: { ...existing, ...field }
        };
        draftIdsRef.current = new Set(draftIdsRef.current).add(submissionId);
        setDraftVersion(v => v + 1);
    }

    // Switch to another student: auto-save current draft first, then navigate
    function switchToStudent(s: Submission) {
        // 1. Capture current form data into ref BEFORE navigating
        saveDraftForCurrent();

        // 2. Reset workspace UI
        setIsWorkspaceOpen(false);
        setWorkspaceFiles([]);
        setSwitching(true);
        setActiveAttemptIndex(0);
        loadedAttemptIdRef.current = null;

        // 3. Navigate — loadData reads from ref, which already has the draft
        navigate(`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading/${s.id}`);
    }

    // ─── Staleness guard for loadData ─────────────────────────────────────────
    // Each loadData invocation increments this. After every await, if the counter
    // has moved on, the invocation is stale and must bail out to avoid overwriting
    // a newer student's form state.
    const loadSeqRef = useRef(0);

    async function loadData() {
        if (!submissionId || !assignmentId) return;

        const seq = ++loadSeqRef.current;

        const isFirstLoad = !assignment;
        if (isFirstLoad) setLoading(true);

        try {
            const knownStudent = allStudentSubmissions.find(s => s.id === parseInt(submissionId));

            const [subData, assignData, historyData, groupsData] = await Promise.all([
                getSubmission(parseInt(submissionId)),
                assignment ? Promise.resolve(assignment) : getAssignment(assignmentId),
                knownStudent
                    ? getSubmissions({ assignment_id: assignmentId, student_id: knownStudent.student_id })
                    : Promise.resolve([] as typeof allSubmissions),
                getAssignmentGroups(assignmentId).catch(() => [] as AssignmentGroup[])
            ]);

            // ── STALE CHECK 1: if another loadData started while we awaited, bail ──
            if (loadSeqRef.current !== seq) return;

            const resolvedHistory = historyData.length > 0
                ? historyData
                : await getSubmissions({ assignment_id: assignmentId, student_id: subData.student_id });

            // ── STALE CHECK 2 ──
            if (loadSeqRef.current !== seq) return;

            setAssignmentGroups(groupsData || []);
            setSubmission(subData);
            setAssignment(assignData);
            setHideNames(_isTA && !!assignData.hide_student_names);

            // Parse rubric — build blank rubric scores for all criteria
            let rubricCfg: RubricConfig | null = null;
            let blankRubricScores: Record<string, number | ''> = {};
            if (assignData.rubric_config) {
                try {
                    const parsed = typeof assignData.rubric_config === 'string'
                        ? JSON.parse(assignData.rubric_config)
                        : assignData.rubric_config;
                    if (parsed && (parsed.sections || parsed.criteria)) {
                        rubricCfg = parsed as RubricConfig;
                        const items = rubricCfg!.sections
                            ? rubricCfg!.sections.flatMap(s => s.items)
                            : (rubricCfg!.criteria ?? []);
                        items.forEach(c => { if (c.id) blankRubricScores[c.id] = ''; });
                        setRubric(rubricCfg);
                    }
                } catch (e) {
                    console.warn('Failed to parse rubric_config', e);
                }
            }

            // Sort history once: oldest first (index 0) to newest (last index)
            const sortedHistory = [...resolvedHistory].sort((a, b) => 
                new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
            );
            setAllSubmissions(sortedHistory);

            // Default to the latest attempt
            const latestIdx = sortedHistory.length > 0 ? sortedHistory.length - 1 : 0;
            setActiveAttemptIndex(latestIdx);

            // ── Restore form state ─────────────────────────────────────────────
            // Read from REF (always current — no stale closure)
            const pendingDraft = pendingGradesRef.current[submissionId];
            let restoredGrade: string;
            let restoredFeedback: string;
            let restoredRubric: Record<string, number | ''>;
            if (pendingDraft) {
                restoredGrade = pendingDraft.grade;
                restoredFeedback = pendingDraft.feedback;
                restoredRubric = pendingDraft.rubricScores;
            } else {
                restoredGrade = subData.grade !== undefined && subData.grade !== null ? Number(subData.grade).toFixed(2) : '';
                restoredFeedback = subData.feedback || '';
                restoredRubric = blankRubricScores;
            }
            setGrade(restoredGrade);
            setFeedback(restoredFeedback);
            setRubricScores(restoredRubric);

            // Record the "clean" state so saveDraftForCurrent can detect changes
            cleanStateRef.current = { grade: restoredGrade, feedback: restoredFeedback, rubricScores: restoredRubric };

            setTestSummary(parseTestSummary(subData.auto_feedback || subData.feedback));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setSwitching(false);
        }
    }

    // (AI analysis removed from grading page)

    async function handleDownload(url: string, filename: string) {
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

    async function loadAttemptWorkspace(files: { name: string; path: string }[], targetSubmissionId: number, preferredPath?: string) {
        setIsPreviewLoading(true);
        try {
            const ordered = preferredPath
                ? [...files].sort((a, b) => (a.path === preferredPath ? -1 : b.path === preferredPath ? 1 : 0))
                : files;
            const loaded = await Promise.all(ordered.map(async (f, idx) => {
                const url = getSubmissionFileUrl(targetSubmissionId, f.name);
                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error();
                    const content = await res.text();
                    return {
                        id: `${f.path}-${idx}`,
                        name: f.name,
                        content,
                        language: getLanguageFromFilename(f.name, assignment?.language || ''),
                    } as EditorFile;
                } catch {
                    return {
                        id: `${f.path}-${idx}`,
                        name: f.name,
                        content: 'Unable to render this file in editor preview. Please use Download.',
                        language: getLanguageFromFilename(f.name, assignment?.language || ''),
                    } as EditorFile;
                }
            }));
            setWorkspaceFiles(loaded);
            setIsWorkspaceOpen(true);
        } finally {
            setIsPreviewLoading(false);
        }
    }

    async function handleAutograde(id?: number, dryRun = false) {
        const targetId = id || submission?.id;
        if (!targetId) return;
        setIsAutograding(true);
        if (!dryRun) setShowAttemptSelector(false);
        try {
            const updatedSub = await runAutograde(targetId, dryRun);
            setTestSummary(parseTestSummary(updatedSub.feedback));
            if (dryRun) {
                setSubmission(prev => prev ? { ...prev, auto_grade: updatedSub.grade, auto_feedback: updatedSub.feedback } : null);
                setAlertConfig({ show: true, type: 'info', title: 'Test Case Report Ready', message: 'View details to inspect test-by-test output.' });
            } else {
                if (submission?.id === updatedSub.id) setSubmission(updatedSub);
                setAllSubmissions(prev => prev.map(s => s.id === updatedSub.id ? updatedSub : s));
                setAlertConfig({ show: true, type: 'success', title: 'Success', message: 'Autograding completed.' });
            }
        } catch (err) {
            console.error(err);
            setAlertConfig({ show: true, type: 'error', title: 'Error', message: 'Autograding failed.' });
        } finally {
            setIsAutograding(false);
        }
    }

    async function handleRunCustomInput(files: EditorFile[], stdin: string, activeFileId: string) {
        if (!assignment) return { stdout: '', stderr: 'Assignment not found', exitCode: 1, timedOut: false };
        setIsRunningCustom(true);
        try {
            const payload = buildAssignmentExecutionPayload(files, activeFileId, assignment.language || '');
            const data = await runCustomCode(assignment.id, { ...payload, stdin });
            return data;
        } catch (err) {
            throw new Error(`Failed to execute code: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsRunningCustom(false);
        }
    }

    async function handleRunTests(files: EditorFile[], activeFileId: string) {
        if (!assignment) throw new Error('No assignment loaded');
        setIsRunningCustom(true);
        try {
            const payload = buildAssignmentExecutionPayload(files, activeFileId, assignment.language || '');
            const data = await runTests(assignment.id, payload);
            const results = data.results || [];
            const passedCount = results.filter((r: TestResult) => !!r.passed).length;
            const totalCount = results.length;
            setTestSummary({ passed: passedCount, total: totalCount });

            const reportLines = results.map((r: TestResult, idx: number) => {
                const status = r.passed ? 'PASSED' : 'FAILED';
                const visibility = r.is_public === 0 ? 'Hidden' : 'Public';
                const expected = r.expected ?? '-';
                const actual = r.actual ?? '-';
                const err = r.error ? `\n  Error: ${r.error}` : '';
                return `Test Case ${idx + 1} [${visibility}] - ${status}\n  Expected: ${expected}\n  Actual: ${actual}${err}`;
            });
            const report = `Execution Summary\nPassed: ${passedCount}/${totalCount}\nStatus: ${totalCount > 0 && passedCount === totalCount ? 'Passed' : 'Failed'}\n\n${reportLines.join('\n\n')}`;
            setSubmission(prev => prev ? { ...prev, auto_feedback: report } : prev);
            return { results: data.results, log: `Language: ${payload.language} · ${payload.code.length} bytes${payload.files?.length ? ` + ${payload.files.length} Java files` : ''}` };
        } catch (err) {
            throw new Error(`Failed to run tests: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsRunningCustom(false);
        }
    }

    function computeRubricTotal(): number | null {
        if (!rubric) return null;
        const maxPoints = assignment?.points || 100;
        const criteria = rubric.sections ? rubric.sections.flatMap(s => s.items) : (rubric.criteria ?? []);
        const scores = criteria.map(c => {
            const raw = c.id ? rubricScores[c.id] : undefined;
            const val = typeof raw === 'number' ? raw : (raw === '' || raw === undefined) ? 0 : Number(raw);
            return { crit: c, val: c.maxPoints != null ? Math.min(val, c.maxPoints) : val };
        });
        if (rubric.weighted) {
            let totalWeight = 0, weightedSum = 0;
            scores.forEach(({ crit, val }) => {
                const weight = crit.weight ?? crit.maxPoints ?? 0;
                const maxPts = crit.maxPoints ?? crit.weight ?? 0;
                if (!isNaN(weight) && weight > 0 && !isNaN(maxPts) && maxPts > 0) {
                    totalWeight += weight;
                    weightedSum += (val / maxPts) * weight;
                }
            });
            if (totalWeight > 0) return Math.round((weightedSum / totalWeight) * maxPoints * 100) / 100;
        } else {
            const totalEarned = scores.reduce((sum, s) => sum + (isNaN(s.val) ? 0 : s.val), 0);
            const totalPossible = scores.reduce((sum, s) => sum + (s.crit.maxPoints ?? 0), 0);
            if (totalPossible > 0) return Math.round((totalEarned / totalPossible) * maxPoints * 100) / 100;
        }
        return null;
    }

    async function handleSave() {
        // Capture current student into ref first
        saveDraftForCurrent();

        // Read ALL drafts from ref (always current)
        const allDrafts = { ...pendingGradesRef.current };
        if (submissionId) allDrafts[submissionId] = { grade, feedback, rubricScores };

        const idsToSave = Array.from(draftIdsRef.current);
        // Also include current student if they have a draft but weren't already tracked
        if (submissionId && !idsToSave.includes(submissionId)) {
            const clean = cleanStateRef.current;
            const isDirty = grade !== clean.grade || feedback !== clean.feedback;
            if (isDirty) idsToSave.push(submissionId);
        }
        if (idsToSave.length === 0) return;

        setLoading(true);
        try {
            const savedGroups = new Set<string>();
            let savedIndividualCount = 0;

            const promises = idsToSave.map(async (id) => {
                const subIdNum = parseInt(id);
                const data = allDrafts[id];
                if (!data) return;

                // Empty grade = ungrade the student; non-empty = set as graded
                const hasGrade = data.grade !== '' && data.grade !== null && data.grade !== undefined;
                const gradeValue = hasGrade ? parseFloat(data.grade) : null;
                const newStatus = hasGrade ? 'graded' : 'pending';

                const subRef = allStudentSubmissions.find(s => s.id === subIdNum) ||
                    (id === submissionId ? submission : null);

                if (gradeByGroup && assignment?.type === 'group' && subRef) {
                    const studentGroup = assignmentGroups.find(g =>
                        g.students.some(s => s.id === (subRef as Submission).student_id)
                    );
                    if (studentGroup) {
                        savedGroups.add(studentGroup.name);
                        return gradeAssignmentGroup(assignment.id, studentGroup.id, {
                            grade: gradeValue,
                            feedback: data.feedback,
                            status: newStatus
                        });
                    }
                }

                savedIndividualCount++;
                const numericRubricScores = toNumericRubricScores(data.rubricScores);
                return updateSubmission(subIdNum, {
                    grade: gradeValue,
                    feedback: data.feedback,
                    status: newStatus,
                    rubric_scores: Object.keys(numericRubricScores).length > 0 ? numericRubricScores : undefined
                });
            });

            await Promise.all(promises);

            // Clear ALL draft refs after successful finalize
            pendingGradesRef.current = {};
            draftIdsRef.current = new Set();
            setDraftVersion(v => v + 1);

            // Construct dynamic success message
            let successMessage = '';
            if (savedGroups.size > 0 && savedIndividualCount === 0) {
                if (savedGroups.size === 1) {
                    successMessage = `Successfully posted grades for ${Array.from(savedGroups)[0]}.`;
                } else {
                    successMessage = `Successfully posted grades for ${savedGroups.size} groups.`;
                }
            } else if (savedIndividualCount > 0 && savedGroups.size === 0) {
                successMessage = `Successfully posted grades for ${savedIndividualCount} student(s).`;
            } else {
                const groupsPart = savedGroups.size > 0 
                    ? `${savedGroups.size} group${savedGroups.size > 1 ? 's' : ''}` 
                    : '';
                const studentsPart = savedIndividualCount > 0 
                    ? `${savedIndividualCount} student${savedIndividualCount > 1 ? 's' : ''}` 
                    : '';
                successMessage = `Successfully posted grades for ${groupsPart}${groupsPart && studentsPart ? ' and ' : ''}${studentsPart}.`;
            }

            setAlertConfig({
                show: true,
                type: 'success',
                title: 'Grades Posted',
                message: successMessage
            });

            // Reload to reflect new graded status in sidebar
            await loadData();
            if (assignmentId) {
                getSubmissions({ assignment_id: assignmentId }).then(data => {
                    const latestByStudent: Record<string, Submission> = {};
                    data.forEach(s => {
                        if (!latestByStudent[s.student_id] || new Date(s.submitted_at) > new Date(latestByStudent[s.student_id].submitted_at)) {
                            latestByStudent[s.student_id] = s;
                        }
                    });
                    setAllStudentSubmissions(Object.values(latestByStudent));
                }).catch(console.error);
            }
        } catch (err: any) {
            console.error('Grade save error:', err);
            setAlertConfig({
                show: true,
                type: 'error',
                title: 'Error',
                message: err?.message || 'Failed to post some or all grades.'
            });
        } finally {
            setLoading(false);
        }
    }

    function handleSaveDraftOnly() {
        const didSave = saveDraftForCurrent();
        setAlertConfig({
            show: true,
            type: 'info',
            title: didSave ? 'Draft saved' : 'No changes to save',
            message: didSave
                ? 'Saved locally. Use “Finalize & Post” to publish grades.'
                : 'Make a change to grade/feedback/rubric to save a draft.',
        });
    }

    // When names are hidden, search is disabled — show all students unfiltered
    const filteredStudents = hideNames
        ? allStudentSubmissions
        : allStudentSubmissions.filter(s =>
            s.student_name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
            s.student_id?.toLowerCase().includes(studentSearch.toLowerCase())
        );

    // Returns anonymous label for a student based on their position in the full list
    const anonLabel = (studentId: string) => {
        const idx = allStudentSubmissions.findIndex(s => s.student_id === studentId);
        return idx >= 0 ? `Student ${idx + 1}` : 'Student';
    };

    const displayOrderedStudents = useMemo(() => {
        if (gradeByGroup && assignment?.type === 'group') {
            const ordered: Submission[] = [];
            assignmentGroups.forEach(group => {
                const groupStudents = filteredStudents.filter((s: Submission) => 
                    group.students.some(gStud => gStud.id === s.student_id)
                );
                ordered.push(...groupStudents);
            });
            return ordered;
        }
        return filteredStudents;
    }, [gradeByGroup, assignment, assignmentGroups, filteredStudents]);

    const currentStudentIndex = displayOrderedStudents.findIndex(s => s.id === parseInt(submissionId || '0'));
    const prevStudent = currentStudentIndex > 0 ? (displayOrderedStudents[currentStudentIndex - 1] as Submission) : undefined;
    const nextStudent = currentStudentIndex < displayOrderedStudents.length - 1 ? (displayOrderedStudents[currentStudentIndex + 1] as Submission) : undefined;

    const [showPlagPopover, setShowPlagPopover] = useState(false);
    const plagPopoverRef = useRef<HTMLDivElement>(null);

    const studentPlagiarismMatches = useMemo(() => {
        if (!assignmentId || !submission) return [];
        try {
            const stored = localStorage.getItem(`plagiarism-flags-${assignmentId}`);
            if (!stored) return [];
            const all: { student1: { id: string; name: string }; student2: { id: string; name: string }; similarity: number; sameGroup?: string | null }[] = JSON.parse(stored);
            return all.filter(
                m => !m.sameGroup && (m.student1.id === submission.student_id || m.student2.id === submission.student_id)
            );
        } catch { return []; }
    }, [assignmentId, submission]);

    useEffect(() => {
        if (!showPlagPopover) return;
        function handleClick(e: MouseEvent) {
            if (plagPopoverRef.current && !plagPopoverRef.current.contains(e.target as Node)) {
                setShowPlagPopover(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showPlagPopover]);
    
    // (AI analysis removed from grading page)

    if (loading) return <div className="grader-container"><div className="grader-loading">Loading...</div></div>;
    if (!submission || !assignment || !activeAttempt) return <div className="grader-container"><div className="grader-loading">Submission not found</div></div>;

    const maxPoints = assignment.points || 100;
    const activeAttemptFiles = activeAttempt.files || [{ name: activeAttempt.file_name, path: activeAttempt.file_path }];
    const attemptPrimaryFile = activeAttemptFiles[0];
    const canGoPrevAttempt = activeAttemptIndex > 0;
    const canGoNextAttempt = activeAttemptIndex < allSubmissions.length - 1;
    const studentDisplayName = hideNames ? anonLabel(submission.student_id) : (submission.student_name || 'Student');
    const isSubmissionGraded = submission.status === 'graded';

    const showDrawerBackdrop = isNarrowLayout && (leftDrawerOpen || rightDrawerOpen);



    /** On narrow screens, drawer width is controlled by CSS — do not set inline width (collapsed uses 0px and breaks slide/scroll). */
    const leftSidebarStyle = isNarrowLayout ? undefined : { width: isLeftSidebarCollapsed ? 0 : leftWidth };
    const rightSidebarStyle = isNarrowLayout ? undefined : { width: isRightSidebarCollapsed ? 0 : rightWidth };

    return (
        <div className="grader-container" ref={containerRef}>

            {/* Mobile drawer backdrops */}
            {showDrawerBackdrop && (
                <div
                    className="drawer-backdrop"
                    onClick={() => { setLeftDrawerOpen(false); setRightDrawerOpen(false); }}
                />
            )}

            {/* ── LEFT SIDEBAR: Student List ───────────────── */}
            <div
                className={`grader-sidebar grader-sidebar-left${leftDrawerOpen ? ' drawer-open' : ''}${isLeftSidebarCollapsed ? ' collapsed' : ''}`}
                style={leftSidebarStyle}
            >
                <div className="sidebar-header">
                    <span className="sidebar-header-title">Students</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="sidebar-header-count" type="button" aria-label="Student count">
                            <Users size={14} />
                            <span>{allStudentSubmissions.length}</span>
                        </button>
                        <button className="sidebar-toggle-btn desktop-only" onClick={() => toggleLeftSidebar(true)} title="Collapse Student List"><PanelLeftClose size={16} /></button>
                        <button className="drawer-close-btn" onClick={() => setLeftDrawerOpen(false)}><X size={15} /></button>
                    </div>
                </div>

                <div className="grader-sidebar-back-link">
                    <Link to={`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading`}>
                        <ChevronLeft size={14} />
                        Back to Grading List
                    </Link>
                </div>

                {/* TA notice when faculty has hidden names */}
                {_isTA && assignment?.hide_student_names ? (
                    <div className="anon-hidden-notice">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Names hidden by instructor
                    </div>
                ) : null}

                {/* Search only shown when names are visible */}
                {!hideNames && (
                    <div className="sidebar-search">
                        <Search size={14} className="sidebar-search-icon" />
                        <input
                            className="sidebar-search-input"
                            placeholder="Search students..."
                            value={studentSearch}
                            onChange={e => setStudentSearch(e.target.value)}
                        />
                    </div>
                )}

                {assignment?.type === 'group' && (
                    <div className="grade-by-group-toggle">
                        <span className="toggle-label">Grade by Group</span>
                        <label className="switch">
                            <input
                                type="checkbox"
                                checked={gradeByGroup}
                                onChange={e => {
                                    setGradeByGroup(e.target.checked);
                                    localStorage.setItem('grader_group_mode', String(e.target.checked));
                                }}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                )}

                <div className="student-list">
                    {gradeByGroup && assignment?.type === 'group' ? (
                        <>
                            {assignmentGroups.length === 0 && (
                                <div className="student-list-empty">No groups found</div>
                            )}
                            {assignmentGroups.map(group => {
                                const groupStudents = filteredStudents.filter(s => group.students.some(gStud => gStud.id === s.student_id));
                                if (groupStudents.length === 0) return null;
                                return (
                                    <div key={group.id} className="group-section">
                                        <div className="group-section-header">
                                            {group.name}
                                        </div>
                                        {groupStudents.map(s => {
                                            const isActive = s.id === parseInt(submissionId || '0');
                                            const pending = pendingGradesRef.current[s.id.toString()];
                                            const isModified = draftIdsRef.current.has(s.id.toString());
                                            const displayGrade = pending ? pending.grade : (s.grade !== null && s.grade !== undefined ? String(s.grade) : null);
                                            const hasGradeValue = displayGrade !== null && displayGrade !== '';
                                            const displayName = hideNames ? anonLabel(s.student_id) : s.student_name;
                                            return (
                                                <div
                                                    key={s.id}
                                                                                    className={`student-list-item ${isActive ? 'active' : ''} ${isModified ? 'modified' : ''}`}
                                                                                    onClick={() => { setLeftDrawerOpen(false); switchToStudent(s); }}
                                                                                >
                                                                                    <UserAvatar
                                                                                        user={hideNames ? { name: displayName } : { name: s.student_name, profilePicture: s.student_profile_picture }}
                                                                                        size={34}
                                                                                    />
                                                                                    <div className="student-list-info">
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                            <span className="student-list-name">{displayName}</span>
                                                                                        </div>
                                                                                        {isModified && <span className="unsaved-dot" title="Unsaved draft">●</span>}
                                                                                    </div>
                                                                                    <div className={`student-grade-badge ${isModified ? 'draft' : hasGradeValue ? 'graded' : 'pending'}`}>
                                                                                        {isModified
                                                                                            ? <><Clock size={11} />{hasGradeValue ? `${Number(displayGrade).toFixed(0)}/${maxPoints}` : `-/${maxPoints}`}</>
                                                                                            : hasGradeValue
                                                                                                ? <><CheckCircle size={11} />{`${Number(displayGrade).toFixed(0)}/${maxPoints}`}</>
                                                                                                : <><Clock size={11} />Pending</>
                                                                                        }
                                                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </>
                    ) : (
                        <>
                            {filteredStudents.length === 0 && (
                                <div className="student-list-empty">No students found</div>
                            )}
                            {filteredStudents.map(s => {
                                const isActive = s.id === parseInt(submissionId || '0');
                                const pending = pendingGradesRef.current[s.id.toString()];
                                const isModified = draftIdsRef.current.has(s.id.toString());
                                const displayGrade = pending ? pending.grade : (s.grade !== null && s.grade !== undefined ? String(s.grade) : null);
                                const hasGradeValue = displayGrade !== null && displayGrade !== '';
                                const displayName = hideNames ? anonLabel(s.student_id) : s.student_name;
                                return (
                                    <div
                                        key={s.id}
                                        className={`student-list-item ${isActive ? 'active' : ''} ${isModified ? 'modified' : ''}`}
                                        onClick={() => { setLeftDrawerOpen(false); switchToStudent(s); }}
                                    >
                                        <UserAvatar
                                            user={hideNames ? { name: displayName } : { name: s.student_name, profilePicture: s.student_profile_picture }}
                                            size={34}
                                        />
                                        <div className="student-list-info">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span className="student-list-name">{displayName}</span>
                                            </div>
                                            {isModified && <span className="unsaved-dot" title="Draft — not yet posted">●</span>}
                                        </div>
                                        <div className={`student-grade-badge ${isModified ? 'draft' : hasGradeValue ? 'graded' : 'pending'}`}>
                                            {isModified
                                                ? <><Clock size={11} />{hasGradeValue ? `${Number(displayGrade).toFixed(0)}/${maxPoints}` : `-/${maxPoints}`}</>
                                                : hasGradeValue
                                                    ? <><CheckCircle size={11} />{`${Number(displayGrade).toFixed(0)}/${maxPoints}`}</>
                                                    : <><Clock size={11} />Pending</>
                                            }
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                <div className="sidebar-resize-handle-v" onMouseDown={() => setIsResizingLeft(true)} />
            </div>

            {/* ── MIDDLE: Submission + Preview ─────────────── */}
            <div className={`grader-panel-middle${switching ? ' switching' : ''}`}>

                <div className="grader-main-back-link">
                    <Link to={`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading`}>
                        <ChevronLeft size={14} />
                        Back to Grading List
                    </Link>
                </div>

                {/* 1. Top Navigation Bar */}
                <div className="grader-top-nav-bar" style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '0 28px 16px' }}>
                    {isLeftSidebarCollapsed && (
                        <button className="sidebar-expand-btn" onClick={() => toggleLeftSidebar(false)} title="Expand Student List">
                            <Users size={18} />
                            <span style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Student List</span>
                        </button>
                    )}
                </div>

                {/* Mobile toolbar — drawer toggles */}
                <div className="mobile-drawer-toolbar">
                    <button className="mobile-drawer-btn" onClick={() => { setLeftDrawerOpen(true); setRightDrawerOpen(false); }}>
                        <Users size={16} />
                        <span>Students</span>
                    </button>
                    <button className="mobile-drawer-btn" onClick={() => { setRightDrawerOpen(true); setLeftDrawerOpen(false); }}>
                        <ClipboardList size={16} />
                        <span>Grading</span>
                    </button>
                </div>

                {/* Student header */}
                <div className="grader-student-header">
                    <div className="grader-header-content">
                        <div className="grader-title-row">
                            <h2 className="grader-title">{studentDisplayName}</h2>
                            {isSubmissionGraded && <span className="graded-by-pill">Graded</span>}
                            {studentPlagiarismMatches.length > 0 && (
                                <div className="plagiarism-flag-wrapper">
                                    <button
                                        type="button"
                                        className="plagiarism-flag"
                                        onClick={() => setShowPlagPopover(prev => !prev)}
                                        title="Click to view plagiarism details"
                                    >
                                        <ShieldAlert size={14} />
                                        Plagiarism
                                    </button>
                                    {showPlagPopover && (
                                        <div className="plagiarism-popover" ref={plagPopoverRef}>
                                            <div className="plagiarism-popover-header">
                                                <h4>Plagiarism Matches</h4>
                                                <button
                                                    type="button"
                                                    className="plagiarism-popover-close"
                                                    onClick={() => setShowPlagPopover(false)}
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                            <div className="plagiarism-popover-body">
                                                {studentPlagiarismMatches.map((match, i) => {
                                                    const other = match.student1.id === submission.student_id
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
                                                                    navigate(`${basePath}/plagscan?assignment=${assignmentId}&s1=${match.student1.id}&s2=${match.student2.id}`);
                                                                    setShowPlagPopover(false);
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
                            <div className="student-nav-btns right-end">
                                <button
                                    className="student-nav-btn"
                                    disabled={!prevStudent}
                                    onClick={() => prevStudent && switchToStudent(prevStudent)}
                                    title={prevStudent ? `Previous: ${prevStudent.student_name}` : 'No previous student'}
                                >&#8249;</button>
                                <span className="student-nav-counter">{currentStudentIndex + 1} / {displayOrderedStudents.length}</span>
                                <button
                                    className="student-nav-btn"
                                    disabled={!nextStudent}
                                    onClick={() => nextStudent && switchToStudent(nextStudent)}
                                    title={nextStudent ? `Next: ${nextStudent.student_name}` : 'No next student'}
                                >&#8250;</button>
                            </div>
                        </div>
                        <div className="meta-bar">
                            {!hideNames && <>
                                <div className="meta-item">
                                    <span className="meta-label">ID</span>
                                    <span className="meta-value">{submission.student_id}</span>
                                </div>
                                <div className="meta-separator" />
                            </>}
                            <div className="meta-item">
                                <span className="meta-label">Assignment</span>
                                <span className="meta-value">{assignment.title}</span>
                            </div>
                            <div className="meta-separator" />
                            <div className="meta-item">
                                <span className="meta-label">Submitted</span>
                                <span className="meta-value">
                                    {new Date(submission.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                                </span>
                            </div>
                            <div className="meta-separator" />
                            <div className="meta-item">
                                <span className="meta-label">Attempts</span>
                                <span className="meta-value">{allSubmissions.length}</span>
                            </div>
                        </div>
                        <div className="submission-summary-cards">
                            <div className="summary-card">
                                <div className="summary-card-label">Assignment</div>
                                <div className="summary-card-value">{assignment.title}</div>
                            </div>
                            <div className="summary-card">
                                <div className="summary-card-label">Submitted</div>
                                <div className="summary-card-value">
                                    {new Date(activeAttempt.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                                </div>
                            </div>
                            <div className="summary-card">
                                <div className="summary-card-label">Attempts</div>
                                <div className="summary-card-value">{allSubmissions.length}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Submission artifacts */}
                <div className="submissions-section">
                    <div className="submission-attempt-group">
                        <div className="attempt-topbar">
                            <div className="attempt-label">
                                <Layers size={14} />
                                Attempt {activeAttemptIndex + 1}
                                <span className="attempt-date-inline">
                                    <CalendarDays size={12} />
                                    {new Date(activeAttempt.submitted_at).toLocaleString()}
                                </span>
                            </div>
                            <div className="attempt-topbar-right">
                                <div className="file-actions">
                                    <Button
                                        variant="outline"
                                        className="btn-pill"
                                        size="sm"
                                        onClick={() => {
                                            if (!attemptPrimaryFile) return;
                                            if (isWorkspaceOpen) {
                                                setIsWorkspaceOpen(false);
                                                setWorkspaceFiles([]);
                                            } else {
                                                void loadAttemptWorkspace(activeAttemptFiles, activeAttempt.id, attemptPrimaryFile.path);
                                            }
                                        }}
                                        disabled={!attemptPrimaryFile}
                                    >
                                        {isWorkspaceOpen ? 'Hide' : 'Preview'}
                                    </Button>
                                    <Button
                                        variant="primary"
                                        className="btn-pill"
                                        size="sm"
                                        onClick={() => attemptPrimaryFile && handleDownload(getSubmissionFileUrl(activeAttempt.id, attemptPrimaryFile.name), attemptPrimaryFile.name)}
                                        disabled={!attemptPrimaryFile}
                                    >
                                        Download
                                    </Button>
                                </div>
                                <div className="student-nav-btns">
                                <button
                                    className="student-nav-btn"
                                    disabled={!canGoPrevAttempt}
                                    onClick={() => setActiveAttemptIndex(prev => Math.max(prev - 1, 0))}
                                    title="Previous attempt"
                                >
                                    &#8249;
                                </button>
                                <span className="student-nav-counter">{activeAttemptIndex + 1} / {allSubmissions.length}</span>
                                <button
                                    className="student-nav-btn"
                                    disabled={!canGoNextAttempt}
                                    onClick={() => setActiveAttemptIndex(prev => Math.min(prev + 1, allSubmissions.length - 1))}
                                    title="Next attempt"
                                >
                                    &#8250;
                                </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="preview-area">
                    {isPreviewLoading ? (
                        <div className="preview-placeholder"><div className="loading-spinner" />Loading preview...</div>
                    ) : isWorkspaceOpen && workspaceFiles.length > 0 ? (
                        <div className="code-preview-container">
                            <AssignmentEditor
                                initialFiles={workspaceFiles}
                                language={assignment.language || ''}
                                theme="light"
                                isRunning={isRunningCustom}
                                points={0}
                                onRunTests={handleRunTests}
                                onRunCustomInput={handleRunCustomInput}
                                readOnly={true}
                                defaultSidebarOpen={false}
                            />
                        </div>
                    ) : (
                        <div className="preview-placeholder">Select Preview from the attempts bar to view files in Project Workspace.</div>
                    )}
                </div>
            </div>

            {/* ── RIGHT SIDEBAR: Grading ────────────────────── */}
            <div
                className={`grader-sidebar grader-sidebar-right${rightDrawerOpen ? ' drawer-open' : ''}${isRightSidebarCollapsed ? ' collapsed' : ''}${switching ? ' switching' : ''}`}
                style={rightSidebarStyle}
            >
                <div className="sidebar-resize-handle-v sidebar-resize-handle-right" onMouseDown={() => setIsResizingRight(true)} />

                <div className="grading-sidebar-content">
                        <div className="grading-sidebar-titlebar">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <h2 className="section-title grader-form-title" style={{ margin: 0 }}>Grading</h2>
                                <button className="sidebar-toggle-btn desktop-only" onClick={() => toggleRightSidebar(true)} title="Collapse Grading"><PanelRightClose size={16} /></button>
                            </div>
                            <button className="drawer-close-btn" onClick={() => setRightDrawerOpen(false)}><X size={15} /></button>
                        </div>

                        <div className="grading-form">
                            <div className="form-actions single" style={{ marginBottom: '1.5rem' }}>
                                <Button 
                                    onClick={handleSave} 
                                    variant="primary"
                                    className={draftIdsRef.current.size > 0 ? 'modified-save' : ''}
                                    style={{ width: '100%', padding: '10px 0' }}
                                >
                                    {draftIdsRef.current.size > 1 
                                        ? `Finalize & Post ALL Grades (${draftIdsRef.current.size})` 
                                        : draftIdsRef.current.size === 1 
                                            ? 'Finalize & Post Grade' 
                                            : 'Finalize & Post Grade'}
                                </Button>
                            </div>

                            {/* 1. Test case summary */}
                            <div className="autograde-result-box">
                                <div>
                                    <span className="autograde-label">Test Case Results</span>
                                    <div className="autograde-score">
                                        {testSummary.passed !== null && testSummary.total !== null
                                            ? `${testSummary.passed}/${testSummary.total}`
                                            : '0/0'}
                                    </div>
                                </div>
                                <Button size="sm" style={{ backgroundColor: 'var(--primary-color)', color: 'white' }} onClick={() => setShowFeedbackModal(true)}>
                                    View details
                                </Button>
                            </div>

                            {/* AI Content Analysis removed */}

                            {/* 3. Rubric scoring */}
                            {rubric && (
                                <div className="rubric-card">
                                    <div className="rubric-header">
                                        <h3 className="rubric-title">{rubric.title || 'Rubric'}</h3>
                                        <p className="rubric-subtitle">{rubric.weighted ? 'Weighted rubric (weights in %)' : 'Unweighted rubric'}</p>
                                    </div>
                                    {(rubric.sections ?? []).length > 0 ? (
                                        rubric.sections!.map(section => (
                                            <div key={section.id} style={{ marginBottom: '1rem' }}>
                                                {section.title && <div className="rubric-section-label">{section.title}</div>}
                                                <div className="rubric-table-wrapper">
                                                    <table className="rubric-table">
                                                        <thead><tr>
                                                            <th>Criterion</th>
                                                            {rubric.weighted && <th>Wt%</th>}
                                                            <th>Max</th><th>Score</th>
                                                        </tr></thead>
                                                        <tbody>
                                                            {section.items.map(crit => (
                                                                <tr key={crit.id}>
                                                                    <td title={crit.comment || undefined}>{crit.name}</td>
                                                                    {rubric.weighted && <td>{crit.weight ?? '-'}</td>}
                                                                    <td>{crit.maxPoints ?? '-'}</td>
                                                                    <td>
                                                                        <input type="number" className="rubric-score-input" min={0} max={crit.maxPoints ?? undefined}
                                                                            value={crit.id ? (rubricScores[crit.id] ?? '') : ''}
                                                                            onChange={e => {
                                                                                if (!crit.id) return;
                                                                                const raw = e.target.value;
                                                                                let nextScores: Record<string, number | ''>;
                                                                                if (raw === '') { 
                                                                                    nextScores = { ...rubricScores, [crit.id!]: '' };
                                                                                } else {
                                                                                    const num = Number(raw);
                                                                                    nextScores = { ...rubricScores, [crit.id!]: crit.maxPoints != null ? Math.min(num, crit.maxPoints) : num };
                                                                                }
                                                                                setRubricScores(nextScores);
                                                                                if (submissionId) {
                                                                                    markDraftField({ rubricScores: nextScores });
                                                                                }
                                                                            }} />
                                                                    </td>
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
                                                <thead><tr>
                                                    <th>Criterion</th>
                                                    {rubric.weighted && <th>Wt%</th>}
                                                    <th>Max</th><th>Score</th>
                                                </tr></thead>
                                                <tbody>
                                                    {(rubric.criteria ?? []).map((crit, idx) => (
                                                        <tr key={crit.id || idx}>
                                                            <td title={crit.comment || undefined}>{crit.name}</td>
                                                            {rubric.weighted && <td>{crit.weight ?? '-'}</td>}
                                                            <td>{crit.maxPoints ?? '-'}</td>
                                                            <td>
                                                                <input type="number" className="rubric-score-input" min={0} max={crit.maxPoints ?? undefined}
                                                                    value={crit.id ? (rubricScores[crit.id] ?? '') : ''}
                                                                    onChange={e => {
                                                                        if (!crit.id) return;
                                                                        const raw = e.target.value;
                                                                        let nextScores: Record<string, number | ''>;
                                                                        if (raw === '') { 
                                                                            nextScores = { ...rubricScores, [crit.id!]: '' };
                                                                        } else {
                                                                            const num = Number(raw);
                                                                            nextScores = { ...rubricScores, [crit.id!]: crit.maxPoints != null ? Math.min(num, crit.maxPoints) : num };
                                                                        }
                                                                        setRubricScores(nextScores);
                                                                        if (submissionId) {
                                                                            markDraftField({ rubricScores: nextScores });
                                                                        }
                                                                    }} />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    <div className="rubric-summary">
                                        {(() => {
                                            const total = computeRubricTotal();
                                            return (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '13px' }}>
                                                        Rubric total: <strong>{total !== null ? `${total.toFixed(2)}/${maxPoints}` : `— /${maxPoints}`}</strong>
                                                    </span>
                                                    <Button type="button" size="sm" variant="outline"
                                                        onClick={() => { 
                                                            const t = computeRubricTotal(); 
                                                            if (t !== null) {
                                                                const finalVal = t.toFixed(2);
                                                                setGrade(finalVal);
                                                                if (submissionId) {
                                                                    markDraftField({ grade: finalVal });
                                                                }
                                                            }
                                                        }}>
                                                        Use as final grade
                                                    </Button>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* 4. Final grade */}
                            <div className="form-group">
                                <label className="form-label">Final Grade</label>
                                <input type="number" min="0" max={maxPoints} className="form-input"
                                    value={grade}
                                    onChange={e => { 
                                        const v = e.target.value; 
                                        const finalVal = parseFloat(v) > maxPoints ? maxPoints.toString() : v;
                                        setGrade(finalVal);
                                        if (submissionId) {
                                            markDraftField({ grade: finalVal });
                                        }
                                    }} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Feedback</label>
                                <textarea
                                    rows={4}
                                    className="form-textarea"
                                    value={feedback}
                                    onChange={e => {
                                        const v = e.target.value;
                                        setFeedback(v);
                                        if (submissionId) {
                                            markDraftField({ feedback: v });
                                        }
                                    }}
                                    placeholder="Add feedback for this submission..."
                                />
                            </div>

                            <div className="form-actions single" style={{ marginTop: '0.5rem' }}>
                                <Button
                                    onClick={handleSaveDraftOnly}
                                    variant="outline"
                                    style={{ width: '100%' }}
                                >
                                    Save Grade (Draft Only)
                                </Button>
                            </div>

                        </div>
                </div>
            </div>

            {/* Modals */}
            {showAttemptSelector && (
                <div className="modal-overlay" onClick={() => setShowAttemptSelector(false)}>
                    <div className="modal-content attempt-selector-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Select Attempt to Autograde</h3>
                            <button className="modal-close" onClick={() => setShowAttemptSelector(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="attempt-list">
                                {allSubmissions.map((sub, idx) => (
                                    <div key={sub.id} className="attempt-selection-item" onClick={() => handleAutograde(sub.id)}>
                                        <div className="attempt-info">
                                            <span className="attempt-number">Attempt {allSubmissions.length - idx}</span>
                                            <span className="attempt-date">{new Date(sub.submitted_at).toLocaleString()}</span>
                                        </div>
                                        <Button size="sm" variant="outline">Select & Run</Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {alertConfig.show && (
                <AlertModal type={alertConfig.type} title={alertConfig.title} message={alertConfig.message}
                    onClose={() => setAlertConfig({ ...alertConfig, show: false })} />
            )}

            {showFeedbackModal && (
                <div className="modal-overlay" onClick={() => setShowFeedbackModal(false)}>
                    <div className="modal-content feedback-modal" style={{ maxWidth: '600px', width: '90%' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Test Case Report Details</h3>
                            <button className="modal-close" onClick={() => setShowFeedbackModal(false)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', textTransform: 'uppercase' }}>Passed Test Cases</span>
                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--primary-text)' }}>
                                    {testSummary.passed !== null && testSummary.total !== null ? `${testSummary.passed}/${testSummary.total}` : '0/0'}
                                </div>
                            </div>
                            <div style={{ marginBottom: '16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px 14px' }}>
                                <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>
                                    Execution Summary
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary-text)' }}>
                                        Passed: {testSummary.passed !== null && testSummary.total !== null ? `${testSummary.passed}/${testSummary.total}` : '0/0'}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            padding: '4px 10px',
                                            borderRadius: '999px',
                                            border: '1px solid',
                                            borderColor: (testSummary.total !== null && testSummary.total > 0 && testSummary.passed === testSummary.total) ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)',
                                            background: (testSummary.total !== null && testSummary.total > 0 && testSummary.passed === testSummary.total) ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
                                            color: (testSummary.total !== null && testSummary.total > 0 && testSummary.passed === testSummary.total) ? '#15803d' : '#b91c1c'
                                        }}
                                    >
                                        Status: {(testSummary.total !== null && testSummary.total > 0 && testSummary.passed === testSummary.total) ? 'Passed' : 'Failed'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Full Test Case Report</span>
                                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px', maxHeight: '340px', overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: '13px', fontFamily: 'monospace', lineHeight: 1.45 }}>
                                    {submission?.auto_feedback || 'No test case report available yet.'}
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
                                <Button variant="ghost" onClick={() => setShowFeedbackModal(false)}>Cancel</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubmissionGrader;
