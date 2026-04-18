import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    getAdminFaculty,
    getPendingFaculty,
    verifyFaculty,
    getAdminFacultyDetail,
    createAdminFaculty,
    importAdminFaculty,
    getAdminActivityLog,
    type AdminFaculty,
    type AdminFacultyDetail,
    type PendingFaculty,
    type ActivityLogRow,
} from '../../lib/api';
import {
    Search,
    CheckCircle,
    Plus,
    Upload,
    Eye,
    X,
} from 'lucide-react';
import './FacultyManagement.css';

function parseFacultyCsv(text: string): { name: string; email: string; password?: string }[] {
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

    const first = parseLine(lines[0]).map((c) => c.toLowerCase().replace(/\s/g, ''));
    const hasHeader =
        first.includes('name') && (first.includes('email') || first.includes('e-mail'));
    let nameIdx = 0;
    let emailIdx = 1;
    let passIdx = 2;
    let start = 0;
    if (hasHeader) {
        const rawFirst = parseLine(lines[0]).map((c) => c.toLowerCase().trim());
        nameIdx = rawFirst.findIndex((x) => x === 'name');
        emailIdx = rawFirst.findIndex((x) => x === 'email' || x === 'e-mail');
        passIdx = rawFirst.findIndex((x) => x === 'password' || x === 'pass');
        if (nameIdx < 0) nameIdx = 0;
        if (emailIdx < 0) emailIdx = 1;
        if (passIdx < 0) passIdx = -1;
        start = 1;
    }

    const rows: { name: string; email: string; password?: string }[] = [];
    for (let i = start; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        const name = (cols[nameIdx] ?? '').trim();
        const email = (cols[emailIdx] ?? '').trim();
        const password = passIdx >= 0 ? (cols[passIdx] ?? '').trim() : undefined;
        if (!name && !email) continue;
        rows.push({
            name,
            email,
            password: password || undefined,
        });
    }
    return rows;
}

function formatWhen(iso?: string): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        return '—';
    }
}

function isVerified(f: AdminFaculty): boolean {
    return f.verified === true || f.verified === 1;
}

