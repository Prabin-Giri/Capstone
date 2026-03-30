import React, { useEffect, useMemo, useState } from 'react';
import {
    getStudentInsights,
    getCourses,
    enrollStudent,
    unenrollStudent,
    getUserEnrollments,
    type StudentInsight,
    type Course,
    type EnrollmentRecord,
} from '../../lib/api';
import { Search, GraduationCap, Plus, X, Trash2 } from 'lucide-react';
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
                                        <td colSpan={8} className="si-empty">
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
                                            <td>{formatJoined(s.created_at)}</td>
                                            <td className="si-num">{s.courses_enrolled}</td>
                                            <td className="si-num">{s.submissions_count}</td>
                                            <td className="si-num">{s.graded_count}</td>
                                            <td className="si-td-actions">
                                                <button
                                                    type="button"
                                                    className="si-btn si-btn--primary"
                                                    onClick={() => void openEnrollmentModal(s)}
                                                >
                                                    <GraduationCap size={16} aria-hidden />
                                                    Enrollments
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

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
        </div>
    );
};

export default StudentInsights;
