import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../../components/ui/Card';
import {
    getAdminUsers,
    deleteAdminUser,
    getCourses,
    patchAdminUser,
    type AdminUser,
    type Course,
} from '../../lib/api';
import {
    BookOpen,
    GraduationCap,
    Inbox,
    Layers,
    ListTodo,
    MessageSquare,
    MoreHorizontal,
    Palette,
    Search,
    Send,
    UserCheck,
    X,
} from 'lucide-react';
import UserAvatar from '../../components/ui/UserAvatar';
import './UserManagement.css';

const LS_SUSPENDED = 'urm_suspended_user_ids';

const ASSIGNABLE_ROLES = ['student', 'faculty', 'admin', 'ta'] as const;

function readSuspended(): Set<string> {
    try {
        const raw = localStorage.getItem(LS_SUSPENDED);
        if (!raw) return new Set();
        const arr = JSON.parse(raw) as unknown;
        return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
        return new Set();
    }
}

function writeSuspended(ids: Set<string>) {
    localStorage.setItem(LS_SUSPENDED, JSON.stringify([...ids]));
}

function isTruthy(v: boolean | number | undefined | null): boolean {
    return v === true || v === 1;
}

type AccountStatus = 'active' | 'suspended' | 'pending';

function getAccountStatus(u: AdminUser, suspendedIds: Set<string>): AccountStatus {
    if (suspendedIds.has(u.id)) return 'suspended';
    if (u.role === 'faculty' && !isTruthy(u.verified)) return 'pending';
    return 'active';
}

function lastLoginLabel(u: AdminUser): string {
    if (u.updated_at) {
        return new Date(u.updated_at).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    }
    return '—';
}