const FacultyManagement: React.FC = () => {
    const [faculty, setFaculty] = useState<AdminFaculty[]>([]);
    const [pending, setPending] = useState<PendingFaculty[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCourseId, setFilterCourseId] = useState('');
    const [filterYear, setFilterYear] = useState('');
    const [filterTerm, setFilterTerm] = useState('');
    const [verifyingId, setVerifyingId] = useState<string | null>(null);

    const [showAdd, setShowAdd] = useState(false);
    const [addName, setAddName] = useState('');
    const [addEmail, setAddEmail] = useState('');
    const [addPassword, setAddPassword] = useState('');
    const [addRequireVerification, setAddRequireVerification] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState('');

    const [showImport, setShowImport] = useState(false);
    const [csvText, setCsvText] = useState('');
    const [importDefaultPw, setImportDefaultPw] = useState('');
    const [importSaving, setImportSaving] = useState(false);
    const [importError, setImportError] = useState('');
    const [importResult, setImportResult] = useState<{
        created: number;
        errors: { row: number; email: string; error: string }[];
    } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const [detailOpenId, setDetailOpenId] = useState<string | null>(null);
    const [detail, setDetail] = useState<AdminFacultyDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [facultyActivity, setFacultyActivity] = useState<ActivityLogRow[]>([]);

    const load = async () => {
        try {
            const [facultyData, pendingData] = await Promise.all([getAdminFaculty(), getPendingFaculty()]);
            setFaculty(facultyData);
            setPending(pendingData);
        } catch {
            setFaculty([]);
            setPending([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const handleVerify = async (id: string) => {
        setVerifyingId(id);
        try {
            await verifyFaculty(id);
            setPending((prev) => prev.filter((f) => f.id !== id));
            await load();
        } finally {
            setVerifyingId(null);
        }
    };

    const filterOptions = useMemo(() => {
        const courseMap = new Map<string, string>();
        const years = new Set<string>();
        const terms = new Set<string>();
        for (const f of faculty) {
            for (const c of f.courses_taught ?? []) {
                courseMap.set(c.id, c.name);
                const t = (c.term ?? '').trim();
                if (t) {
                    terms.add(t);
                    const y = t.match(/\b(19|20)\d{2}\b/);
                    if (y) years.add(y[0]);
                }
            }
        }
        return {
            courses: [...courseMap.entries()]
                .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }))
                .map(([id, name]) => ({ id, name })),
            years: [...years].sort((a, b) => b.localeCompare(a)),
            terms: [...terms].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        };
    }, [faculty]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return faculty.filter((f) => {
            const textOk =
                !q ||
                (f.name?.toLowerCase().includes(q) ?? false) ||
                (f.email?.toLowerCase().includes(q) ?? false) ||
                (f.id?.toLowerCase().includes(q) ?? false);
            if (!textOk) return false;
            if (!filterCourseId && !filterYear && !filterTerm) return true;
            const courses = f.courses_taught ?? [];
            return courses.some((c) => {
                if (filterCourseId && c.id !== filterCourseId) return false;
                if (filterYear && !(c.term && c.term.includes(filterYear))) return false;
                if (filterTerm && c.term !== filterTerm) return false;
                return true;
            });
        });
    }, [faculty, search, filterCourseId, filterYear, filterTerm]);

    const hasActiveFilters = Boolean(
        search.trim() || filterCourseId || filterYear || filterTerm
    );

    const clearAllFilters = () => {
        setSearch('');
        setFilterCourseId('');
        setFilterYear('');
        setFilterTerm('');
    };

    const openDetail = async (id: string) => {
        setDetailOpenId(id);
        setDetail(null);
        setFacultyActivity([]);
        setDetailLoading(true);
        try {
            const [d, act] = await Promise.all([
                getAdminFacultyDetail(id),
                getAdminActivityLog({ userId: id, limit: 150 }).catch(() => [] as ActivityLogRow[]),
            ]);
            setDetail(d);
            setFacultyActivity(Array.isArray(act) ? act : []);
        } catch {
            setDetail(null);
            setFacultyActivity([]);
        } finally {
            setDetailLoading(false);
        }
    };

    const closeDetail = () => {
        setDetailOpenId(null);
        setDetail(null);
        setDetailLoading(false);
        setFacultyActivity([]);
    };

    const submitAdd = async () => {
        setAddError('');
        setAddSaving(true);
        try {
            await createAdminFaculty({
                name: addName.trim(),
                email: addEmail.trim(),
                password: addPassword,
                requireVerification: addRequireVerification,
            });
            setShowAdd(false);
            setAddName('');
            setAddEmail('');
            setAddPassword('');
            setAddRequireVerification(false);
            await load();
        } catch (e: unknown) {
            setAddError(e instanceof Error ? e.message : 'Failed to create faculty');
        } finally {
            setAddSaving(false);
        }
    };

    const submitImport = async () => {
        setImportError('');
        setImportResult(null);
        const rows = parseFacultyCsv(csvText);
        if (!rows.length) {
            setImportError('No rows found. Use columns: name, email, password (optional if default set).');
            return;
        }
        setImportSaving(true);
        try {
            const res = await importAdminFaculty(
                rows,
                importDefaultPw.trim() ? importDefaultPw.trim() : undefined
            );
            setImportResult({
                created: res.created.length,
                errors: res.errors,
            });
            if (res.created.length) await load();
        } catch (e: unknown) {
            setImportError(e instanceof Error ? e.message : 'Import failed');
        } finally {
            setImportSaving(false);
        }
    };

    const closeImport = () => {
        setShowImport(false);
        setCsvText('');
        setImportDefaultPw('');
        setImportError('');
        setImportResult(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    return (
        <div className="fm-page">
            <div className="fm-inner">
                <header className="fm-head fm-head--toolbar-only">
                    <div className="fm-toolbar fm-toolbar--stack">
                        <div className="fm-toolbar-row">
                            <div className="fm-search-wrap">
                                <Search size={16} aria-hidden />
                                <input
                                    type="search"
                                    className="fm-search"
                                    placeholder="Search name, email, ID…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    aria-label="Search faculty"
                                />
                            </div>
                            <button type="button" className="fm-btn fm-btn--primary" onClick={() => setShowAdd(true)}>
                                <Plus size={16} aria-hidden /> Add faculty
                            </button>
                            <button type="button" className="fm-btn" onClick={() => setShowImport(true)}>
                                <Upload size={16} aria-hidden /> Import CSV
                            </button>
                        </div>
                        <div className="fm-filters">
                            <div className="fm-filter-field">
                                <label htmlFor="fm-filter-course">Course</label>
                                <select
                                    id="fm-filter-course"
                                    className="fm-select"
                                    value={filterCourseId}
                                    onChange={(e) => setFilterCourseId(e.target.value)}
                                >
                                    <option value="">All courses</option>
                                    {filterOptions.courses.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="fm-filter-field">
                                <label htmlFor="fm-filter-year">Year</label>
                                <select
                                    id="fm-filter-year"
                                    className="fm-select"
                                    value={filterYear}
                                    onChange={(e) => setFilterYear(e.target.value)}
                                >
                                    <option value="">All years</option>
                                    {filterOptions.years.map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="fm-filter-field">
                                <label htmlFor="fm-filter-term">Term</label>
                                <select
                                    id="fm-filter-term"
                                    className="fm-select"
                                    value={filterTerm}
                                    onChange={(e) => setFilterTerm(e.target.value)}
                                >
                                    <option value="">All terms</option>
                                    {filterOptions.terms.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    className="fm-btn fm-btn-clear-filters"
                                    onClick={clearAllFilters}
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {pending.length > 0 && (
                    <section className="fm-card fm-card--pending">
                        <h2>
                            <CheckCircle size={18} aria-hidden /> Pending verification
                        </h2>
                        <p>Approve these accounts so they can use the faculty dashboard.</p>
                        <div className="fm-table-wrap fm-table-wrap--scroll">
                            <table className="fm-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pending.map((f) => (
                                        <tr key={f.id}>
                                            <td>{f.name}</td>
                                            <td>{f.email}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="fm-btn fm-btn--primary"
                                                    disabled={verifyingId === f.id}
                                                    onClick={() => handleVerify(f.id)}
                                                >
                                                    {verifyingId === f.id ? 'Verifying…' : 'Verify'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                <section className="fm-table-wrap fm-table-wrap--scroll">
                    {loading ? (
                        <div className="fm-empty">Loading faculty…</div>
                    ) : (
                        <table className="fm-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>User ID</th>
                                    <th>Status</th>
                                    <th>Courses</th>
                                    <th>Assignments</th>
                                    <th>Active asg.</th>
                                    <th>Students</th>
                                    <th>Messages</th>
                                    <th>Last activity</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((f) => (
                                    <tr key={f.id}>
                                        <td className="font-medium">{f.name ?? '—'}</td>
                                        <td>{f.email ?? '—'}</td>
                                        <td className="fm-mono">{f.id}</td>
                                        <td>
                                            {isVerified(f) ? (
                                                <span className="fm-badge fm-badge--ok">Verified</span>
                                            ) : (
                                                <span className="fm-badge fm-badge--wait">Pending</span>
                                            )}
                                        </td>
                                        <td className="fm-num">{f.course_count ?? 0}</td>
                                        <td className="fm-num">{f.assignment_count ?? 0}</td>
                                        <td className="fm-num">{f.active_assignments ?? 0}</td>
                                        <td className="fm-num">{f.unique_students ?? 0}</td>
                                        <td className="fm-num">{f.messages_sent ?? 0}</td>
                                        <td
                                            className="whitespace-nowrap"
                                            style={{ fontSize: '0.75rem', color: '#64748b' }}
                                            title="From last profile update; session duration is not tracked"
                                        >
                                            {formatWhen(f.updated_at)}
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="fm-btn"
                                                onClick={() => void openDetail(f.id)}
                                                title="View details"
                                            >
                                                <Eye size={16} aria-hidden /> View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>

                {!loading && filtered.length === 0 && (
                    <div className="fm-empty">
                        {faculty.length === 0
                            ? 'No faculty loaded.'
                            : 'No faculty match your search or filters.'}
                    </div>
                )}
            </div>

            {showAdd && (
                <div
                    className="fm-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="fm-add-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setShowAdd(false);
                    }}
                >
                    <div className="fm-modal" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="fm-modal-header">
                            <h2 id="fm-add-title">Add faculty</h2>
                            <button type="button" className="fm-modal-close" onClick={() => setShowAdd(false)} aria-label="Close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="fm-modal-body">
                            {addError ? <div className="fm-error">{addError}</div> : null}
                            <div className="fm-field">
                                <label htmlFor="fm-add-name">Name</label>
                                <input
                                    id="fm-add-name"
                                    className="fm-input"
                                    value={addName}
                                    onChange={(e) => setAddName(e.target.value)}
                                    autoComplete="name"
                                />
                            </div>
                            <div className="fm-field">
                                <label htmlFor="fm-add-email">Email</label>
                                <input
                                    id="fm-add-email"
                                    type="email"
                                    className="fm-input"
                                    value={addEmail}
                                    onChange={(e) => setAddEmail(e.target.value)}
                                    autoComplete="email"
                                />
                            </div>
                            <div className="fm-field">
                                <label htmlFor="fm-add-pw">Password</label>
                                <input
                                    id="fm-add-pw"
                                    type="password"
                                    className="fm-input"
                                    value={addPassword}
                                    onChange={(e) => setAddPassword(e.target.value)}
                                    autoComplete="new-password"
                                />
                                <p className="fm-hint">At least 8 characters, with letter, number, and special character.</p>
                            </div>
                            <label className="fm-check">
                                <input
                                    type="checkbox"
                                    checked={addRequireVerification}
                                    onChange={(e) => setAddRequireVerification(e.target.checked)}
                                />
                                Require admin verification before they can log in (same as self-signup)
                            </label>
                        </div>
                        <div className="fm-modal-footer">
                            <button type="button" className="fm-btn" onClick={() => setShowAdd(false)} disabled={addSaving}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="fm-btn fm-btn--primary"
                                onClick={() => void submitAdd()}
                                disabled={addSaving || !addName.trim() || !addEmail.trim() || !addPassword}
                            >
                                {addSaving ? 'Creating…' : 'Create faculty'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showImport && (
                <div
                    className="fm-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="fm-import-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeImport();
                    }}
                >
                    <div className="fm-modal fm-modal--wide" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="fm-modal-header">
                            <h2 id="fm-import-title">Import faculty from CSV</h2>
                            <button type="button" className="fm-modal-close" onClick={closeImport} aria-label="Close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="fm-modal-body">
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".csv,text/csv"
                                className="fm-sr-only"
                                aria-hidden
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = () => setCsvText(String(reader.result ?? ''));
                                    reader.readAsText(file);
                                }}
                            />
                            <p className="fm-import-summary">
                                Columns: <strong>name</strong>, <strong>email</strong>, optional <strong>password</strong> (or use one default below).
                                First row can be a header.
                            </p>
                            <button type="button" className="fm-btn fm-btn--primary fm-mb-2" onClick={() => fileRef.current?.click()}>
                                <Upload size={16} aria-hidden /> Choose CSV file
                            </button>
                            <div className="fm-field">
                                <label htmlFor="fm-csv-paste">Or paste CSV</label>
                                <textarea
                                    id="fm-csv-paste"
                                    className="fm-textarea"
                                    value={csvText}
                                    onChange={(e) => setCsvText(e.target.value)}
                                    placeholder={'name,email,password\n"Jane Doe",jane@ulm.edu,Temp123!@#'}
                                />
                            </div>
                            <div className="fm-field">
                                <label htmlFor="fm-default-pw">Default password (if column omitted)</label>
                                <input
                                    id="fm-default-pw"
                                    type="password"
                                    className="fm-input"
                                    value={importDefaultPw}
                                    onChange={(e) => setImportDefaultPw(e.target.value)}
                                    autoComplete="new-password"
                                />
                            </div>
                            {importError ? <div className="fm-error">{importError}</div> : null}
                            {importResult ? (
                                <div>
                                    <p className="fm-import-summary">
                                        Created <strong>{importResult.created}</strong> account(s).
                                        {importResult.errors.length > 0 && (
                                            <> {importResult.errors.length} row(s) failed.</>
                                        )}
                                    </p>
                                    {importResult.errors.length > 0 && (
                                        <ul className="fm-import-errors">
                                            {importResult.errors.map((err, i) => (
                                                <li key={i}>
                                                    Row {err.row} ({err.email || '—'}): {err.error}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ) : null}
                        </div>
                        <div className="fm-modal-footer">
                            <button type="button" className="fm-btn" onClick={closeImport} disabled={importSaving}>
                                {importResult ? 'Close' : 'Cancel'}
                            </button>
                            {!importResult && (
                                <button type="button" className="fm-btn fm-btn--primary" onClick={() => void submitImport()} disabled={importSaving}>
                                    {importSaving ? 'Importing…' : 'Run import'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {detailOpenId !== null ? (
                <div
                    className="fm-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="fm-detail-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeDetail();
                    }}
                >
                    <div className="fm-modal fm-modal--wide" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="fm-modal-header">
                            <h2 id="fm-detail-title">{detail?.name ?? 'Faculty details'}</h2>
                            <button type="button" className="fm-modal-close" onClick={closeDetail} aria-label="Close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="fm-modal-body">
                            {detailLoading ? (
                                <div className="fm-empty">Loading…</div>
                            ) : detail ? (
                                <>
                                    <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', color: '#64748b' }}>{detail.email}</p>
                                    <p className="fm-mono" style={{ margin: '0 0 0.75rem', fontSize: '0.75rem' }}>
                                        {detail.id}
                                    </p>
                                    <div className="fm-stat-grid">
                                        <div className="fm-stat">
                                            <span>Courses teaching</span>
                                            <strong>{detail.course_count ?? 0}</strong>
                                        </div>
                                        <div className="fm-stat">
                                            <span>Assignments</span>
                                            <strong>{detail.assignment_count ?? 0}</strong>
                                        </div>
                                        <div className="fm-stat">
                                            <span>Active assignments</span>
                                            <strong>{detail.active_assignments ?? 0}</strong>
                                        </div>
                                        <div className="fm-stat">
                                            <span>Unique students</span>
                                            <strong>{detail.unique_students ?? 0}</strong>
                                        </div>
                                        <div className="fm-stat">
                                            <span>Messages sent</span>
                                            <strong>{detail.messages_sent ?? 0}</strong>
                                        </div>
                                        <div className="fm-stat">
                                            <span>Joined</span>
                                            <span className="fm-stat-value fm-stat-value--text">{formatWhen(detail.created_at)}</span>
                                        </div>
                                        <div className="fm-stat">
                                            <span>Last activity</span>
                                            <span
                                                className="fm-stat-value fm-stat-value--text"
                                                title="From last profile update; session duration is not tracked"
                                            >
                                                {formatWhen(detail.updated_at)}
                                            </span>
                                        </div>
                                        <div className="fm-stat">
                                            <span>Status</span>
                                            <span className="fm-stat-value fm-stat-value--text">
                                                {isVerified(detail) ? 'Verified' : 'Pending'}
                                            </span>
                                        </div>
                                    </div>
                                    <h3
                                        style={{
                                            margin: '1rem 0 0.5rem',
                                            fontSize: '0.6875rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.08em',
                                            color: '#7f1d1d',
                                        }}
                                    >
                                        Activity log
                                    </h3>
                                    {facultyActivity.length === 0 ? (
                                        <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#64748b' }}>
                                            No logged activity yet (successful logins are recorded automatically).
                                        </p>
                                    ) : (
                                        <div className="fm-table-wrap fm-table-wrap--scroll" style={{ marginBottom: '1rem' }}>
                                            <table className="fm-table">
                                                <thead>
                                                    <tr>
                                                        <th>When</th>
                                                        <th>Action</th>
                                                        <th>IP</th>
                                                        <th>Detail</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {facultyActivity.map((a) => (
                                                        <tr key={a.id}>
                                                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                                                                {a.createdAt
                                                                    ? new Date(a.createdAt).toLocaleString(undefined, {
                                                                          dateStyle: 'short',
                                                                          timeStyle: 'short',
                                                                      })
                                                                    : '—'}
                                                            </td>
                                                            <td>{a.action}</td>
                                                            <td className="fm-mono" style={{ fontSize: '0.7rem' }}>
                                                                {a.ip || '—'}
                                                            </td>
                                                            <td style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                {a.detail || '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    <h3
                                        style={{
                                            margin: '0 0 0.5rem',
                                            fontSize: '0.6875rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.08em',
                                            color: '#7f1d1d',
                                        }}
                                    >
                                        Courses
                                    </h3>
                                    {detail.courses.length === 0 ? (
                                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                                            No courses as instructor of record.
                                        </p>
                                    ) : (
                                        <table className="fm-course-table">
                                            <thead>
                                                <tr>
                                                    <th>Course</th>
                                                    <th>Term</th>
                                                    <th>Archived</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.courses.map((c) => (
                                                    <tr key={c.id}>
                                                        <td>{c.name}</td>
                                                        <td>{c.term ?? '—'}</td>
                                                        <td>{c.is_archived ? 'Yes' : 'No'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </>
                            ) : (
                                <div className="fm-empty">Could not load this faculty member.</div>
                            )}
                        </div>
                        <div className="fm-modal-footer">
                            <button type="button" className="fm-btn fm-btn--primary" onClick={closeDetail}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default FacultyManagement;
