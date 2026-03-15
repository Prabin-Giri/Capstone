import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { getAdminFaculty, getPendingFaculty, verifyFaculty, type AdminFaculty, type PendingFaculty } from '../../lib/api';
import { ChevronLeft, Search, UserCheck, CheckCircle } from 'lucide-react';

const FacultyManagement: React.FC = () => {
    const [faculty, setFaculty] = useState<AdminFaculty[]>([]);
    const [pending, setPending] = useState<PendingFaculty[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [verifyingId, setVerifyingId] = useState<string | null>(null);

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
            setPending(prev => prev.filter(f => f.id !== id));
            await load();
        } finally {
            setVerifyingId(null);
        }
    };

    const filtered = faculty.filter(
        f =>
            !search.trim() ||
            f.name?.toLowerCase().includes(search.trim().toLowerCase()) ||
            f.email?.toLowerCase().includes(search.trim().toLowerCase()) ||
            f.id?.toLowerCase().includes(search.trim().toLowerCase())
    );

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
                <header className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-slate-800 p-2">
                            <UserCheck size={24} className="text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-50">Faculty Management</h1>
                            <p className="text-sm text-slate-400">Verify faculty and view course ownership</p>
                        </div>
                    </div>
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search by name, email, ID..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-64 rounded-lg border border-slate-700 bg-slate-900/80 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                        />
                    </div>
                </header>

                {pending.length > 0 && (
                    <Card className="bg-slate-900/70 border-slate-800 border-amber-500/30">
                        <h2 className="text-lg font-semibold text-slate-50 mb-3 flex items-center gap-2">
                            <CheckCircle size={20} className="text-amber-400" /> Pending verification
                        </h2>
                        <p className="text-sm text-slate-400 mb-4">Approve these faculty accounts to grant dashboard access.</p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-400 border-b border-slate-700">
                                        <th className="pb-2 pr-4">Name</th>
                                        <th className="pb-2 pr-4">Email</th>
                                        <th className="pb-2">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pending.map(f => (
                                        <tr key={f.id} className="border-b border-slate-800">
                                            <td className="py-2 pr-4 text-slate-200">{f.name}</td>
                                            <td className="py-2 pr-4 text-slate-300">{f.email}</td>
                                            <td className="py-2">
                                                <button
                                                    onClick={() => handleVerify(f.id)}
                                                    disabled={verifyingId === f.id}
                                                    className="inline-flex items-center rounded-md bg-amber-600 hover:bg-amber-500 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                                                >
                                                    {verifyingId === f.id ? 'Verifying...' : 'Verify'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}

                <Card className="bg-slate-900/70 border-slate-800 overflow-hidden">
                    <h2 className="text-lg font-semibold text-slate-50 mb-4 px-4 pt-4">All faculty</h2>
                    {loading ? (
                        <div className="py-12 text-center text-slate-400">Loading...</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-400 border-b border-slate-700">
                                        <th className="pb-3 pr-4 font-medium">Name</th>
                                        <th className="pb-3 pr-4 font-medium">Email</th>
                                        <th className="pb-3 pr-4 font-medium">ID</th>
                                        <th className="pb-3 pr-4 font-medium">Status</th>
                                        <th className="pb-3 pr-4 font-medium">Courses</th>
                                        <th className="pb-3 font-medium">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(f => (
                                        <tr key={f.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                            <td className="py-3 pr-4 text-slate-200">{f.name ?? '—'}</td>
                                            <td className="py-3 pr-4 text-slate-300">{f.email ?? '—'}</td>
                                            <td className="py-3 pr-4 text-slate-400 font-mono text-xs">{f.id}</td>
                                            <td className="py-3 pr-4">
                                                {f.verified ? <span className="text-emerald-400">Verified</span> : <span className="text-amber-400">Pending</span>}
                                            </td>
                                            <td className="py-3 pr-4 text-slate-200">{f.course_count ?? 0}</td>
                                            <td className="py-3 text-slate-500 text-xs">{f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!loading && filtered.length === 0 && (
                        <div className="py-12 text-center text-slate-500">No faculty match your search.</div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default FacultyManagement;
