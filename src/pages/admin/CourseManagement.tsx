import React, { useCallback, useEffect, useState } from 'react';
import {
    getAdminCoursesPage,
    getAdminCourseDetail,
    getCourseGradesExportUrl,
    getAdminUsers,
    adminCourseEnrollStudent,
    adminCourseEnrollCsv,
    type AdminCourseRow,
    type AdminCourseDetail,
    type AdminUser,
} from '../../lib/api';
import { Eye, X, UserPlus, Upload } from 'lucide-react';
import './CourseManagement.css';

const PAGE_SIZE = 15;

function formatDate(iso?: string | null): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
        return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch {
        return '—';
    }
}

function formatDateTime(iso?: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        return '—';
    }
}

function termYear(term: string): string {
    const m = (term || '').match(/\b(19|20)\d{2}\b/);
    return m ? m[0] : '—';
}

function facultyLabel(c: AdminCourseRow): string {
    return c.instructor_name?.trim() || c.instructor_id || '—';
}

function parseEnrollCsv(text: string): { id: string; name: string; email: string }[] {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const parseLine = (line: string): string[] => {
        const out: string[] = [];
        let cur = '';
        let q = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') q = !q;
            else if ((c === ',' || c === ';') && !q) {
                out.push(cur.trim());
                cur = '';
            } else cur += c;
        }
        out.push(cur.trim());
        return out.map((s) => s.replace(/^"|"$/g, ''));
    };
    const first = parseLine(lines[0]).map((c) => c.toLowerCase().replace(/\s/g, ''));
    const hasHeader = first.includes('student_id') || first.includes('id') || first.includes('email');
    let idIdx = 0;
    let nameIdx = 1;
    let emailIdx = 2;
    let start = 0;
    if (hasHeader) {
        const raw = parseLine(lines[0]).map((c) => c.toLowerCase().trim());
        idIdx = raw.findIndex((x) => ['student_id', 'id', 'studentid'].includes(x.replace(/\s/g, '')));
        nameIdx = raw.findIndex((x) => x === 'name');
        emailIdx = raw.findIndex((x) => x === 'email' || x === 'e-mail');
        if (idIdx < 0) idIdx = 0;
        if (nameIdx < 0) nameIdx = 1;
        if (emailIdx < 0) emailIdx = 2;
        start = 1;
    }
    const rows: { id: string; name: string; email: string }[] = [];
    for (let i = start; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        const id = (cols[idIdx] ?? '').trim();
        const name = (cols[nameIdx] ?? '').trim();
        const email = (cols[emailIdx] ?? '').trim();
        if (!id && !email) continue;
        rows.push({ id, name, email });
    }
    return rows;
}

