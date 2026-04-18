import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import {
    getAdminAnalytics,
    getAdminActivityLog,
    getAdminActiveUsers,
    getAdminLoginAudit,
    type AdminAnalytics,
    type ActivityLogRow,
    type ActiveUserRow,
    type LoginAuditRow,
} from '../../lib/api';
import { ChevronLeft, BarChart2, Users, BookOpen, FileQuestion, Send, UserPlus, Shield } from 'lucide-react';

function formatDt(iso?: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        return String(iso);
    }
}

const AppAnalytics: React.FC = () => {
    const [data, setData] = useState<AdminAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [activity, setActivity] = useState<ActivityLogRow[]>([]);
    const [activeUsers, setActiveUsers] = useState<ActiveUserRow[]>([]);
    const [loginAudit, setLoginAudit] = useState<LoginAuditRow[]>([]);
    const [loginFilter, setLoginFilter] = useState<'all' | 'failed' | 'unknown'>('all');
    const [secLoading, setSecLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const d = await getAdminAnalytics();
                if (!cancelled) setData(d);
            } catch {
                if (!cancelled) setData(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setSecLoading(true);
        (async () => {
            try {
                const [act, active, log] = await Promise.all([
                    getAdminActivityLog({ limit: 120 }),
                    getAdminActiveUsers(),
                    getAdminLoginAudit({ limit: 150, filter: loginFilter }),
                ]);
                if (!cancelled) {
                    setActivity(act);
                    setActiveUsers(active);
                    setLoginAudit(log);
                }
            } catch {
                if (!cancelled) {
                    setActivity([]);
                    setActiveUsers([]);
                    setLoginAudit([]);
                }
            } finally {
                if (!cancelled) setSecLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [loginFilter]);

    const cards = data
        ? [
              { label: 'Total Users', value: data.totalUsers, icon: Users, color: 'from-red-600/20 to-rose-600/20', border: 'border-red-500/30' },
              { label: 'Total Courses', value: data.totalCourses, icon: BookOpen, color: 'from-amber-600/20 to-orange-600/20', border: 'border-amber-500/30' },
              { label: 'Total Assignments', value: data.totalAssignments, icon: FileQuestion, color: 'from-emerald-600/20 to-teal-600/20', border: 'border-emerald-500/30' },
              { label: 'Total Submissions', value: data.totalSubmissions, icon: Send, color: 'from-sky-600/20 to-blue-600/20', border: 'border-sky-500/30' },
              { label: 'Total Enrollments', value: data.totalEnrollments, icon: UserPlus, color: 'from-violet-600/20 to-purple-600/20', border: 'border-violet-500/30' },
          ]
        : [];

    return (
        <div className="min-h-full bg-slate-950/95 text-slate-50 px-6 py-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div>
                    <div className="breadcrumb">
                        <Link to="/admin">
                            <ChevronLeft size={14} />
                            Back to Dashboard
                        </Link>
                    </div>
                </div>
                <header className="flex items-center gap-3">
                    <div className="rounded-lg bg-slate-800 p-2">
                        <BarChart2 size={24} className="text-sky-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-50">App Analytics</h1>
                        <p className="text-sm text-slate-400">Platform metrics, activity, and sign-in security</p>
                    </div>
                </header>

                {loading ? (
                    <div className="py-12 text-center text-slate-400">Loading analytics...</div>
                ) : data ? (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                            {cards.map(({ label, value, icon: Icon, color, border }) => (
                                <Card key={label} className={`bg-slate-900/70 border-slate-800 border bg-gradient-to-br ${color} ${border}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
                                            <p className="mt-1 text-2xl font-bold text-slate-50">{value}</p>
                                        </div>
                                        <div className="rounded-lg bg-slate-800/80 p-2">
                                            <Icon size={20} className="text-slate-300" />
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>

                        {data.users && Object.keys(data.users).length > 0 && (
                            <Card className="bg-slate-900/70 border-slate-800">
                                <h2 className="text-lg font-semibold text-slate-50 mb-4">Users by role</h2>
                                <div className="space-y-3">
                                    {Object.entries(data.users).map(([role, count]) => (
                                        <div key={role} className="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-3">
                                            <span className="capitalize text-slate-200">{role}</span>
                                            <span className="font-semibold text-slate-50">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        <Card className="bg-slate-900/70 border-slate-800">
                            <div className="flex items-center gap-2 mb-3">
                                <Shield size={18} className="text-amber-400" />
                                <h2 className="text-lg font-semibold text-slate-50">Activity log</h2>
                            </div>
                            <p className="text-xs text-slate-500 mb-3">Recent platform events (e.g. successful logins). IP shown when available.</p>
                            {secLoading ? (
                                <p className="text-slate-500 text-sm">Loading…</p>
                            ) : activity.length === 0 ? (
                                <p className="text-slate-500 text-sm">No activity rows yet.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-72 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-slate-800/95 text-left text-slate-400">
                                            <tr>
                                                <th className="px-3 py-2">When</th>
                                                <th className="px-3 py-2">User</th>
                                                <th className="px-3 py-2">Action</th>
                                                <th className="px-3 py-2">IP</th>
                                                <th className="px-3 py-2">Detail</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activity.map((a) => (
                                                <tr key={a.id} className="border-t border-slate-800/80">
                                                    <td className="px-3 py-2 whitespace-nowrap text-slate-300">{formatDt(a.createdAt)}</td>
                                                    <td className="px-3 py-2 text-slate-200">
                                                        {a.userName || a.userId || '—'}
                                                        {a.userEmail ? <span className="block text-xs text-slate-500">{a.userEmail}</span> : null}
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-300">{a.action}</td>
                                                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{a.ip || '—'}</td>
                                                    <td className="px-3 py-2 text-slate-500 text-xs max-w-xs truncate" title={a.detail || ''}>
                                                        {a.detail || '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>

                        <Card className="bg-slate-900/70 border-slate-800">
                            <h2 className="text-lg font-semibold text-slate-50 mb-2">Active users</h2>
                            <p className="text-xs text-slate-500 mb-3">
                                Users with a recent successful login (window set in App Settings). IP is recorded on login.
                            </p>
                            {secLoading ? (
                                <p className="text-slate-500 text-sm">Loading…</p>
                            ) : activeUsers.length === 0 ? (
                                <p className="text-slate-500 text-sm">No users in the active window.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-800">
                                    <table className="w-full text-sm">
                                        <thead className="text-left text-slate-400 border-b border-slate-800">
                                            <tr>
                                                <th className="px-3 py-2">Name</th>
                                                <th className="px-3 py-2">Email</th>
                                                <th className="px-3 py-2">Role</th>
                                                <th className="px-3 py-2">Last seen</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeUsers.map((u) => (
                                                <tr key={u.id} className="border-t border-slate-800/80">
                                                    <td className="px-3 py-2 text-slate-200">{u.name}</td>
                                                    <td className="px-3 py-2 text-slate-400">{u.email}</td>
                                                    <td className="px-3 py-2 capitalize text-slate-300">{u.role}</td>
                                                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatDt(u.lastSeenAt)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>

                        <Card className="bg-slate-900/70 border-slate-800">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-50">Login attempts</h2>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Failed logins include wrong password; unknown email means no account for that address. IP from each attempt.
                                    </p>
                                </div>
                                <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
                                    {(['all', 'failed', 'unknown'] as const).map((f) => (
                                        <button
                                            key={f}
                                            type="button"
                                            className={`px-3 py-1.5 capitalize ${
                                                loginFilter === f ? 'bg-slate-700 text-white' : 'bg-slate-900/50 text-slate-400 hover:bg-slate-800'
                                            }`}
                                            onClick={() => setLoginFilter(f)}
                                        >
                                            {f === 'unknown' ? 'Unknown email' : f}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {secLoading ? (
                                <p className="text-slate-500 text-sm">Loading…</p>
                            ) : loginAudit.length === 0 ? (
                                <p className="text-slate-500 text-sm">No login attempts in this view.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-80 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-slate-800/95 text-left text-slate-400">
                                            <tr>
                                                <th className="px-3 py-2">When</th>
                                                <th className="px-3 py-2">Email</th>
                                                <th className="px-3 py-2">Outcome</th>
                                                <th className="px-3 py-2">Reason</th>
                                                <th className="px-3 py-2">IP</th>
                                                <th className="px-3 py-2">Client</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loginAudit.map((r) => (
                                                <tr key={r.id} className="border-t border-slate-800/80">
                                                    <td className="px-3 py-2 whitespace-nowrap text-slate-300">{formatDt(r.createdAt)}</td>
                                                    <td className="px-3 py-2 text-slate-200">{r.email}</td>
                                                    <td className="px-3 py-2">
                                                        <span
                                                            className={
                                                                r.outcome === 'success'
                                                                    ? 'text-emerald-400'
                                                                    : r.reason === 'unknown_user'
                                                                      ? 'text-amber-400'
                                                                      : 'text-rose-400'
                                                            }
                                                        >
                                                            {r.outcome}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-400 text-xs">{r.reason || '—'}</td>
                                                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.ip || '—'}</td>
                                                    <td className="px-3 py-2 text-slate-500 text-xs max-w-[200px] truncate" title={r.userAgent || ''}>
                                                        {r.userAgent || '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    </>
                ) : (
                    <Card className="bg-slate-900/70 border-slate-800">
                        <div className="py-12 text-center text-slate-500">Failed to load analytics.</div>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default AppAnalytics;
