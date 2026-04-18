import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    getStudentInsights,
    getCourses,
    enrollStudent,
    unenrollStudent,
    getUserEnrollments,
    createAdminStudent,
    importAdminStudents,
    getAdminActivityLog,
    type StudentInsight,
    type Course,
    type EnrollmentRecord,
    type AdminStudentImportRow,
    type ActivityLogRow,
} from '../../lib/api';
import { Search, GraduationCap, Plus, X, Trash2, UserPlus, Upload, ScrollText } from 'lucide-react';
import './StudentInsights.css';

function formatJoined(iso?: string): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch {
        return '—';
    }
}

/** Match a 4-digit year in course term strings like "Spring 2026". */
function yearFromTerm(term: string): string | null {
    const m = (term || '').match(/\b(19|20)\d{2}\b/);
    return m ? m[0] : null;
}

function parseStudentCsv(text: string): AdminStudentImportRow[] {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];

    const parseLine = (line: string): string[] => {
        const out: string[] = [];
        let cur = '';
        let q = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                q = !q;
            } else if ((c === ',' || c === ';') && !q) {
                out.push(cur.trim());
                cur = '';
            } else {
                cur += c;
            }
        }
        out.push(cur.trim());
        return out.map((s) => s.replace(/^"|"$/g, ''));
    };

    const normKey = (s: string) => s.toLowerCase().replace(/\s/g, '');
    const firstNorm = parseLine(lines[0]).map((c) => normKey(c));
    const hasHeader =
        firstNorm.some((k) => k === 'studentid' || k === 'student_id' || k === 'id') &&
        firstNorm.includes('name') &&
        (firstNorm.includes('email') || firstNorm.includes('e-mail'));

    let idIdx = 0;
    let nameIdx = 1;
    let emailIdx = 2;
    let passIdx = -1;
    let start = 0;

    if (hasHeader) {
        const rawFirst = parseLine(lines[0]).map((c) => c.toLowerCase().trim());
        const sidKeys = new Set(['student_id', 'studentid', 'id']);
        idIdx = rawFirst.findIndex((x) => sidKeys.has(normKey(x)));
        nameIdx = rawFirst.findIndex((x) => x === 'name');
        emailIdx = rawFirst.findIndex((x) => x === 'email' || x === 'e-mail');
        passIdx = rawFirst.findIndex((x) => x === 'password' || x === 'pass');
        if (idIdx < 0) idIdx = 0;
        if (nameIdx < 0) nameIdx = 1;
        if (emailIdx < 0) emailIdx = 2;
        start = 1;
    } else {
        passIdx = 3;
    }

    const rows: AdminStudentImportRow[] = [];
    for (let i = start; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        const studentId = (cols[idIdx] ?? '').trim();
        const name = (cols[nameIdx] ?? '').trim();
        const email = (cols[emailIdx] ?? '').trim();
        const password = passIdx >= 0 ? (cols[passIdx] ?? '').trim() : '';
        if (!studentId && !name && !email) continue;
        rows.push({
            studentId,
            name,
            email,
            password: password || undefined,
        });
    }
    return rows;
}

