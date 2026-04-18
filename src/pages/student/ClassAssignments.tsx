import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourse, getCourseAssignments, getSubmissions } from '../../lib/api';
import { getUser } from '../../lib/auth';
import type { Course, Assignment, Submission } from '../../lib/api';
import { Search, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import './ClassAssignments.css';

type SortBy = 'due_date' | 'name' | 'status';
type SortDir = 'asc' | 'desc';

function displayStatusForRow(assignment: Assignment): string {
    const dueDateObj = new Date(assignment.due_date);
    const isPastDue = new Date() > dueDateObj;
    if (assignment.status === 'active' && isPastDue) return 'late';
    return assignment.status;
}

const ClassAssignments: React.FC = () => {
    const { courseId } = useParams();
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [submissions, setSubmissions] = useState<Map<string, Submission>>(new Map());
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortBy>('due_date');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    useEffect(() => {
        async function loadData() {
            if (!courseId) return;
            try {
                const [courseData, assignmentsData, submissionsData] = await Promise.all([
                    getCourse(courseId),
                    getCourseAssignments(courseId),
                    getSubmissions({ student_id: studentId })
                ]);
                setCourse(courseData);
                setAssignments(assignmentsData);

                // Map submissions by assignment_id for quick lookup
                const submissionMap = new Map<string, Submission>();
                submissionsData.forEach(sub => {
                    if (!submissionMap.has(sub.assignment_id)) {
                        submissionMap.set(sub.assignment_id, sub);
                    }
                });
                setSubmissions(submissionMap);
            } catch (err) {
                setError('Failed to load course data. Make sure the backend server is running.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [courseId]);

    // Hooks must be unconditional (no early returns before these).
    const upcoming = useMemo(() => {
        const now = new Date();
        const upcomingSorted = assignments
            .filter(a => !!a.due_date && new Date(a.due_date) >= now && a.status !== 'closed')
            .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        return upcomingSorted[0] ?? null;
    }, [assignments]);

    const filteredAndSortedAssignments = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const list = !q
            ? [...assignments]
            : assignments.filter((a) => {
                  const title = (a.title ?? '').toLowerCase();
                  const desc = (a.description ?? '').toLowerCase();
                  const id = (a.id ?? '').toLowerCase();
                  return title.includes(q) || desc.includes(q) || id.includes(q);
              });

        const mul = sortDir === 'asc' ? 1 : -1;

        list.sort((a, b) => {
            if (sortBy === 'due_date') {
                const ta = a.due_date ? new Date(a.due_date).getTime() : Number.NaN;
                const tb = b.due_date ? new Date(b.due_date).getTime() : Number.NaN;
                const aBad = Number.isNaN(ta);
                const bBad = Number.isNaN(tb);
                if (aBad && bBad) return 0;
                if (aBad) return 1;
                if (bBad) return -1;
                return (ta - tb) * mul;
            }
            if (sortBy === 'name') {
                return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }) * mul;
            }
            const sa = displayStatusForRow(a).toLowerCase();
            const sb = displayStatusForRow(b).toLowerCase();
            return sa.localeCompare(sb) * mul;
        });

        return list;
    }, [assignments, searchQuery, sortBy, sortDir]);

    if (!courseId) {
        return (
            <div className="class-assignments">
                <div className="state-card">
                    <h1 className="assignments-title">Course not found</h1>
                    <p className="assignments-subtitle">Invalid course ID.</p>
                    <p style={{ marginTop: '1rem' }}>
                        <Link to="/student" className="link-primary">Back to Dashboard</Link>
                    </p>
                </div>
            </div>
        );
    }

    const header = (
        <div className="assignments-header">
            <div className="assignments-header-text">
                <h1 className="assignments-title">Assignments</h1>
            </div>
        </div>
    );

    const searchToolbar = (
        <div className="assignments-toolbar">
            <div className="assignments-search">
                <Search size={18} className="assignments-search-icon" />
                <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by title, description, or ID…"
                    className="assignments-search-input"
                    aria-label="Search assignments"
                />
            </div>
            <div className="assignments-toolbar-actions" role="group" aria-label="Sort assignments">
                <label htmlFor="assignments-sort-by" className="assignments-sort-label">
                    Sort
                </label>
                <select
                    id="assignments-sort-by"
                    className="assignments-sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                >
                    <option value="due_date">Due date</option>
                    <option value="name">Name</option>
                    <option value="status">Status</option>
                </select>
                <button
                    type="button"
                    className="assignments-sort-dir"
                    onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    title={sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
                    aria-label={sortDir === 'asc' ? 'Sort ascending, switch to descending' : 'Sort descending, switch to ascending'}
                >
                    {sortDir === 'asc' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
            </div>
        </div>
    );

    const pageHead = (includeSearch: boolean) => (
        <div className="assignments-page-head">
            {header}
            {includeSearch ? searchToolbar : null}
        </div>
    );

    if (isLoading) {
        return (
            <div className="class-assignments">
                {pageHead(false)}
                <div className="state-card">Loading assignments...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="class-assignments">
                {pageHead(false)}
                <div className="state-card" style={{ color: '#dc2626' }}>{error}</div>
            </div>
        );
    }

    if (!course) {
        return (
            <div className="class-assignments">
                <div className="state-card">
                    <h1 className="assignments-title">Course not found</h1>
                    <p className="assignments-subtitle">We could not find that course.</p>
                    <p style={{ marginTop: '1rem' }}>
                        <Link to="/student" className="link-primary">Back to Dashboard</Link>
                    </p>
                </div>
            </div>
        );
    }

    if (assignments.length === 0) {
        return (
            <div className="class-assignments">
                {pageHead(false)}
                <div className="state-card">No assignments yet.</div>
            </div>
        );
    }

    return (
        <div className="class-assignments">
            {pageHead(true)}

            {upcoming && (
                <div className="upcoming-banner">
                    <div className="upcoming-left">
                        <div className="upcoming-title">Upcoming deadline</div>
                        <div className="upcoming-name">{upcoming.title}</div>
                    </div>
                    <div className="upcoming-right">
                        <Clock size={16} />
                        <span>{new Date(upcoming.due_date).toLocaleString()}</span>
                        <Link className="upcoming-link" to={`/student/courses/${courseId}/assignments/${upcoming.id}`}>
                            Open
                        </Link>
                    </div>
                </div>
            )}

            <div className="table-wrapper">
                <table className="assignments-table">
                    <thead>
                        <tr>
                            <th className="col-name">Assignment name</th>
                            <th className="col-due-date">Due date</th>
                            <th className="col-status">Status</th>
                            <th className="col-submitted">Submitted</th>
                            <th className="col-grade">Grade</th>
                            <th className="col-action">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAndSortedAssignments.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="assignments-no-matches">
                                    No assignments match your search.{' '}
                                    <button type="button" className="assignments-clear-search" onClick={() => setSearchQuery('')}>
                                        Clear search
                                    </button>
                                </td>
                            </tr>
                        ) : (
                            filteredAndSortedAssignments.map((assignment) => {
                            const submission = submissions.get(assignment.id);
                            const dueDateObj = new Date(assignment.due_date);
                            const displayStatus = displayStatusForRow(assignment);

                            const dueDate = dueDateObj.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            });

                            // Use case-insensitive check and also allow showing grade if explicitly present even if still 'pending'
                            const isGraded = submission && (
                                ['graded', 'returned'].includes(submission.status?.toLowerCase() || '') ||
                                (submission.grade !== undefined && submission.grade !== null)
                            );
                            const gradeDisplay =
                                isGraded &&
                                    submission.grade !== undefined &&
                                    submission.grade !== null
                                    ? `${Number(submission.grade).toFixed(2)}/${(assignment.points || 100).toFixed(2)}`
                                    : `-/${(assignment.points || 100).toFixed(2)}`;

                            return (
                                <tr
                                    key={assignment.id}
                                    className="class-assignment-row"
                                >
                                    <td className="col-name assignment-name">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Link
                                                to={`/student/courses/${course.id}/assignments/${assignment.id}`}
                                                className="assignment-link"
                                            >
                                                {assignment.title}
                                            </Link>
                                            {assignment.type === 'group' && (
                                                <span style={{ fontSize: '0.7rem', backgroundColor: 'rgba(128, 0, 0, 0.1)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Group</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="col-due-date">{dueDate}</td>
                                    <td className="col-status">
                                        <span className={`status-pill status-${displayStatus}`}>
                                            {displayStatus}
                                        </span>
                                    </td>
                                    <td className="col-submitted">
                                        {submission ? (
                                            <span style={{ color: '#16a34a', fontWeight: 500 }}>
                                                ✓ {submission.files && submission.files.length > 1 ? `${submission.files.length} files` : submission.file_name}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#9ca3af' }}>Not submitted</span>
                                        )}
                                    </td>
                                    <td className="col-grade" style={{ fontWeight: 500, color: '#374151' }}>
                                        {gradeDisplay}
                                    </td>
                                    <td className="col-action">
                                        <Link
                                            to={`/student/courses/${course.id}/assignments/${assignment.id}`}
                                            className="view-button"
                                            style={{ textDecoration: 'none', display: 'inline-block' }}
                                        >
                                            View
                                        </Link>
                                    </td>
                                </tr>
                            );
                        })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ClassAssignments;
