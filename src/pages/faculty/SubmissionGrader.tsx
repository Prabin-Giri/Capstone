import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getSubmission, getSubmissions, updateSubmission, getFileUrl, getAssignment, runAutograde, runCustomCode, runTests } from '../../lib/api';
import type { Submission, Assignment, RubricConfig, TestResult } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import AlertModal from '../../components/ui/AlertModal';
import { AssignmentEditor, type EditorFile } from '../../components/ui/AssignmentEditor';
import UserAvatar from '../../components/ui/UserAvatar';
import { CheckCircle, Clock, Search, Users, ClipboardList, X, PanelLeftClose, PanelRightClose, ArrowLeft, CalendarDays, Layers } from 'lucide-react';

import './SubmissionGrader.css';
import { showDialog } from '../../components/ui/Dialog';
import { getCommentChar, getLanguageFromFilename } from '../../lib/utils';

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

    // Anonymous grading — TA context detected from URL (same as basePath logic)
    const _isTA = basePath === '/ta';
    const [hideNames, setHideNames] = useState(false);

    // Mobile drawers
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
    const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

    // Sidebar states initialized from localStorage for persistence across student switches
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('grader_left_collapsed');
        return saved === null ? true : saved === 'true';
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

    // Called when user clicks a student — instantly paints UI with known data, fetches rest in background
    function switchToStudent(s: Submission) {
        // Immediately show new student's known data — no waiting
        setSubmission(s);
        setGrade(s.grade !== undefined && s.grade !== null ? Number(s.grade).toFixed(2) : '');
        setFeedback(s.feedback || '');
        setAllSubmissions([s]); // placeholder; full history loads below
        setActiveAttemptIndex(0);
        setIsWorkspaceOpen(false);
        setWorkspaceFiles([]);
        if (rubric) {
            const initialScores: Record<string, number | ''> = {};
            const items = rubric.sections ? rubric.sections.flatMap(sec => sec.items) : (rubric.criteria ?? []);
            items.forEach(c => { if (c.id) initialScores[c.id] = ''; });
            setRubricScores(initialScores);
        }
        setSwitching(true);
        navigate(`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading/${s.id}`);
    }

    async function loadData() {
        if (!submissionId || !assignmentId) return;

        const isFirstLoad = !assignment;
        if (isFirstLoad) setLoading(true);
        // On switch, switching flag is already set by switchToStudent — just fetch missing pieces

        try {
            const knownStudent = allStudentSubmissions.find(s => s.id === parseInt(submissionId));

            const [subData, assignData, historyData] = await Promise.all([
                // On switch we already have basic data — still fetch full record for auto_grade etc.
                getSubmission(parseInt(submissionId)),
                assignment ? Promise.resolve(assignment) : getAssignment(assignmentId),
                knownStudent
                    ? getSubmissions({ assignment_id: assignmentId, student_id: knownStudent.student_id })
                    : Promise.resolve([] as typeof allSubmissions),
            ]);

            const resolvedHistory = historyData.length > 0
                ? historyData
                : await getSubmissions({ assignment_id: assignmentId, student_id: subData.student_id });

            setSubmission(subData);
            setAssignment(assignData);
            setHideNames(_isTA && !!assignData.hide_student_names);
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
                    console.warn('Failed to parse rubric_config', e);
                }
            }
            setAllSubmissions(resolvedHistory);
            const selectedIdx = resolvedHistory.findIndex(h => h.id === subData.id);
            setActiveAttemptIndex(selectedIdx >= 0 ? selectedIdx : 0);
            setGrade(subData.grade !== undefined && subData.grade !== null ? Number(subData.grade).toFixed(2) : '');
            setFeedback(subData.feedback || '');
            setTestSummary(parseTestSummary(subData.auto_feedback || subData.feedback));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setSwitching(false);
        }
    }

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

    async function loadAttemptWorkspace(files: { name: string; path: string }[], preferredPath?: string) {
        setIsPreviewLoading(true);
        try {
            const ordered = preferredPath
                ? [...files].sort((a, b) => (a.path === preferredPath ? -1 : b.path === preferredPath ? 1 : 0))
                : files;
            const loaded = await Promise.all(ordered.map(async (f, idx) => {
                const url = getFileUrl(f.path);
                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error();
                    const content = await res.text();
                    return {
                        id: `${f.path}-${idx}`,
                        name: f.name,
                        content,
                        language: getLanguageFromFilename(f.name, assignment?.language || 'python'),
                    } as EditorFile;
                } catch {
                    return {
                        id: `${f.path}-${idx}`,
                        name: f.name,
                        content: 'Unable to render this file in editor preview. Please use Download.',
                        language: getLanguageFromFilename(f.name, assignment?.language || 'python'),
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

    async function handleRunCustomInput(files: EditorFile[], stdin: string) {
        if (!assignment) return { stdout: '', stderr: 'Assignment not found', exitCode: 1, timedOut: false };
        setIsRunningCustom(true);
        try {
            const primaryFile = files[0];
            const detectedLang = assignment.language || (primaryFile ? getLanguageFromFilename(primaryFile.name) : 'python');
            const comment = getCommentChar(detectedLang);
            const codeToRun = files.length === 1 ? files[0].content : files.map(f => `${comment} File: ${f.name}\n${f.content}`).join('\n\n');
            const data = await runCustomCode(assignment.id, codeToRun, detectedLang, stdin);
            return data;
        } catch (err) {
            throw new Error(`Failed to execute code: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsRunningCustom(false);
        }
    }

    async function handleRunTests(files: EditorFile[]) {
        if (!assignment) throw new Error('No assignment loaded');
        setIsRunningCustom(true);
        try {
            const primaryFile = files[0];
            const detectedLang = assignment.language || (primaryFile ? getLanguageFromFilename(primaryFile.name) : 'python');
            const comment = getCommentChar(detectedLang);
            const codeToRun = files.length === 1 ? files[0].content : files.map(f => `${comment} File: ${f.name}\n${f.content}`).join('\n\n');
            const data = await runTests(assignment.id, codeToRun, detectedLang);
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
            return { results: data.results, log: `Language: ${detectedLang} · ${codeToRun.length} bytes` };
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
        if (!submissionId) return;
        const maxPoints = assignment?.points || 100;
        let enteredGrade = grade ? parseFloat(grade) : undefined;
        if ((enteredGrade === undefined || isNaN(enteredGrade)) && rubric) {
            const rubricTotal = computeRubricTotal();
            if (rubricTotal !== null) { enteredGrade = rubricTotal; setGrade(rubricTotal.toFixed(2)); }
        }
        if (enteredGrade !== undefined && enteredGrade > maxPoints) {
            await showDialog({ title: 'Invalid Grade', message: `Grade cannot exceed ${maxPoints}.`, confirmText: 'OK' });
            return;
        }
        try {
            await updateSubmission(parseInt(submissionId), { grade: enteredGrade, feedback, status: 'graded' });
            navigate(`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading`);
        } catch (err) {
            console.error(err);
            setAlertConfig({ show: true, type: 'error', title: 'Error', message: 'Failed to save grade.' });
        }
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

    const currentStudentIndex = allStudentSubmissions.findIndex(s => s.id === parseInt(submissionId || '0'));
    const prevStudent = currentStudentIndex > 0 ? allStudentSubmissions[currentStudentIndex - 1] : null;
    const nextStudent = currentStudentIndex < allStudentSubmissions.length - 1 ? allStudentSubmissions[currentStudentIndex + 1] : null;

    if (loading) return <div className="grader-container"><div className="grader-loading">Loading...</div></div>;
    if (!submission || !assignment) return <div className="grader-container"><div className="grader-loading">Submission not found</div></div>;

    const maxPoints = assignment.points || 100;
    const activeAttempt = allSubmissions[activeAttemptIndex] || submission;
    const activeAttemptFiles = activeAttempt.files || [{ name: activeAttempt.file_name, path: activeAttempt.file_path }];
    const attemptPrimaryFile = activeAttemptFiles[0];
    const canGoPrevAttempt = activeAttemptIndex > 0;
    const canGoNextAttempt = activeAttemptIndex < allSubmissions.length - 1;
    const studentDisplayName = hideNames ? anonLabel(submission.student_id) : (submission.student_name || 'Student');
    const isSubmissionGraded = submission.status === 'graded';
    const showDrawerBackdrop = isNarrowLayout && (leftDrawerOpen || rightDrawerOpen);

    const handleStudentsButton = () => {
        if (isNarrowLayout) {
            setLeftDrawerOpen(true);
            setRightDrawerOpen(false);
            return;
        }
        toggleLeftSidebar(!isLeftSidebarCollapsed);
    };

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
                        <button className="sidebar-header-count">{allStudentSubmissions.length}</button>
                        <button className="sidebar-toggle-btn desktop-only" onClick={() => toggleLeftSidebar(true)} title="Collapse Student List"><PanelLeftClose size={16} /></button>
                        <button className="drawer-close-btn" onClick={() => setLeftDrawerOpen(false)}><X size={15} /></button>
                    </div>
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

                <div className="student-list">
                    {filteredStudents.length === 0 && (
                        <div className="student-list-empty">No students found</div>
                    )}
                    {filteredStudents.map(s => {
                        const isActive = s.id === parseInt(submissionId || '0');
                        const isGraded = s.grade !== null && s.grade !== undefined;
                        const displayName = hideNames ? anonLabel(s.student_id) : s.student_name;
                        return (
                            <div
                                key={s.id}
                                className={`student-list-item ${isActive ? 'active' : ''}`}
                                onClick={() => { setLeftDrawerOpen(false); switchToStudent(s); }}
                            >
                                <UserAvatar
                                    user={hideNames ? { name: displayName } : { name: s.student_name, profilePicture: s.student_profile_picture }}
                                    size={34}
                                />
                                <div className="student-list-info">
                                    <span className="student-list-name">{displayName}</span>
                                </div>
                                <div className={`student-grade-badge ${isGraded ? 'graded' : 'pending'}`}>
                                    {isGraded
                                        ? <><CheckCircle size={11} />{Number(s.grade).toFixed(0)}/{maxPoints}</>
                                        : <><Clock size={11} />Pending</>
                                    }
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="sidebar-resize-handle-v" onMouseDown={() => setIsResizingLeft(true)} />
            </div>

            {/* ── MIDDLE: Submission + Preview ─────────────── */}
            <div className={`grader-panel-middle${switching ? ' switching' : ''}`}>
                <div className="grader-top-actions desktop-only">
                    <Button variant="outline" size="sm" className="grader-action-btn student-list-corner-btn" onClick={handleStudentsButton} title="Student list">
                        <Users size={14} />
                    </Button>
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
                            <button
                                className="grader-back-btn"
                                onClick={() => navigate(`${basePath}/courses/${courseId}/assignments/${assignmentId}/grading`)}
                                title="Back to grading list"
                            >
                                <ArrowLeft size={15} />
                            </button>
                            <h2 className="grader-title">{studentDisplayName}</h2>
                            {isSubmissionGraded && <span className="graded-by-pill">Graded</span>}
                            <div className="student-nav-btns right-end">
                                <button
                                    className="student-nav-btn"
                                    disabled={!prevStudent}
                                    onClick={() => prevStudent && switchToStudent(prevStudent)}
                                    title={prevStudent ? `Previous: ${prevStudent.student_name}` : 'No previous student'}
                                >&#8249;</button>
                                <span className="student-nav-counter">{currentStudentIndex + 1} / {allStudentSubmissions.length}</span>
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
                                Attempt {allSubmissions.length - activeAttemptIndex}
                                <span className="attempt-date-inline">
                                    <CalendarDays size={12} />
                                    {new Date(activeAttempt.submitted_at).toLocaleString()}
                                </span>
                            </div>
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
                                            void loadAttemptWorkspace(activeAttemptFiles, attemptPrimaryFile.path);
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
                                    onClick={() => attemptPrimaryFile && handleDownload(getFileUrl(attemptPrimaryFile.path), attemptPrimaryFile.name)}
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

                <div className="preview-area">
                    {isPreviewLoading ? (
                        <div className="preview-placeholder"><div className="loading-spinner" />Loading preview...</div>
                    ) : isWorkspaceOpen && workspaceFiles.length > 0 ? (
                        <div className="code-preview-container">
                            <AssignmentEditor
                                initialFiles={workspaceFiles}
                                language={assignment.language || 'python'}
                                theme="light"
                                isRunning={isRunningCustom}
                                points={0}
                                onRunTests={handleRunTests}
                                onRunCustomInput={handleRunCustomInput}
                                readOnly={true}
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
                                                                                if (raw === '') { setRubricScores(prev => ({ ...prev, [crit.id!]: '' })); return; }
                                                                                const num = Number(raw);
                                                                                setRubricScores(prev => ({ ...prev, [crit.id!]: crit.maxPoints != null ? Math.min(num, crit.maxPoints) : num }));
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
                                                                        if (raw === '') { setRubricScores(prev => ({ ...prev, [crit.id!]: '' })); return; }
                                                                        const num = Number(raw);
                                                                        setRubricScores(prev => ({ ...prev, [crit.id!]: crit.maxPoints != null ? Math.min(num, crit.maxPoints) : num }));
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
                                                        onClick={() => { const t = computeRubricTotal(); if (t !== null) setGrade(t.toString()); }}>
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
                                    onChange={e => { const v = e.target.value; setGrade(parseFloat(v) > maxPoints ? maxPoints.toString() : v); }} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Feedback</label>
                                <textarea
                                    rows={4}
                                    className="form-textarea"
                                    value={feedback}
                                    onChange={e => setFeedback(e.target.value)}
                                    placeholder="Add feedback for this submission..."
                                />
                            </div>

                            <div className="form-actions single">
                                <Button onClick={handleSave}>Save Final Grade</Button>
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
