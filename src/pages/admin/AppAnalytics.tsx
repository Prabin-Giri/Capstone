import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { getAdminAnalytics, type AdminAnalytics } from '../../lib/api';
import { ChevronLeft, BarChart2, Users, BookOpen, FileQuestion, Send, UserPlus } from 'lucide-react';

const AppAnalytics: React.FC = () => {
    const [data, setData] = useState<AdminAnalytics | null>(null);
    const [loading, setLoading] = useState(true);

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
        return () => { cancelled = true; };
    }, []);

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
                    <Link
                        to="/admin"
                        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
                    >
                        <ChevronLeft size={18} /> Back to Dashboard
                    </Link>
                </div>
                <header className="flex items-center gap-3">
                    <div className="rounded-lg bg-slate-800 p-2">
                        <BarChart2 size={24} className="text-sky-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-50">App Analytics</h1>
                        <p className="text-sm text-slate-400">Platform-wide usage and activity metrics</p>
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