const StudentInsights: React.FC = () => {
    const [students, setStudents] = useState<StudentInsight[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filterCourseId, setFilterCourseId] = useState('');
    const [filterTerm, setFilterTerm] = useState('');
    const [filterYear, setFilterYear] = useState('');

    const [selectedStudent, setSelectedStudent] = useState<StudentInsight | null>(null);
    const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
    const [allCourses, setAllCourses] = useState<Course[]>([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [selectedCourseId, setSelectedCourseId] = useState('');

    const [showAddStudents, setShowAddStudents] = useState(false);
    const [addTab, setAddTab] = useState<'manual' | 'csv'>('manual');
    const [manualStudentId, setManualStudentId] = useState('');
    const [manualName, setManualName] = useState('');
    const [manualEmail, setManualEmail] = useState('');
    const [manualPassword, setManualPassword] = useState('');
    const [manualSaving, setManualSaving] = useState(false);
    const [manualError, setManualError] = useState('');

    const [csvText, setCsvText] = useState('');
    const [importDefaultPw, setImportDefaultPw] = useState('');
    const [importSaving, setImportSaving] = useState(false);
    const [importError, setImportError] = useState('');
    const [importResult, setImportResult] = useState<{
        created: number;
        errors: { row: number; studentId: string; error: string }[];
    } | null>(null);
    const csvFileInputRef = useRef<HTMLInputElement>(null);

    const [activityStudent, setActivityStudent] = useState<StudentInsight | null>(null);
    const [activityRows, setActivityRows] = useState<ActivityLogRow[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [data, courseList] = await Promise.all([getStudentInsights(), getCourses()]);
            setStudents(data);
            setCourses(courseList.filter((c) => !c.is_archived));
        } catch (e: unknown) {
            setStudents([]);
            setCourses([]);
            setError(e instanceof Error ? e.message : 'Could not load student insights.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    const openActivityModal = async (student: StudentInsight) => {
        setActivityStudent(student);
        setActivityLoading(true);
        setActivityRows([]);
        try {
            const rows = await getAdminActivityLog({ userId: student.id, limit: 200 });
            setActivityRows(rows);
        } catch {
            setActivityRows([]);
        } finally {
            setActivityLoading(false);
        }
    };

    const openEnrollmentModal = async (student: StudentInsight) => {
        setSelectedStudent(student);
        setAllCourses(courses);
        setModalLoading(true);
        try {
            const currentEnrollments = await getUserEnrollments(student.id);
            setEnrollments(currentEnrollments);
        } catch {
            setEnrollments([]);
        } finally {
            setModalLoading(false);
        }
    };

    const handleEnroll = async () => {
        if (!selectedStudent || !selectedCourseId) return;
        try {
            await enrollStudent(selectedCourseId, selectedStudent.id);
            const updated = await getUserEnrollments(selectedStudent.id);
            setEnrollments(updated);
            setSelectedCourseId('');
            void loadData();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Failed to enroll');
        }
    };

    const handleUnenroll = async (courseId: string) => {
        if (!selectedStudent) return;
        if (!window.confirm('Unenroll this student from the course?')) return;
        try {
            await unenrollStudent(courseId, selectedStudent.id);
            const updated = await getUserEnrollments(selectedStudent.id);
            setEnrollments(updated);
            void loadData();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Failed to unenroll');
        }
    };

    const courseById = useMemo(() => {
        const m = new Map<string, Course>();
        courses.forEach((c) => m.set(c.id, c));
        return m;
    }, [courses]);

    const termOptions = useMemo(() => {
        const set = new Set<string>();
        courses.forEach((c) => {
            const t = (c.term || '').trim();
            if (t) set.add(t);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }, [courses]);

    const yearOptions = useMemo(() => {
        const set = new Set<string>();
        courses.forEach((c) => {
            const y = yearFromTerm(c.term || '');
            if (y) set.add(y);
        });
        return Array.from(set).sort((a, b) => Number(b) - Number(a));
    }, [courses]);

    const coursesForFilterSelect = useMemo(
        () => [...courses].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })),
        [courses]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return students.filter((s) => {
            if (q) {
                const matchText =
                    s.name?.toLowerCase().includes(q) ||
                    s.email?.toLowerCase().includes(q) ||
                    s.id?.toLowerCase().includes(q);
                if (!matchText) return false;
            }
            const ids = s.enrolled_course_ids ?? [];
            if (filterCourseId && !ids.includes(filterCourseId)) return false;
            if (filterTerm) {
                const matchesTerm = ids.some((cid) => (courseById.get(cid)?.term || '').trim() === filterTerm);
                if (!matchesTerm) return false;
            }
            if (filterYear) {
                const matchesYear = ids.some((cid) => yearFromTerm(courseById.get(cid)?.term || '') === filterYear);
                if (!matchesYear) return false;
            }
            return true;
        });
    }, [students, search, filterCourseId, filterTerm, filterYear, courseById]);

    const clearFilters = () => {
        setSearch('');
        setFilterCourseId('');
        setFilterTerm('');
        setFilterYear('');
    };

    const closeAddStudents = () => {
        setShowAddStudents(false);
        setAddTab('manual');
        setManualStudentId('');
        setManualName('');
        setManualEmail('');
        setManualPassword('');
        setManualError('');
        setCsvText('');
        setImportDefaultPw('');
        setImportError('');
        setImportResult(null);
    };

    const submitManualStudent = async () => {
        setManualError('');
        setManualSaving(true);
        try {
            await createAdminStudent({
                studentId: manualStudentId.trim(),
                name: manualName.trim(),
                email: manualEmail.trim(),
                password: manualPassword,
            });
            closeAddStudents();
            void loadData();
        } catch (e: unknown) {
            setManualError(e instanceof Error ? e.message : 'Could not create student');
        } finally {
            setManualSaving(false);
        }
    };

    const submitCsvImport = async () => {
        setImportError('');
        setImportResult(null);
        const rows = parseStudentCsv(csvText);
        if (rows.length === 0) {
            setImportError('No valid rows. Expected columns: student_id (or id), name, email, optional password.');
            return;
        }
        const def = importDefaultPw.trim();
        if (!def && rows.some((r) => !r.password?.trim())) {
            setImportError('Enter a default password (8+ characters) or include a password column.');
            return;
        }
        if (def && def.length < 8) {
            setImportError('Default password must be at least 8 characters.');
            return;
        }
        setImportSaving(true);
        try {
            const res = await importAdminStudents(rows, def || undefined);
            setImportResult({ created: res.created.length, errors: res.errors });
            if (res.created.length > 0) void loadData();
        } catch (e: unknown) {
            setImportError(e instanceof Error ? e.message : 'Import failed');
        } finally {
            setImportSaving(false);
        }
    };

    return (
        <div className="si-page">
            <div className="si-inner">
                <header className="si-head">
                    <h1>Student insights</h1>
                    <div className="si-toolbar">
                        <div className="si-toolbar-row">
                            <div className="si-search-wrap">
                                <Search size={16} aria-hidden />
                                <input
                                    type="search"
                                    className="si-search"
                                    placeholder="Search name, email, student ID…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    aria-label="Search students"
                                />
                            </div>
                            <button
                                type="button"
                                className="si-btn si-btn--primary si-add-students-btn"
                                onClick={() => setShowAddStudents(true)}
                            >
                                <UserPlus size={16} aria-hidden />
                                Add students
                            </button>
                        </div>
                        <div className="si-toolbar-row si-filters-row">
                            <div className="si-filter-field">
                                <label className="si-filter-label" htmlFor="si-filter-course">
                                    Course
                                </label>
                                <select
                                    id="si-filter-course"
                                    className="si-select"
                                    value={filterCourseId}
                                    onChange={(e) => setFilterCourseId(e.target.value)}
                                    aria-label="Filter by enrolled course"
                                >
                                    <option value="">All courses</option>
                                    {coursesForFilterSelect.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} ({c.id})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="si-filter-field">
                                <label className="si-filter-label" htmlFor="si-filter-term">
                                    Term
                                </label>
                                <select
                                    id="si-filter-term"
                                    className="si-select"
                                    value={filterTerm}
                                    onChange={(e) => setFilterTerm(e.target.value)}
                                    aria-label="Filter by course term"
                                >
                                    <option value="">All terms</option>
                                    {termOptions.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="si-filter-field">
                                <label className="si-filter-label" htmlFor="si-filter-year">
                                    Year
                                </label>
                                <select
                                    id="si-filter-year"
                                    className="si-select"
                                    value={filterYear}
                                    onChange={(e) => setFilterYear(e.target.value)}
                                    aria-label="Filter by year in course term"
                                >
                                    <option value="">All years</option>
                                    {yearOptions.map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {(filterCourseId || filterTerm || filterYear || search.trim()) && (
                                <button type="button" className="si-clear-filters" onClick={clearFilters}>
                                    Clear filters
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {error && (
                    <div
                        style={{
                            marginBottom: '1rem',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '0.375rem',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            fontSize: '0.875rem',
                            border: '1px solid #fecaca',
                        }}
                    >
                        {error}
                    </div>
                )}

                <div className="si-table-wrap si-table-wrap--scroll">
                    {loading ? (
                        <div className="si-empty">Loading students…</div>
                    ) : (
                        <table className="si-table">
                            <thead>
                                <tr>
                                    <th scope="col">Name</th>
                                    <th scope="col">Email</th>
                                    <th scope="col">Student ID</th>
                                    <th scope="col">TA</th>
                                    <th scope="col">Joined</th>
                                    <th scope="col">Courses</th>
                                    <th scope="col">Submissions</th>
                                    <th scope="col">Graded</th>
                                    <th className="si-th-actions" scope="col">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="si-empty">
                                            {students.length === 0
                                                ? 'No students found.'
                                                : filterCourseId || filterTerm || filterYear
                                                  ? 'No students match your filters.'
                                                  : search.trim()
                                                    ? 'No students match your search.'
                                                    : 'No students to show.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((s) => (
                                        <tr key={s.id}>
                                            <td className="si-course-name">{s.name ?? '—'}</td>
                                            <td>{s.email ?? '—'}</td>
                                            <td className="si-mono">{s.id}</td>
                                            <td>
                                                {s.is_ta ? (
                                                    <span className="si-ta-badge" title="Teaching assistant in one or more courses">
                                                        TA
                                                    </span>
                                                ) : (
                                                    <span className="si-muted-dash">—</span>
                                                )}
                                            </td>
                                            <td>{formatJoined(s.created_at)}</td>
                                            <td className="si-num">{s.courses_enrolled}</td>
                                            <td className="si-num">{s.submissions_count}</td>
                                            <td className="si-num">{s.graded_count}</td>
                                            <td className="si-td-actions">
                                                <div className="si-action-btns">
                                                    <button
                                                        type="button"
                                                        className="si-btn si-btn--primary"
                                                        onClick={() => void openEnrollmentModal(s)}
                                                    >
                                                        <GraduationCap size={16} aria-hidden />
                                                        Enrollments
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="si-btn si-btn--outline"
                                                        onClick={() => void openActivityModal(s)}
                                                    >
                                                        <ScrollText size={16} aria-hidden />
                                                        Activity
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {showAddStudents && (
                <div
                    className="si-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="si-add-students-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeAddStudents();
                    }}
                >
                    <div className="si-modal si-modal--wide" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="si-modal-header">
                            <div>
                                <h2 id="si-add-students-title">Add students</h2>
                                <p className="si-muted">Create student accounts for sign-in. Enroll them in courses from the table.</p>
                            </div>
                            <button type="button" className="si-modal-close" onClick={closeAddStudents} aria-label="Close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="si-modal-body">
                            <div className="si-add-tabs" role="tablist" aria-label="Add method">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={addTab === 'manual'}
                                    className={`si-add-tab ${addTab === 'manual' ? 'si-add-tab--active' : ''}`}
                                    onClick={() => setAddTab('manual')}
                                >
                                    Manual
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={addTab === 'csv'}
                                    className={`si-add-tab ${addTab === 'csv' ? 'si-add-tab--active' : ''}`}
                                    onClick={() => setAddTab('csv')}
                                >
                                    CSV
                                </button>
                            </div>

                            {addTab === 'manual' ? (
                                <div className="si-add-panel">
                                    <div className="si-form-grid">
                                        <label className="si-field">
                                            <span className="si-field-label">Student ID</span>
                                            <input
                                                className="si-input"
                                                value={manualStudentId}
                                                onChange={(e) => setManualStudentId(e.target.value)}
                                                placeholder="e.g. 10023456"
                                                autoComplete="off"
                                            />
                                        </label>
                                        <label className="si-field">
                                            <span className="si-field-label">Full name</span>
                                            <input
                                                className="si-input"
                                                value={manualName}
                                                onChange={(e) => setManualName(e.target.value)}
                                                placeholder="Jane Doe"
                                                autoComplete="name"
                                            />
                                        </label>
                                        <label className="si-field si-field--full">
                                            <span className="si-field-label">Email</span>
                                            <input
                                                className="si-input"
                                                type="email"
                                                value={manualEmail}
                                                onChange={(e) => setManualEmail(e.target.value)}
                                                placeholder="student@school.edu"
                                                autoComplete="email"
                                            />
                                        </label>
                                        <label className="si-field si-field--full">
                                            <span className="si-field-label">Initial password</span>
                                            <input
                                                className="si-input"
                                                type="password"
                                                value={manualPassword}
                                                onChange={(e) => setManualPassword(e.target.value)}
                                                placeholder="At least 8 characters"
                                                autoComplete="new-password"
                                            />
                                        </label>
                                    </div>
                                    {manualError ? <div className="si-inline-error">{manualError}</div> : null}
                                    <div className="si-add-actions">
                                        <button type="button" className="si-btn" onClick={closeAddStudents} disabled={manualSaving}>
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            className="si-btn si-btn--primary"
                                            disabled={
                                                manualSaving ||
                                                !manualStudentId.trim() ||
                                                !manualName.trim() ||
                                                !manualEmail.trim() ||
                                                manualPassword.length < 8
                                            }
                                            onClick={() => void submitManualStudent()}
                                        >
                                            {manualSaving ? 'Creating…' : 'Create student'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="si-add-panel">
                                    <p className="si-csv-hint">
                                        CSV columns: <code>student_id</code>, <code>name</code>, <code>email</code>
                                        {', '}
                                        optional <code>password</code>. Or without a header row: ID, name, email[, password].
                                    </p>
                                    <input
                                        ref={csvFileInputRef}
                                        type="file"
                                        accept=".csv,text/csv,text/plain"
                                        className="si-file-input-hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (!f) return;
                                            const reader = new FileReader();
                                            reader.onload = () => setCsvText(String(reader.result || ''));
                                            reader.readAsText(f);
                                            e.target.value = '';
                                        }}
                                    />
                                    <div className="si-csv-toolbar">
                                        <button
                                            type="button"
                                            className="si-btn si-btn--outline"
                                            onClick={() => csvFileInputRef.current?.click()}
                                        >
                                            <Upload size={16} aria-hidden />
                                            Choose CSV file
                                        </button>
                                    </div>
                                    <label className="si-field si-field--full">
                                        <span className="si-field-label">Paste CSV</span>
                                        <textarea
                                            className="si-textarea"
                                            rows={8}
                                            value={csvText}
                                            onChange={(e) => setCsvText(e.target.value)}
                                            placeholder={`student_id,name,email\n1001,Alex Smith,alex@school.edu`}
                                        />
                                    </label>
                                    <label className="si-field si-field--full">
                                        <span className="si-field-label">Default password (if rows omit password)</span>
                                        <input
                                            className="si-input"
                                            type="password"
                                            value={importDefaultPw}
                                            onChange={(e) => setImportDefaultPw(e.target.value)}
                                            placeholder="8+ characters"
                                            autoComplete="new-password"
                                        />
                                    </label>
                                    {importError ? <div className="si-inline-error">{importError}</div> : null}
                                    {importResult ? (
                                        <div className="si-import-summary">
                                            <p>
                                                Created <strong>{importResult.created}</strong> student(s).
                                                {importResult.errors.length > 0 && (
                                                    <> {importResult.errors.length} row(s) failed.</>
                                                )}
                                            </p>
                                            {importResult.errors.length > 0 && (
                                                <ul className="si-import-errors">
                                                    {importResult.errors.map((err, i) => (
                                                        <li key={`${err.row}-${i}`}>
                                                            Row {err.row} ({err.studentId || '—'}): {err.error}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    ) : null}
                                    <div className="si-add-actions">
                                        <button type="button" className="si-btn" onClick={closeAddStudents} disabled={importSaving}>
                                            {importResult ? 'Close' : 'Cancel'}
                                        </button>
                                        {!importResult && (
                                            <button
                                                type="button"
                                                className="si-btn si-btn--primary"
                                                disabled={importSaving}
                                                onClick={() => void submitCsvImport()}
                                            >
                                                {importSaving ? 'Importing…' : 'Run import'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedStudent && (
                <div
                    className="si-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="si-modal-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setSelectedStudent(null);
                    }}
                >
                    <div className="si-modal" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="si-modal-header">
                            <div>
                                <h2 id="si-modal-title">Manage enrollments</h2>
                                <p className="si-muted">{selectedStudent.name}</p>
                                <p className="si-muted">{selectedStudent.email}</p>
                            </div>
                            <button
                                type="button"
                                className="si-modal-close"
                                onClick={() => setSelectedStudent(null)}
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="si-modal-body">
                            <div className="si-section">
                                <h3 className="si-section-title">Enroll in course</h3>
                                <div className="si-enroll-row">
                                    <select
                                        className="si-select"
                                        value={selectedCourseId}
                                        onChange={(e) => setSelectedCourseId(e.target.value)}
                                        aria-label="Select course"
                                    >
                                        <option value="">Select a course…</option>
                                        {allCourses
                                            .filter((c) => !enrollments.some((e) => e.id === c.id))
                                            .map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} ({c.id})
                                                </option>
                                            ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="si-btn si-btn--primary"
                                        disabled={!selectedCourseId}
                                        onClick={() => void handleEnroll()}
                                    >
                                        <Plus size={16} aria-hidden />
                                        Enroll
                                    </button>
                                </div>
                            </div>

                            <div className="si-section">
                                <h3 className="si-section-title">Current enrollments</h3>
                                {modalLoading ? (
                                    <div className="si-empty" style={{ padding: '1.5rem' }}>
                                        Loading…
                                    </div>
                                ) : enrollments.length === 0 ? (
                                    <div className="si-dash-box">Not enrolled in any courses.</div>
                                ) : (
                                    <div className="si-subtable-wrap">
                                        <table className="si-subtable">
                                            <thead>
                                                <tr>
                                                    <th>Course</th>
                                                    <th>Course ID</th>
                                                    <th className="si-sub-th-actions"> </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {enrollments.map((e) => (
                                                    <tr key={e.id}>
                                                        <td>{e.name}</td>
                                                        <td className="si-mono">{e.id}</td>
                                                        <td className="si-td-actions">
                                                            <button
                                                                type="button"
                                                                className="si-icon-btn"
                                                                title="Unenroll"
                                                                onClick={() => void handleUnenroll(e.id)}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="si-modal-footer">
                            <button type="button" className="si-btn" onClick={() => setSelectedStudent(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activityStudent && (
                <div
                    className="si-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="si-activity-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setActivityStudent(null);
                    }}
                >
                    <div className="si-modal si-modal--wide" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="si-modal-header">
                            <div>
                                <h2 id="si-activity-title">Activity log</h2>
                                <p className="si-muted">{activityStudent.name}</p>
                                <p className="si-muted">{activityStudent.email}</p>
                            </div>
                            <button
                                type="button"
                                className="si-modal-close"
                                onClick={() => setActivityStudent(null)}
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="si-modal-body">
                            {activityLoading ? (
                                <div className="si-empty">Loading…</div>
                            ) : activityRows.length === 0 ? (
                                <p className="si-muted">No logged activity for this user yet (logins are recorded automatically).</p>
                            ) : (
                                <div className="si-subtable-wrap si-subtable-wrap--scroll">
                                    <table className="si-subtable">
                                        <thead>
                                            <tr>
                                                <th>When</th>
                                                <th>Action</th>
                                                <th>IP</th>
                                                <th>Detail</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activityRows.map((a) => (
                                                <tr key={a.id}>
                                                    <td className="si-nowrap">
                                                        {a.createdAt
                                                            ? new Date(a.createdAt).toLocaleString(undefined, {
                                                                  dateStyle: 'short',
                                                                  timeStyle: 'short',
                                                              })
                                                            : '—'}
                                                    </td>
                                                    <td>{a.action}</td>
                                                    <td className="si-mono si-small">{a.ip || '—'}</td>
                                                    <td className="si-small">{a.detail || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="si-modal-footer">
                            <button type="button" className="si-btn" onClick={() => setActivityStudent(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentInsights;