function userMatchesSearchQuery(u: AdminUser, q: string): boolean {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const parts = [u.id, u.name, u.email, u.student_id].map((x) => String(x ?? '').toLowerCase());
    return parts.some((p) => p.includes(t));
}

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchDraft, setSearchDraft] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [courseFilter, setCourseFilter] = useState('');
    const [suspendedIds, setSuspendedIds] = useState<Set<string>>(() => readSuspended());
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [profileUser, setProfileUser] = useState<AdminUser | null>(null);
    const [editUser, setEditUser] = useState<AdminUser | null>(null);
    const [roleUser, setRoleUser] = useState<AdminUser | null>(null);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editStudentId, setEditStudentId] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState('');
    const [roleChoice, setRoleChoice] = useState('');
    const [roleSaving, setRoleSaving] = useState(false);
    const [roleError, setRoleError] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);

    const loadUsers = useCallback(async (options?: { silent?: boolean }): Promise<AdminUser[]> => {
        const silent = options?.silent === true;
        if (!silent) setLoading(true);
        try {
            const data = await getAdminUsers();
            setUsers(data);
            return data;
        } catch {
            setUsers([]);
            return [];
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadUsers();
    }, [loadUsers]);

    useEffect(() => {
        if (editUser) {
            setEditName(editUser.name ?? '');
            setEditEmail(editUser.email ?? '');
            setEditStudentId(editUser.student_id ?? '');
            setEditError('');
        }
    }, [editUser]);

    useEffect(() => {
        if (roleUser) {
            setRoleChoice(roleUser.role);
            setRoleError('');
        }
    }, [roleUser]);

    useEffect(() => {
        getCourses()
            .then(setCourses)
            .catch(() => setCourses([]));
    }, []);

    const roleOptions = useMemo(() => {
        const r = new Set<string>();
        users.forEach((u) => {
            if (u.role) r.add(u.role);
        });
        return [...r].sort();
    }, [users]);

    const sortedCourses = useMemo(
        () => [...courses].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })),
        [courses]
    );

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            if (roleFilter && u.role !== roleFilter) return false;
            if (courseFilter) {
                const links = u.linked_course_ids ?? [];
                if (!links.includes(courseFilter)) return false;
            }
            return userMatchesSearchQuery(u, searchQuery);
        });
    }, [users, searchQuery, roleFilter, courseFilter]);

    const applySearch = () => setSearchQuery(searchDraft.trim());

    const clearFilters = () => {
        setSearchDraft('');
        setSearchQuery('');
        setRoleFilter('');
        setCourseFilter('');
    };

    const hasActiveFilters = Boolean(searchQuery || roleFilter || courseFilter);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!openMenuId) return;
            const el = menuRef.current;
            if (el && !el.contains(e.target as Node)) setOpenMenuId(null);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [openMenuId]);

    const setSuspended = useCallback((userId: string, suspended: boolean) => {
        setSuspendedIds((prev) => {
            const next = new Set(prev);
            if (suspended) next.add(userId);
            else next.delete(userId);
            writeSuspended(next);
            return next;
        });
        setOpenMenuId(null);
    }, []);

    const handleDeleteUser = async (userId: string, userName: string) => {
        if (!window.confirm(`Delete the account for ${userName || userId}? This cannot be undone.`)) return;
        try {
            await deleteAdminUser(userId);
            setSuspendedIds((prev) => {
                const next = new Set(prev);
                next.delete(userId);
                writeSuspended(next);
                return next;
            });
            await loadUsers({ silent: true });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to delete user';
            alert(msg);
        }
        setOpenMenuId(null);
    };

    const syncProfileIfOpen = useCallback((userId: string, list: AdminUser[]) => {
        setProfileUser((prev) => {
            if (!prev || prev.id !== userId) return prev;
            return list.find((x) => x.id === userId) ?? prev;
        });
    }, []);

    const handleSaveEdit = async () => {
        if (!editUser) return;
        setEditSaving(true);
        setEditError('');
        try {
            await patchAdminUser(editUser.id, {
                name: editName.trim(),
                email: editEmail.trim(),
                student_id: editStudentId.trim() || null,
            });
            const list = await loadUsers({ silent: true });
            syncProfileIfOpen(editUser.id, list);
            setEditUser(null);
        } catch (err: unknown) {
            setEditError(err instanceof Error ? err.message : 'Update failed');
        } finally {
            setEditSaving(false);
        }
        setOpenMenuId(null);
    };

    const handleSaveRole = async () => {
        if (!roleUser) return;
        if (roleChoice === roleUser.role) {
            setRoleUser(null);
            setOpenMenuId(null);
            return;
        }
        setRoleSaving(true);
        setRoleError('');
        try {
            await patchAdminUser(roleUser.id, { role: roleChoice });
            const list = await loadUsers({ silent: true });
            syncProfileIfOpen(roleUser.id, list);
            setRoleUser(null);
        } catch (err: unknown) {
            setRoleError(err instanceof Error ? err.message : 'Update failed');
        } finally {
            setRoleSaving(false);
        }
        setOpenMenuId(null);
    };

    const roleBadge = (role: string) => (
        <span className="inline-flex rounded-md border border-[#7f1d1d] bg-white px-2 py-0.5 text-xs font-semibold capitalize text-[#7f1d1d]">
            {role}
        </span>
    );

    const statusBadge = (status: AccountStatus) => {
        const map = {
            active: 'um-status um-status--active',
            suspended: 'um-status um-status--suspended',
            pending: 'um-status um-status--pending',
        } as const;
        const label = status === 'active' ? 'Active' : status === 'suspended' ? 'Suspended' : 'Pending';
        return <span className={map[status]}>{label}</span>;
    };

    const stat = (
        icon: React.ReactNode,
        label: string,
        value: number | string | undefined | null,
        hint?: string
    ) => (
        <div
            className="flex gap-3 rounded-lg border border-[#7f1d1d]/30 bg-white px-3 py-2.5 shadow-sm"
            title={hint}
        >
            <div className="mt-0.5 text-[#7f1d1d]">{icon}</div>
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">{label}</p>
                <p className="text-lg font-semibold tabular-nums text-[#1e293b]">
                    {value === undefined || value === null ? '—' : value}
                </p>
            </div>
        </div>
    );

    return (
        <div className="um-page min-h-full bg-white px-4 py-4 sm:px-6 sm:py-5">
            <div className="mx-auto max-w-7xl">
                <Card className="border-[#7f1d1d]/25 bg-white p-4 shadow-sm sm:p-5">
                    {loading ? (
                        <div className="py-16 text-center text-[#64748b]">Loading users…</div>
                    ) : (
                        <>
                            <div className="um-toolbar">
                                <div className="um-toolbar-row um-toolbar-search">
                                    <label className="um-sr-only" htmlFor="um-search-input">
                                        Search by name, email, or id
                                    </label>
                                    <input
                                        id="um-search-input"
                                        type="search"
                                        className="um-search-input"
                                        placeholder="Search by name, email, or user id…"
                                        value={searchDraft}
                                        onChange={(e) => setSearchDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') applySearch();
                                        }}
                                    />
                                    <button type="button" className="um-btn-search" onClick={applySearch}>
                                        <Search size={18} strokeWidth={2.25} aria-hidden />
                                        Search
                                    </button>
                                </div>
                                <div className="um-toolbar-row um-toolbar-filters">
                                    <div className="um-filter-field">
                                        <label htmlFor="um-role-filter">Role</label>
                                        <select
                                            id="um-role-filter"
                                            className="um-select"
                                            value={roleFilter}
                                            onChange={(e) => setRoleFilter(e.target.value)}
                                        >
                                            <option value="">All roles</option>
                                            {roleOptions.map((r) => (
                                                <option key={r} value={r}>
                                                    {r}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="um-filter-field">
                                        <label htmlFor="um-course-filter">Course</label>
                                        <select
                                            id="um-course-filter"
                                            className="um-select"
                                            value={courseFilter}
                                            onChange={(e) => setCourseFilter(e.target.value)}
                                            title={
                                                sortedCourses.length === 0
                                                    ? 'No courses loaded (check permissions or try again)'
                                                    : 'Users linked as instructor, student, or TA'
                                            }
                                        >
                                            <option value="">All courses</option>
                                            {sortedCourses.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                    {c.term ? ` · ${c.term}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {hasActiveFilters && (
                                        <button type="button" className="um-btn-clear" onClick={clearFilters}>
                                            Clear filters
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="um-table-wrap overflow-x-auto">
                                <table className="um-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Name</th>
                                            <th scope="col">Email</th>
                                            <th scope="col">Role</th>
                                            <th scope="col">Status</th>
                                            <th scope="col">User ID</th>
                                            <th scope="col">Last Login</th>
                                            <th className="text-right" scope="col">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                    {filteredUsers.map((u) => {
                                        const status = getAccountStatus(u, suspendedIds);
                                        const menuOpen = openMenuId === u.id;
                                        return (
                                            <tr key={u.id}>
                                                <td>
                                                    <div className="um-user-cell">
                                                        <UserAvatar user={u} size="sm" />
                                                        <span className="font-medium text-[#1e293b]">{u.name ?? '—'}</span>
                                                    </div>
                                                </td>
                                                <td className="max-w-[12rem] truncate text-[#475569]">{u.email ?? '—'}</td>
                                                <td>{roleBadge(u.role)}</td>
                                                <td>{statusBadge(status)}</td>
                                                <td className="max-w-[14rem] font-mono text-xs text-[#475569]">{u.id}</td>
                                                <td
                                                    className="whitespace-nowrap text-xs text-[#64748b]"
                                                    title="Shown from last profile update when login is not recorded"
                                                >
                                                    {lastLoginLabel(u)}
                                                </td>
                                                <td className="text-right">
                                                    <div className="um-dropdown-wrap" ref={menuOpen ? menuRef : undefined}>
                                                        <button
                                                            type="button"
                                                            className="um-actions-trigger"
                                                            aria-expanded={menuOpen}
                                                            aria-haspopup="menu"
                                                            aria-label={`Actions for ${u.name ?? u.email}`}
                                                            onClick={() => setOpenMenuId(menuOpen ? null : u.id)}
                                                        >
                                                            <MoreHorizontal size={18} />
                                                        </button>
                                                        {menuOpen && (
                                                            <ul className="um-dropdown-menu" role="menu">
                                                                <li role="none">
                                                                    <button
                                                                        type="button"
                                                                        role="menuitem"
                                                                        className="um-dropdown-item"
                                                                        onClick={() => {
                                                                            setProfileUser(u);
                                                                            setOpenMenuId(null);
                                                                        }}
                                                                    >
                                                                        View profile
                                                                    </button>
                                                                </li>
                                                                <li role="none">
                                                                    <button
                                                                        type="button"
                                                                        role="menuitem"
                                                                        className="um-dropdown-item"
                                                                        onClick={() => {
                                                                            setEditUser(u);
                                                                            setOpenMenuId(null);
                                                                        }}
                                                                    >
                                                                        Edit user
                                                                    </button>
                                                                </li>
                                                                <li role="none">
                                                                    <button
                                                                        type="button"
                                                                        role="menuitem"
                                                                        className="um-dropdown-item"
                                                                        onClick={() => {
                                                                            setRoleUser(u);
                                                                            setOpenMenuId(null);
                                                                        }}
                                                                    >
                                                                        Change role
                                                                    </button>
                                                                </li>
                                                                <li role="none">
                                                                    <button
                                                                        type="button"
                                                                        role="menuitem"
                                                                        className="um-dropdown-item"
                                                                        onClick={() => {
                                                                            setSuspended(
                                                                                u.id,
                                                                                status !== 'suspended'
                                                                            );
                                                                        }}
                                                                    >
                                                                        {status === 'suspended'
                                                                            ? 'Activate'
                                                                            : 'Suspend'}
                                                                    </button>
                                                                </li>
                                                                <li role="none">
                                                                    <button
                                                                        type="button"
                                                                        role="menuitem"
                                                                        className="um-dropdown-item um-dropdown-item--danger"
                                                                        onClick={() =>
                                                                            handleDeleteUser(u.id, u.name ?? u.id)
                                                                        }
                                                                    >
                                                                        Delete user
                                                                    </button>
                                                                </li>
                                                            </ul>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    {!loading && users.length === 0 && (
                        <div className="py-14 text-center text-[#64748b]">No users found.</div>
                    )}
                    {!loading && users.length > 0 && filteredUsers.length === 0 && (
                        <div className="py-10 text-center text-[#64748b]">No users match your search or filters.</div>
                    )}
                </Card>
            </div>

            {profileUser && (
                <div
                    className="um-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="um-profile-title"
                >
                    <div className="um-modal">
                        <div className="um-modal-header">
                            <h2 id="um-profile-title" className="text-lg font-semibold text-[#7f1d1d]">
                                {profileUser.name ?? 'User profile'}
                            </h2>
                            <button
                                type="button"
                                className="um-modal-close"
                                onClick={() => setProfileUser(null)}
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="um-modal-body">
                            <p className="text-sm text-[#64748b]">{profileUser.email}</p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border border-[#7f1d1d]/20 bg-white p-3 text-sm">
                                    <span className="text-[#64748b]">Role</span>
                                    <p className="mt-1">{roleBadge(profileUser.role)}</p>
                                </div>
                                <div className="rounded-lg border border-[#7f1d1d]/20 bg-white p-3 text-sm">
                                    <span className="text-[#64748b]">Status</span>
                                    <p className="mt-1">
                                        {statusBadge(getAccountStatus(profileUser, suspendedIds))}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-[#7f1d1d]/20 bg-white p-3 text-sm">
                                    <span className="text-[#64748b]">Joined</span>
                                    <p className="mt-1 text-[#1e293b]">
                                        {profileUser.created_at
                                            ? new Date(profileUser.created_at).toLocaleString()
                                            : '—'}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-[#7f1d1d]/20 bg-white p-3 text-sm">
                                    <span className="text-[#64748b]">User ID</span>
                                    <p className="mt-1 break-all font-mono text-xs text-[#1e293b]">{profileUser.id}</p>
                                </div>
                            </div>
                            <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wider text-[#7f1d1d]">
                                Activity summary
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {stat(
                                    <BookOpen size={18} />,
                                    'Courses teaching',
                                    profileUser.courses_teaching,
                                    ''
                                )}
                                {stat(
                                    <GraduationCap size={18} />,
                                    'Enrollments',
                                    profileUser.enrollments_count,
                                    ''
                                )}
                                {stat(
                                    <UserCheck size={18} />,
                                    'TA courses',
                                    profileUser.ta_courses_count,
                                    ''
                                )}
                                {stat(
                                    <Send size={18} />,
                                    'Submissions',
                                    profileUser.submissions_count,
                                    ''
                                )}
                                {stat(
                                    <MessageSquare size={18} />,
                                    'Messages sent',
                                    profileUser.messages_sent,
                                    ''
                                )}
                                {stat(
                                    <Inbox size={18} />,
                                    'Inbox threads',
                                    profileUser.conversation_memberships,
                                    ''
                                )}
                                {stat(
                                    <Layers size={18} />,
                                    'Assignment groups',
                                    profileUser.group_memberships,
                                    ''
                                )}
                                {stat(
                                    <ListTodo size={18} />,
                                    'Todos',
                                    profileUser.todos_count,
                                    ''
                                )}
                                {stat(
                                    <Palette size={18} />,
                                    'Course themes',
                                    profileUser.course_settings_rows,
                                    ''
                                )}
                            </div>
                            <div className="um-modal-footer um-modal-footer--split">
                                <button
                                    type="button"
                                    className="um-btn-secondary"
                                    onClick={() => {
                                        setEditUser(profileUser);
                                        setProfileUser(null);
                                    }}
                                >
                                    Edit user
                                </button>
                                <button
                                    type="button"
                                    className="um-btn-secondary"
                                    onClick={() => {
                                        setRoleUser(profileUser);
                                        setProfileUser(null);
                                    }}
                                >
                                    Change role
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {editUser && (
                <div
                    className="um-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="um-edit-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setEditUser(null);
                    }}
                >
                    <div className="um-modal um-modal--narrow" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="um-modal-header">
                            <h2 id="um-edit-title" className="text-lg font-semibold text-[#7f1d1d]">
                                Edit user
                            </h2>
                            <button
                                type="button"
                                className="um-modal-close"
                                onClick={() => setEditUser(null)}
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="um-modal-body">
                            <p className="mb-3 text-xs text-[#64748b]">
                                User ID:{' '}
                                <span className="font-mono text-[#475569]">{editUser.id}</span>
                            </p>
                            {editError ? <p className="um-form-error">{editError}</p> : null}
                            <div className="um-form-field">
                                <label htmlFor="um-edit-name">Name</label>
                                <input
                                    id="um-edit-name"
                                    className="um-form-input"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    autoComplete="name"
                                />
                            </div>
                            <div className="um-form-field">
                                <label htmlFor="um-edit-email">Email</label>
                                <input
                                    id="um-edit-email"
                                    type="email"
                                    className="um-form-input"
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    autoComplete="email"
                                />
                            </div>
                            <div className="um-form-field">
                                <label htmlFor="um-edit-student-id">Student ID (optional)</label>
                                <input
                                    id="um-edit-student-id"
                                    className="um-form-input"
                                    value={editStudentId}
                                    onChange={(e) => setEditStudentId(e.target.value)}
                                    placeholder="Leave empty to clear"
                                />
                            </div>
                        </div>
                        <div className="um-modal-footer">
                            <button
                                type="button"
                                className="um-btn-secondary"
                                onClick={() => setEditUser(null)}
                                disabled={editSaving}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="um-btn-primary"
                                onClick={() => void handleSaveEdit()}
                                disabled={editSaving || !editName.trim() || !editEmail.trim()}
                            >
                                {editSaving ? 'Saving…' : 'Save changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {roleUser && (
                <div
                    className="um-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="um-role-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setRoleUser(null);
                    }}
                >
                    <div className="um-modal um-modal--narrow" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="um-modal-header">
                            <h2 id="um-role-title" className="text-lg font-semibold text-[#7f1d1d]">
                                Change role
                            </h2>
                            <button
                                type="button"
                                className="um-modal-close"
                                onClick={() => setRoleUser(null)}
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="um-modal-body">
                            <p className="mb-3 text-sm text-[#475569]">
                                {roleUser.name ?? roleUser.email ?? roleUser.id}
                            </p>
                            {roleError ? <p className="um-form-error">{roleError}</p> : null}
                            <div className="um-form-field">
                                <label htmlFor="um-role-select">Role</label>
                                <select
                                    id="um-role-select"
                                    className="um-form-input um-form-select"
                                    value={roleChoice}
                                    onChange={(e) => setRoleChoice(e.target.value)}
                                >
                                    {[...new Set([...ASSIGNABLE_ROLES, roleUser.role])]
                                        .sort()
                                        .map((r) => (
                                            <option key={r} value={r}>
                                                {r}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>
                        <div className="um-modal-footer">
                            <button
                                type="button"
                                className="um-btn-secondary"
                                onClick={() => setRoleUser(null)}
                                disabled={roleSaving}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="um-btn-primary"
                                onClick={() => void handleSaveRole()}
                                disabled={roleSaving}
                            >
                                {roleSaving ? 'Saving…' : 'Save role'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
