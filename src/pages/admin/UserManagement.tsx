import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { getAdminUsers, type AdminUser } from '../../lib/api';
import { ChevronLeft, Search, Users } from 'lucide-react';
import UserAvatar from '../../components/ui/UserAvatar';

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await getAdminUsers();
                if (!cancelled) setUsers(data);
            } catch {
                if (!cancelled) setUsers([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const filtered = users.filter(
        u =>
            !search.trim() ||
            u.name?.toLowerCase().includes(search.trim().toLowerCase()) ||
            u.email?.toLowerCase().includes(search.trim().toLowerCase()) ||
            u.id?.toLowerCase().includes(search.trim().toLowerCase()) ||
            u.role?.toLowerCase().includes(search.trim().toLowerCase())
    );

    const roleBadge = (role: string) => {
        const c =
            role === 'admin' ? 'bg-red-900/60 text-red-200' :
            role === 'faculty' ? 'bg-amber-900/60 text-amber-200' :
            role === 'ta' ? 'bg-sky-900/60 text-sky-200' :
            'bg-slate-700 text-slate-200';
        return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${c}`}>{role}</span>;
    };

    return (
        <div className="min-h-full bg-slate-950/95 text-slate-50 px-6 py-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Link
                        to="/admin"
                        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
                    >
                        <ChevronLeft size={18} /> Back to Dashboard
                    </Link>
                </div>
                <header className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-slate-800 p-2">
                            <Users size={24} className="text-red-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-50">User Management</h1>
                            <p className="text-sm text-slate-400">View and manage all user accounts</p>
                        </div>
                    </div>
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search by name, email, ID, role..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-64 rounded-lg border border-slate-700 bg-slate-900/80 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                        />
                    </div>
                </header>

                <Card className="bg-slate-900/70 border-slate-800 overflow-hidden">
                    {loading ? (
                        <div className="py-12 text-center text-slate-400">Loading users...</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-400 border-b border-slate-700">
                                        <th className="pb-3 pr-4 font-medium">Name</th>
                                        <th className="pb-3 pr-4 font-medium">Email</th>
                                        <th className="pb-3 pr-4 font-medium">ID</th>
                                        <th className="pb-3 pr-4 font-medium">Role</th>
                                        <th className="pb-3 pr-4 font-medium">Verified</th>
                                        <th className="pb-3 font-medium">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(u => (
                                        <tr key={u.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                            <td className="py-3 pr-4 text-slate-200">
                                                <div className="flex items-center gap-3">
                                                    <UserAvatar user={u as any} size={28} />
                                                    <span>{u.name ?? '—'}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 pr-4 text-slate-300">{u.email ?? '—'}</td>
                                            <td className="py-3 pr-4 text-slate-400 font-mono text-xs">{u.id}</td>
                                            <td className="py-3 pr-4">{roleBadge(u.role)}</td>
                                            <td className="py-3 pr-4">
                                                {u.role === 'faculty'
                                                    ? (u.verified ? <span className="text-emerald-400">Yes</span> : <span className="text-amber-400">Pending</span>)
                                                    : '—'}
                                            </td>
                                            <td className="py-3 text-slate-500 text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!loading && filtered.length === 0 && (
                        <div className="py-12 text-center text-slate-500">No users match your search.</div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default UserManagement;
