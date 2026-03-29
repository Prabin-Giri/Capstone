import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getSubmission, getSubmissions, updateSubmission, getFileUrl, getAssignment, runAutograde, runCustomCode, runTests } from '../../lib/api';
import type { Submission, Assignment, RubricConfig } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import AlertModal from '../../components/ui/AlertModal';
import { AssignmentEditor, type EditorFile } from '../../components/ui/AssignmentEditor';
import UserAvatar from '../../components/ui/UserAvatar';
import { CheckCircle, Clock, Search, Users, ClipboardList, X, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';

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
    const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
    const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
    const [codeContent, setCodeContent] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewFileName, setPreviewFileName] = useState<string | null>(null);
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

    // Anonymous grading — TA context detected from URL (same as basePath logic)
    const _isTA = basePath === '/ta';
    const [hideNames, setHideNames] = useState(false);

    // Mobile drawers
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
    const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

    // Sidebar states initialized from localStorage for persistence across student switches
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(() => {
        return localStorage.getItem('grader_left_collapsed') === 'true';
    });
    const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(() => {
        return localStorage.getItem('grader_right_collapsed') === 'true';
    });

    // Sidebar widths — initialized from localStorage
    const LEFT_MIN = 240;
    const RIGHT_MIN = 300;
    const [leftWidth, setLeftWidth] = useState(() => {
        const saved = localStorage.getItem('grader_left_width');
        return saved ? parseInt(saved) : LEFT_MIN;
    });
    const [rightWidth, setRightWidth] = useState(() => {
        const saved = localStorage.getItem('grader_right_width');
        return saved ? parseInt(saved) : RIGHT_MIN;
    });

    const [isResizingLeft, setIsResizingLeft] = useState(false);
    const [isResizingRight, setIsResizingRight] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Persistence helpers
    const toggleLeftSidebar = (val: boolean) => {
        setIsLeftSidebarCollapsed(val);
        localStorage.setItem('grader_left_collapsed', String(val));
    };

    const toggleRightSidebar = (val: boolean) => {
        setIsRightSidebarCollapsed(val);
        localStorage.setItem('grader_right_collapsed', String(val));
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

    // Left sidebar resize (expand only — min = LEFT_MIN)
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizingLeft || !containerRef.current) return;
            const left = containerRef.current.getBoundingClientRect().left;
            setLeftWidth(Math.max(LEFT_MIN, Math.min(e.clientX - left, 520)));
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
            setRightWidth(Math.max(RIGHT_MIN, Math.min(right - e.clientX, 580)));
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
        setPreviewFileUrl(null);
        setPreviewFileName(null);
        setCodeContent(null);
        setPreviewBlobUrl(null);
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
            setGrade(subData.grade !== undefined && subData.grade !== null ? Number(subData.grade).toFixed(2) : '');
            setFeedback(subData.feedback || '');
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setSwitching(false);
        }
    }

    useEffect(() => {
        // Revoke any previous blob URL to avoid memory leaks
        if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
        setPreviewBlobUrl(null);

        if (previewFileUrl && previewFileName) {
            const isCodeFile = /\.(py|java|cpp|c|h|cs|js|ts|tsx|jsx|css|html|txt|json|md|sql)$/i.test(previewFileName);
            if (isCodeFile) fetchCodeContent(previewFileUrl);
            else fetchBlobPreview(previewFileUrl);
        } else {
            setCodeContent(null);
        }
    }, [previewFileUrl, previewFileName]);

    async function fetchCodeContent(url: string) {
        setIsPreviewLoading(true);
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error();
            setCodeContent(await res.text());
        } catch {
            setCodeContent('Error loading file content.');
        } finally {
            setIsPreviewLoading(false);
        }
    }

    async function fetchBlobPreview(url: string) {
        setIsPreviewLoading(true);
        setCodeContent(null);
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            // Force inline MIME so browser renders it instead of downloading
            const inlineMime = blob.type === 'application/octet-stream' ? 'application/pdf' : blob.type;
            const blobUrl = URL.createObjectURL(new Blob([blob], { type: inlineMime }));
            setPreviewBlobUrl(blobUrl);
        } catch {
            setCodeContent('Error loading file preview.');
        } finally {
            setIsPreviewLoading(false);
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

    async function handleAutograde(id?: number, dryRun = false) {
        const targetId = id || submission?.id;
        if (!targetId) return;
        setIsAutograding(true);
        if (!dryRun) setShowAttemptSelector(false);
        try {
            const updatedSub = await runAutograde(targetId, dryRun);
            if (dryRun) {
                setSubmission(prev => prev ? { ...prev, auto_grade: updatedSub.grade, auto_feedback: updatedSub.feedback } : null);
                setAlertConfig({ show: true, type: 'info', title: 'Autograde Preview', message: 'Suggested results are ready. Review them and apply if desired.' });
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
            setIsRunningCustom(false);
            return data;
        } catch (err) {
            setIsRunningCustom(false);
            throw new Error(`Failed to execute code: ${err instanceof Error ? err.message : String(err)}`);
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
            setIsRunningCustom(false);
            return { results: data.results, log: `Language: ${detectedLang} · ${codeToRun.length} bytes` };
        } catch (err) {
            setIsRunningCustom(false);
            throw new Error(`Failed to run tests: ${err instanceof Error ? err.message : String(err)}`);
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

    return (
        <div className="grader-container" ref={containerRef}>

            {/* Mobile drawer backdrops */}
            {(leftDrawerOpen || rightDrawerOpen) && (
                <div
                    className="drawer-backdrop"
                    onClick={() => { setLeftDrawerOpen(false); setRightDrawerOpen(false); }}
                />
            )}

            {/* ── LEFT SIDEBAR: Student List ───────────────── */}
            <div className={`grader-sidebar grader-sidebar-left${leftDrawerOpen ? ' drawer-open' : ''}${isLeftSidebarCollapsed ? ' collapsed' : ''}`} style={{ width: isLeftSidebarCollapsed ? 0 : leftWidth }}>
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
                                    {!hideNames && <span className="student-list-id">{s.student_id}</span>}
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
                    {isLeftSidebarCollapsed && (
                        <button 
                            className="sidebar-expand-btn desktop-only left" 
                            onClick={() => toggleLeftSidebar(false)}
                            title="Expand Student List"
                        >
                            <PanelLeftOpen size={20} />
                            <span className="expand-btn-text">View Student List</span>
                        </button>
                    )}
                    <UserAvatar
                        user={hideNames ? { name: anonLabel(submission.student_id) } : { name: submission.student_name, profilePicture: submission.student_profile_picture }}
                        size={52}
                        className="grader-student-avatar"
                    />
                    <div className="grader-header-content">
                        <div className="grader-title-row">
                            <h2 className="grader-title">{hideNames ? anonLabel(submission.student_id) : submission.student_name}</h2>
                            <div className="student-nav-btns">
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
                            {isRightSidebarCollapsed && (
                                <button 
                                    className="sidebar-expand-btn desktop-only right" 
                                    onClick={() => toggleRightSidebar(false)}
                                    title="Expand Grading Summary"
                                >
                                    <PanelRightOpen size={20} />
                                    <span className="expand-btn-text">View Grading</span>
                                </button>
                            )}
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
                    </div>
                </div>

                {/* Submission artifacts */}
                <div className="submissions-section">
                    {allSubmissions.map((sub, idx) => (
                        <div key={sub.id} className="submission-attempt-group">
                            <div className="attempt-label">
                                Attempt {allSubmissions.length - idx}
                                <span className="attempt-date-inline">{new Date(sub.submitted_at).toLocaleString()}</span>
                            </div>
                            {(sub.files || [{ name: sub.file_name, path: sub.file_path }]).map((f, i) => {
                                const url = getFileUrl(f.path);
                                const isPreviewing = previewFileUrl === url;
                                return (
                                    <div key={i} className="file-box">
                                        <span className="file-name">{f.name}</span>
                                        <div className="file-actions">
                                            <Button variant="outline" className="btn-pill" size="sm"
                                                onClick={() => {
                                                    if (isPreviewing) { setPreviewFileUrl(null); setPreviewFileName(null); }
                                                    else { setPreviewFileUrl(url); setPreviewFileName(f.name); }
                                                }}>
                                                {isPreviewing ? 'Hide Preview' : 'Preview'}
                                            </Button>
                                            <Button variant="primary" className="btn-pill" size="sm" onClick={() => handleDownload(url, f.name)}>
                                                Download
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Preview area */}
                <div className="preview-area">
                    {isPreviewLoading ? (
                        <div className="preview-placeholder"><div className="loading-spinner" />Loading preview...</div>
                    ) : codeContent !== null && previewFileName ? (
                        <div className="code-preview-container">
                            <AssignmentEditor
                                initialFiles={[{ id: 'preview', name: previewFileName, content: codeContent, language: getLanguageFromFilename(previewFileName, assignment.language || 'python') }]}
                                language={assignment.language || 'python'}
                                theme="light"
                                isRunning={isRunningCustom}
                                points={0}
                                onRunTests={handleRunTests}
                                onRunCustomInput={handleRunCustomInput}
                                readOnly={true}
                            />
                        </div>
                    ) : previewBlobUrl ? (
                        <iframe src={previewBlobUrl} className="preview-frame" title="File Preview" />
                    ) : (
                        <div className="preview-placeholder">Select a file above to preview.</div>
                    )}
                </div>
            </div>

            {/* ── RIGHT SIDEBAR: Grading ────────────────────── */}
            <div className={`grader-sidebar grader-sidebar-right${rightDrawerOpen ? ' drawer-open' : ''}${isRightSidebarCollapsed ? ' collapsed' : ''}${switching ? ' switching' : ''}`} style={{ width: isRightSidebarCollapsed ? 0 : rightWidth }}>
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
                            {/* 1. Autograde action */}
                            <div>
                                <Button variant="primary" size="lg" style={{ width: '100%', marginBottom: '6px' }} onClick={() => handleAutograde(undefined, true)}>
                                    Autograde
                                </Button>
                                <p style={{ fontSize: '11px', color: '#6b7280', textAlign: 'center' }}>Automatically calculate grade based on test cases.</p>
                            </div>

                            {/* 2. Autograde result (shown after running) */}
                            {submission?.auto_grade !== undefined && submission?.auto_grade !== null && (
                                <div className="autograde-result-box">
                                    <div>
                                        <span className="autograde-label">Autograde Result</span>
                                        <div className="autograde-score">{Number(submission.auto_grade).toFixed(2)} / {maxPoints.toFixed(2)}</div>
                                    </div>
                                    <Button size="sm" style={{ backgroundColor: 'var(--primary-color)', color: 'white' }} onClick={() => setShowFeedbackModal(true)}>
                                        View Feedback
                                    </Button>
                                </div>
                            )}

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
                                <textarea rows={6} className="form-textarea" value={feedback}
                                    onChange={e => setFeedback(e.target.value)} placeholder="Enter detailed feedback here..." />
                            </div>

                            <div className="form-actions">
                                <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
                                <Button onClick={handleSave}>Save & Return</Button>
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
                            <h3 className="modal-title">Autograde Result Feedback</h3>
                            <button className="modal-close" onClick={() => setShowFeedbackModal(false)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            <div style={{ marginBottom: '16px' }}>
                                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', textTransform: 'uppercase' }}>Suggested Score</span>
                                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--primary-text)' }}>
                                    {Number(submission?.auto_grade).toFixed(2)} / {maxPoints.toFixed(2)}
                                </div>
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Detailed Feedback</span>
                                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '14px', maxHeight: '280px', overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: '13px', fontFamily: 'monospace' }}>
                                    {submission?.auto_feedback || 'No feedback available.'}
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
                                <Button variant="ghost" onClick={() => setShowFeedbackModal(false)}>Cancel</Button>
                                <Button style={{ backgroundColor: 'var(--primary-color)', color: 'white' }} onClick={() => { if (submission?.auto_feedback) setFeedback(submission.auto_feedback); setShowFeedbackModal(false); }}>Use Feedback</Button>
                                <Button style={{ backgroundColor: 'var(--primary-color)', color: 'white' }} onClick={() => { if (submission?.auto_grade != null) setGrade(Number(submission.auto_grade).toFixed(2)); setShowFeedbackModal(false); }}>Use Score</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubmissionGrader;
