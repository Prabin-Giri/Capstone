import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { getStudentInsights, type StudentInsight } from '../../lib/api';
import { ChevronLeft, Search, GraduationCap } from 'lucide-react';

const StudentInsights: React.FC = () => {
    const [students, setStudents] = useState<StudentInsight[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await getStudentInsights();
                if (!cancelled) setStudents(data);
            } catch {
                if (!cancelled) setStudents([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const filtered = students.filter(
        s =>
            !search.trim() ||
            s.name?.toLowerCase().includes(search.trim().toLowerCase()) ||
            s.email?.toLowerCase().includes(search.trim().toLowerCase()) ||
            s.id?.toLowerCase().includes(search.trim().toLowerCase())
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
                            <GraduationCap size={24} className="text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-50">Student Insights</h1>
                            <p className="text-sm text-slate-400">Enrollment and submission activity by student</p>
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

                <Card className="bg-slate-900/70 border-slate-800 overflow-hidden">
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
                                        <th className="pb-3 pr-4 font-medium">Courses</th>
                                        <th className="pb-3 pr-4 font-medium">Submissions</th>
                                        <th className="pb-3 font-medium">Graded</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(s => (
                                        <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                            <td className="py-3 pr-4 text-slate-200">{s.name ?? '—'}</td>
                                            <td className="py-3 pr-4 text-slate-300">{s.email ?? '—'}</td>
                                            <td className="py-3 pr-4 text-slate-400 font-mono text-xs">{s.id}</td>
                                            <td className="py-3 pr-4 text-slate-200">{s.courses_enrolled}</td>
                                            <td className="py-3 pr-4 text-slate-200">{s.submissions_count}</td>
                                            <td className="py-3 text-slate-200">{s.graded_count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!loading && filtered.length === 0 && (
                        <div className="py-12 text-center text-slate-500">No students match your search.</div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default StudentInsights;