const CourseManagement: React.FC = () => {
    const [courses, setCourses] = useState<AdminCourseRow[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [detailOpenId, setDetailOpenId] = useState<string | null>(null);
    const [detail, setDetail] = useState<AdminCourseDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
    const [cmEnrollTab, setCmEnrollTab] = useState<'manual' | 'csv'>('manual');
    const [cmPickStudentId, setCmPickStudentId] = useState('');
    const [cmCsvText, setCmCsvText] = useState('');
    const [cmEnrollBusy, setCmEnrollBusy] = useState(false);
    const [cmEnrollMsg, setCmEnrollMsg] = useState<string | null>(null);

    const loadPage = useCallback(async (p: number) => {
        setError(null);
        setLoading(true);
        try {
            const res = await getAdminCoursesPage(p, PAGE_SIZE);
            setCourses(res.courses);
            setTotal(res.total);
            setTotalPages(res.totalPages);
            setPage(res.page);
        } catch (e: unknown) {
            setCourses([]);
            setTotal(0);
            setTotalPages(0);
            setError(e instanceof Error ? e.message : 'Could not load courses.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadPage(1);
    }, [loadPage]);

    const openDetail = async (courseId: string) => {
        setDetailOpenId(courseId);
        setDetail(null);
        setDetailLoading(true);
        setCmEnrollMsg(null);
        setCmPickStudentId('');
        setCmCsvText('');
        try {
            const [d, users] = await Promise.all([getAdminCourseDetail(courseId), getAdminUsers()]);
            setDetail(d);
            setAdminUsers(Array.isArray(users) ? users : []);
        } catch {
            setDetail(null);
            setAdminUsers([]);
        } finally {
            setDetailLoading(false);
        }
    };

    const closeDetail = () => {
        setDetailOpenId(null);
        setDetail(null);
        setDetailLoading(false);
        setAdminUsers([]);
        setCmEnrollMsg(null);
    };

    const studentPickList = adminUsers.filter((u) => u.role === 'student' || u.role === 'ta');

    const submitCmManualEnroll = async () => {
        if (!detail?.course?.id || !cmPickStudentId) return;
        setCmEnrollBusy(true);
        setCmEnrollMsg(null);
        try {
            await adminCourseEnrollStudent(detail.course.id, cmPickStudentId);
            setCmEnrollMsg('Student enrolled.');
            const d = await getAdminCourseDetail(detail.course.id);
            setDetail(d);
            setCmPickStudentId('');
        } catch (e: unknown) {
            setCmEnrollMsg(e instanceof Error ? e.message : 'Enroll failed');
        } finally {
            setCmEnrollBusy(false);
        }
    };

    const submitCmCsvEnroll = async () => {
        if (!detail?.course?.id) return;
        const rows = parseEnrollCsv(cmCsvText);
        if (rows.length === 0) {
            setCmEnrollMsg('Add CSV rows: student_id, name, email (or id, name, email).');
            return;
        }
        setCmEnrollBusy(true);
        setCmEnrollMsg(null);
        try {
            const res = await adminCourseEnrollCsv(detail.course.id, rows);
            setCmEnrollMsg(
                `Enrolled ${res.enrolled.length}; already enrolled ${res.alreadyEnrolled?.length ?? 0}.`
            );
            const d = await getAdminCourseDetail(detail.course.id);
            setDetail(d);
            setCmCsvText('');
        } catch (e: unknown) {
            setCmEnrollMsg(e instanceof Error ? e.message : 'CSV enroll failed');
        } finally {
            setCmEnrollBusy(false);
        }
    };

    const goPrev = () => {
        if (page <= 1) return;
        void loadPage(page - 1);
    };

    const goNext = () => {
        if (page >= totalPages) return;
        void loadPage(page + 1);
    };

    return (
        <div className="cm-page">
            <div className="cm-inner">
                {error && <div className="cm-error">{error}</div>}

                <div className="cm-table-wrap cm-table-wrap--scroll">
                    {loading ? (
                        <div className="cm-empty">Loading courses…</div>
                    ) : (
                        <table className="cm-table">
                            <thead>
                                <tr>
                                    <th>Course</th>
                                    <th>Course ID</th>
                                    <th title="When the course record was created">Started</th>
                                    <th title="Latest assignment due date in this course">End date</th>
                                    <th>Year</th>
                                    <th>Term</th>
                                    <th>Faculty</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {courses.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="cm-empty">
                                            No courses found.
                                        </td>
                                    </tr>
                                ) : (
                                    courses.map((c) => (
                                        <tr key={c.id}>
                                            <td className="cm-course-name">{c.name}</td>
                                            <td className="cm-mono">{c.id}</td>
                                            <td>{formatDate(c.created_at)}</td>
                                            <td>{formatDate(c.last_assignment_due)}</td>
                                            <td>{termYear(c.term || '')}</td>
                                            <td>{c.term || '—'}</td>
                                            <td>{facultyLabel(c)}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="cm-btn cm-btn--primary"
                                                    onClick={() => void openDetail(c.id)}
                                                >
                                                    <Eye size={16} aria-hidden /> View
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {!loading && total > 0 && (
                    <div className="cm-pagination">
                        <button type="button" className="cm-btn" disabled={page <= 1} onClick={goPrev}>
                            Previous
                        </button>
                        <span>
                            Page {page} of {Math.max(1, totalPages)} ({total} course{total === 1 ? '' : 's'})
                        </span>
                        <button
                            type="button"
                            className="cm-btn"
                            disabled={page >= totalPages || totalPages === 0}
                            onClick={goNext}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {detailOpenId !== null && (
                <div
                    className="cm-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="cm-detail-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeDetail();
                    }}
                >
                    <div className="cm-modal" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="cm-modal-header">
                            <div>
                                <h2 id="cm-detail-title">{detail?.course.name ?? 'Course details'}</h2>
                                {detail?.course && (
                                    <p className="cm-mono" style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
                                        {detail.course.id}
                                    </p>
                                )}
                            </div>
                            <button type="button" className="cm-modal-close" onClick={closeDetail} aria-label="Close">
                                <X size={22} />
                            </button>
                        </div>
                        <div className="cm-modal-body">
                            {detailLoading ? (
                                <div className="cm-empty">Loading…</div>
                            ) : detail ? (
                                <>
                                    <div className="cm-meta">
                                        <div>
                                            <strong>Term:</strong> {detail.course.term || '—'} ·{' '}
                                            <strong>Year:</strong> {termYear(detail.course.term || '')}
                                        </div>
                                        <div>
                                            <strong>Faculty:</strong> {facultyLabel(detail.course)}
                                            {detail.course.instructor_email ? (
                                                <> · {detail.course.instructor_email}</>
                                            ) : null}
                                        </div>
                                        <div>
                                            <strong>Status:</strong>{' '}
                                            {detail.course.is_archived ? 'Archived' : 'Active'} ·{' '}
                                            <strong>Record created:</strong> {formatDateTime(detail.course.created_at)} ·{' '}
                                            <strong>Updated:</strong> {formatDateTime(detail.course.updated_at)}
                                        </div>
                                    </div>

                                    <div className="cm-stat-grid">
                                        <div className="cm-stat">
                                            <span>Enrolled</span>
                                            <strong>{detail.stats.enrollment_count}</strong>
                                        </div>
                                        <div className="cm-stat">
                                            <span>Assignments</span>
                                            <strong>{detail.stats.assignment_count}</strong>
                                        </div>
                                        <div className="cm-stat">
                                            <span>Active asg.</span>
                                            <strong>{detail.stats.active_assignments}</strong>
                                        </div>
                                        <div className="cm-stat">
                                            <span>Submissions</span>
                                            <strong>{detail.stats.submission_count}</strong>
                                        </div>
                                        <div className="cm-stat">
                                            <span>TAs</span>
                                            <strong>{detail.stats.ta_count}</strong>
                                        </div>
                                    </div>

                                    <h3 className="cm-section-title">Enrolled students ({detail.students.length})</h3>
                                    {detail.students.length === 0 ? (
                                        <p className="cm-meta">No enrollments.</p>
                                    ) : (
                                        <table className="cm-subtable">
                                            <thead>
                                                <tr>
                                                    <th>Name</th>
                                                    <th>Email</th>
                                                    <th>Enrolled</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.students.map((s) => (
                                                    <tr key={s.id}>
                                                        <td>{s.name}</td>
                                                        <td>{s.email}</td>
                                                        <td>{formatDateTime(s.enrolled_at)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    <h3 className="cm-section-title">Add students (admin)</h3>
                                    <p className="cm-meta">
                                        Enroll existing accounts or import a CSV (creates missing student accounts with default password{' '}
                                        <code>password123</code>, same as faculty bulk enroll).
                                    </p>
                                    {cmEnrollMsg && (
                                        <p className="cm-meta" style={{ color: cmEnrollMsg.includes('failed') ? '#b91c1c' : '#047857' }}>
                                            {cmEnrollMsg}
                                        </p>
                                    )}
                                    <div className="cm-enroll-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                        <button
                                            type="button"
                                            className={`cm-btn ${cmEnrollTab === 'manual' ? 'cm-btn--primary' : ''}`}
                                            onClick={() => setCmEnrollTab('manual')}
                                        >
                                            <UserPlus size={14} aria-hidden /> Manual
                                        </button>
                                        <button
                                            type="button"
                                            className={`cm-btn ${cmEnrollTab === 'csv' ? 'cm-btn--primary' : ''}`}
                                            onClick={() => setCmEnrollTab('csv')}
                                        >
                                            <Upload size={14} aria-hidden /> CSV
                                        </button>
                                    </div>
                                    {cmEnrollTab === 'manual' ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                                            <select
                                                className="cm-select-like"
                                                style={{ minWidth: 220, padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e5e7eb' }}
                                                value={cmPickStudentId}
                                                onChange={(e) => setCmPickStudentId(e.target.value)}
                                                aria-label="Select student"
                                            >
                                                <option value="">Select student…</option>
                                                {studentPickList.map((u) => (
                                                    <option key={u.id} value={u.id}>
                                                        {u.name} ({u.email})
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                className="cm-btn cm-btn--primary"
                                                disabled={cmEnrollBusy || !cmPickStudentId}
                                                onClick={() => void submitCmManualEnroll()}
                                            >
                                                Enroll
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <textarea
                                                className="cm-textarea-like"
                                                style={{
                                                    width: '100%',
                                                    minHeight: 100,
                                                    padding: '0.5rem',
                                                    borderRadius: 8,
                                                    border: '1px solid #e5e7eb',
                                                    fontFamily: 'monospace',
                                                    fontSize: 12,
                                                }}
                                                placeholder={`student_id,name,email\n1001,Jane Doe,jane@school.edu`}
                                                value={cmCsvText}
                                                onChange={(e) => setCmCsvText(e.target.value)}
                                            />
                                            <button
                                                type="button"
                                                className="cm-btn cm-btn--primary"
                                                style={{ marginTop: '0.5rem' }}
                                                disabled={cmEnrollBusy}
                                                onClick={() => void submitCmCsvEnroll()}
                                            >
                                                {cmEnrollBusy ? 'Working…' : 'Run CSV enroll'}
                                            </button>
                                        </div>
                                    )}

                                    <h3 className="cm-section-title">Assignments ({detail.assignments.length})</h3>
                                    {detail.assignments.length === 0 ? (
                                        <p className="cm-meta">No assignments.</p>
                                    ) : (
                                        <table className="cm-subtable">
                                            <thead>
                                                <tr>
                                                    <th>Title</th>
                                                    <th>Due</th>
                                                    <th>Status</th>
                                                    <th>Points</th>
                                                    <th>Submissions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.assignments.map((a) => (
                                                    <tr key={a.id}>
                                                        <td>{a.title}</td>
                                                        <td>{formatDateTime(a.due_date)}</td>
                                                        <td>{a.status}</td>
                                                        <td>{a.points ?? '—'}</td>
                                                        <td>{a.submissions_count}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    <h3 className="cm-section-title">Teaching assistants ({detail.tas.length})</h3>
                                    {detail.tas.length === 0 ? (
                                        <p className="cm-meta">No TAs assigned.</p>
                                    ) : (
                                        <table className="cm-subtable">
                                            <thead>
                                                <tr>
                                                    <th>Name</th>
                                                    <th>Email</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.tas.map((t) => (
                                                    <tr key={t.id}>
                                                        <td>{t.name}</td>
                                                        <td>{t.email}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    <h3 className="cm-section-title">More</h3>
                                    <p className="cm-meta">
                                        Export aggregate grades (CSV) for reporting. Opens in a new tab.
                                    </p>
                                    <a
                                        className="cm-btn cm-btn--primary"
                                        href={getCourseGradesExportUrl(detail.course.id, 'csv', { type: 'assignments' })}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Download grades CSV
                                    </a>
                                </>
                            ) : (
                                <div className="cm-empty">Could not load course details.</div>
                            )}
                        </div>
                        <div className="cm-modal-footer">
                            <button type="button" className="cm-btn cm-btn--primary" onClick={closeDetail}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CourseManagement;
