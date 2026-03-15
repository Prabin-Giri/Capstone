import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
    adminGetUsers,
    adminGetCourses,
    adminUpdateUserRole,
    adminResetPassword,
    adminBulkImportUsers,
    adminBulkUpdateRole,
    type User,
    type AdminCourse,
} from '../../lib/api';
import { ArrowLeft, Search, RefreshCw, Key, Upload, Filter } from 'lucide-react';
import './DatabaseExplorer.css';

const ROLES = ['student', 'faculty', 'ta', 'user', 'admin'] as const;

const UserManagement: React.FC = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [courses, setCourses] = useState<AdminCourse[]>([]);
    const [loading, setLoading] = useState(true);
    const [roleFilter, setRoleFilter] = useState<string>('');
    const [search, setSearch] = useState('');
    const [courseFilter, setCourseFilter] = useState<string>('');
    const [taCourseFilter, setTaCourseFilter] = useState<string>('');
    const [instructorOnly, setInstructorOnly] = useState(false);
    const [noRole, setNoRole] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [resetUserId, setResetUserId] = useState<string | null>(null);
    const [resetPassword, setResetPassword] = useState('');
    const [roleEditId, setRoleEditId] = useState<string | null>(null);
    const [roleEditValue, setRoleEditValue] = useState<string>('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkRole, setBulkRole] = useState('');
    const [bulkCsv, setBulkCsv] = useState('');
    const [showBulkImport, setShowBulkImport] = useState(false);
    const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const list = await adminGetUsers({
                role: roleFilter || undefined,
                q: search.trim() || undefined,
                courseId: courseFilter || undefined,
                taCourseId: taCourseFilter || undefined,
                instructorOnly: instructorOnly || undefined,
                noRole: noRole || undefined,
            });
            setUsers(list);
        } catch (err) {
            console.error(err);
            setMessage('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const loadCourses = async () => {
        try {
            const list = await adminGetCourses();
            setCourses(list);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        loadCourses();
    }, []);

    useEffect(() => {
        loadUsers();
    }, [roleFilter, courseFilter, taCourseFilter, instructorOnly, noRole]);

    const clearFilters = () => {
        setRoleFilter('');
        setSearch('');
        setCourseFilter('');
        setTaCourseFilter('');
        setInstructorOnly(false);
        setNoRole(false);
    };

    const handleSearch = () => loadUsers();

    const handleRoleChange = async (userId: string, role: string) => {
        try {
            await adminUpdateUserRole(userId, role);
            setMessage(`Role updated to ${role}`);
            setRoleEditId(null);
            loadUsers();
        } catch (err: any) {
            setMessage(err.message || 'Failed to update role');
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetUserId || !resetPassword.trim()) return;
        if (resetPassword.length < 6) {
            setMessage('Password must be at least 6 characters');
            return;
        }
        try {
            await adminResetPassword(resetUserId, resetPassword);
            setMessage('Password reset successfully');
            setResetUserId(null);
            setResetPassword('');
        } catch (err: any) {
            setMessage(err.message || 'Failed to reset password');
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === users.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(users.map(u => u.id)));
    };

    const handleBulkRole = async () => {
        if (!bulkRole || selectedIds.size === 0) {
            setMessage('Select users and choose a role');
            return;
        }
        try {
            const res = await adminBulkUpdateRole(Array.from(selectedIds), bulkRole);
            setMessage(res.message);
            setSelectedIds(new Set());
            loadUsers();
        } catch (err: any) {
            setMessage(err.message || 'Bulk update failed');
        }
    };

    const parseCsv = (text: string): { name: string; email: string; password?: string; role?: string }[] => {
        const lines = text.trim().split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) return [];
        const header = lines[0].toLowerCase().split(',').map(s => s.trim());
        const nameIdx = header.findIndex(h => h === 'name');
        const emailIdx = header.findIndex(h => h === 'email' || h === 'e-mail');
        const passIdx = header.findIndex(h => h === 'password' || h === 'pass');
        const roleIdx = header.findIndex(h => h === 'role');
        if (emailIdx === -1) return [];
        const out: { name: string; email: string; password?: string; role?: string }[] = [];
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',').map(s => s.trim());
            const email = cells[emailIdx] || '';
            const name = (nameIdx >= 0 ? cells[nameIdx] : email) || '';
            if (!email) continue;
            out.push({
                name,
                email,
                password: passIdx >= 0 ? cells[passIdx] : undefined,
                role: roleIdx >= 0 && ROLES.includes(cells[roleIdx] as any) ? cells[roleIdx] : undefined,
            });
        }
        return out;
    };

    const handleBulkImport = async () => {
        const parsed = parseCsv(bulkCsv);
        if (parsed.length === 0) {
            setMessage('Paste CSV with header: name, email [, password, role]');
            return;
        }
        try {
            const res = await adminBulkImportUsers(parsed);
            setImportResult({
                created: res.created.length,
                skipped: res.skipped.length,
                errors: res.errors.length,
            });
            setMessage(`Created: ${res.created.length}, Skipped: ${res.skipped.length}, Errors: ${res.errors.length}`);
            setBulkCsv('');
            loadUsers();
        } catch (err: any) {
            setMessage(err.message || 'Import failed');
        }
    };

    return (
        <div className="db-content">
            <div className="table-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
                    <ArrowLeft size={18} /> Back
                </Button>
                <div>
                    <h1>User Management</h1>
                    <p className="row-count">Change roles, reset passwords, bulk import.</p>
                </div>
            </div>

            {message && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-surface)', borderRadius: '8px', color: 'var(--text-secondary)' }}>
                    {message}
                </div>
            )}

            <Card className="admin-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <h4 className="admin-card-title" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Filter size={16} /> Filters
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                        <span>Role</span>
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            style={{ padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                        >
                            <option value="">All roles</option>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                        <span>Enrolled in course</span>
                        <select
                            value={courseFilter}
                            onChange={(e) => setCourseFilter(e.target.value)}
                            style={{ padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', minWidth: '180px' }}
                        >
                            <option value="">Any</option>
                            {courses.map(c => (
                                <option key={c.id} value={c.id}>{c.id} — {c.name}</option>
                            ))}
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                        <span>TA for course</span>
                        <select
                            value={taCourseFilter}
                            onChange={(e) => setTaCourseFilter(e.target.value)}
                            style={{ padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', minWidth: '180px' }}
                        >
                            <option value="">Any</option>
                            {courses.map(c => (
                                <option key={c.id} value={c.id}>{c.id} — {c.name}</option>
                            ))}
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={instructorOnly} onChange={(e) => setInstructorOnly(e.target.checked)} />
                        Instructor only
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={noRole} onChange={(e) => setNoRole(e.target.checked)} />
                        No role
                    </label>
                    <div style={{ flex: 1, minWidth: '200px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Search name, email, id..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            style={{ padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: 0 }}
                        />
                        <Button size="sm" onClick={handleSearch}><Search size={16} /> Search</Button>
                    </div>
                    <Button size="sm" variant="ghost" onClick={loadUsers}><RefreshCw size={16} /> Refresh</Button>
                    <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                    <Button size="sm" variant="secondary" onClick={() => setShowBulkImport(!showBulkImport)}>
                        <Upload size={16} /> Bulk import
                    </Button>
                </div>
            </Card>

            {showBulkImport && (
                <Card className="admin-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                    <h4 className="admin-card-title">Bulk import (CSV)</h4>
                    <p className="admin-muted">Header: name, email [, password, role]. One row per user.</p>
                    <textarea
                        value={bulkCsv}
                        onChange={(e) => setBulkCsv(e.target.value)}
                        placeholder="name,email,password,role&#10;John,john@edu.com,pass123,student"
                        rows={4}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                    <div style={{ marginTop: '0.5rem' }}>
                        <Button size="sm" onClick={handleBulkImport}>Import</Button>
                        {importResult && <span style={{ marginLeft: '1rem', fontSize: '0.85rem' }}>Created: {importResult.created}, Skipped: {importResult.skipped}, Errors: {importResult.errors}</span>}
                    </div>
                </Card>
            )}

            {selectedIds.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <span className="admin-muted">{selectedIds.size} selected</span>
                    <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                        <option value="">Set role to...</option>
                        {ROLES.filter(r => r !== 'admin').map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <Button size="sm" onClick={handleBulkRole} disabled={!bulkRole}>Apply role</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                </div>
            )}

            <Card className="admin-card" style={{ overflow: 'auto' }}>
                {loading ? (
                    <p className="admin-muted">Loading users...</p>
                ) : (
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}><input type="checkbox" checked={users.length > 0 && selectedIds.size === users.length} onChange={toggleSelectAll} /></th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>ID</th>
                                <th>Role</th>
                                <th style={{ width: '120px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id}>
                                    <td><input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)} /></td>
                                    <td>{u.name}</td>
                                    <td>{u.email}</td>
                                    <td><code style={{ fontSize: '0.8rem' }}>{u.id}</code></td>
                                    <td>
                                        {roleEditId === u.id ? (
                                            <select
                                                value={roleEditValue}
                                                onChange={(e) => setRoleEditValue(e.target.value)}
                                                onBlur={() => roleEditValue && roleEditValue !== u.role && handleRoleChange(u.id, roleEditValue)}
                                                autoFocus
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                                            >
                                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        ) : (
                                            <span onClick={() => { setRoleEditId(u.id); setRoleEditValue(u.role || 'user'); }} style={{ cursor: 'pointer', textDecoration: 'underline' }}>{u.role || '—'}</span>
                                        )}
                                    </td>
                                    <td>
                                        <button type="button" className="icon-btn" onClick={() => { setResetUserId(u.id); setResetPassword(''); }} title="Reset password"><Key size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Card>

            {resetUserId && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setResetUserId(null)}>
                    <Card style={{ padding: '1.5rem', minWidth: '320px' }} onClick={e => e.stopPropagation()}>
                        <h4>Reset password</h4>
                        <form onSubmit={handleResetPassword}>
                            <input type="password" placeholder="New password (min 6)" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} required minLength={6} style={{ width: '100%', padding: '0.5rem', marginTop: '0.5rem' }} />
                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                                <Button type="submit" size="sm">Reset</Button>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setResetUserId(null)}>Cancel</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
