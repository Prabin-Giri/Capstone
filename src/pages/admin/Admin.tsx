import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Users, GraduationCap, UserCheck, BarChart2, Settings, BookOpen } from 'lucide-react';
import { getPendingFaculty, verifyFaculty, type PendingFaculty } from '../../lib/api';
import './Admin.css';

const Admin: React.FC = () => {
    const navigate = useNavigate();
    const [pendingFaculty, setPendingFaculty] = useState<PendingFaculty[]>([]);
    const [verifyingId, setVerifyingId] = useState<string | null>(null);

    useEffect(() => {
        const prevTitle = document.title;
        document.title = 'Admin Dashboard · Agnos';
        return () => {
            document.title = prevTitle;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const list = await getPendingFaculty();
                if (!cancelled) setPendingFaculty(list);
            } catch {
                if (!cancelled) setPendingFaculty([]);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleVerify = async (id: string) => {
        setVerifyingId(id);
        try {
            await verifyFaculty(id);
            setPendingFaculty((prev) => prev.filter((f) => f.id !== id));
        } catch {
            // keep list as is
        } finally {
            setVerifyingId(null);
        }
    };

    const sections = [
        { id: 'db', title: 'Database Explorer', path: '/admin/database', icon: Database },
        { id: 'users', title: 'User Management', path: '/admin/users', icon: Users },
        { id: 'students', title: 'Student Insights', path: '/admin/students', icon: GraduationCap },
        { id: 'faculty', title: 'Faculty Management', path: '/admin/faculty', icon: UserCheck },
        { id: 'analytics', title: 'App Analytics', path: '/admin/analytics', icon: BarChart2 },
        { id: 'settings', title: 'App Settings', path: '/admin/settings', icon: Settings },
        { id: 'courses', title: 'Course Management', path: '/admin/courses', icon: BookOpen },
    ];

    return (
        <div className="admin-page">
            <div className="admin-bg-orb admin-bg-orb-1" aria-hidden />
            <div className="admin-bg-orb admin-bg-orb-2" aria-hidden />
            <div className="admin-bg-orb admin-bg-orb-3" aria-hidden />

            <div className="max-w-6xl mx-auto">
                {pendingFaculty.length > 0 && (
                    <div className="admin-pending-wrap">
                        <div className="admin-pending-card">
                            <h2 className="text-lg font-semibold text-slate-50 mb-2">Pending faculty verification</h2>
                            <p className="text-sm text-slate-400 mb-4">These accounts signed up as faculty and need your approval before they can access the dashboard and enroll students in their courses.</p>
                            <div className="overflow-x-auto rounded-xl border border-slate-700/50 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-slate-400 border-b border-slate-700 bg-slate-800/50">
                                            <th className="pb-2.5 pt-2 px-4">Name</th>
                                            <th className="pb-2.5 pt-2 px-4">Email</th>
                                            <th className="pb-2.5 pt-2 px-4">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingFaculty.map((f) => (
                                            <tr key={f.id} className="border-b border-slate-800/80 hover:bg-slate-800/30 transition-colors">
                                                <td className="py-2.5 px-4 text-slate-200">{f.name}</td>
                                                <td className="py-2.5 px-4 text-slate-300">{f.email}</td>
                                                <td className="py-2.5 px-4">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleVerify(f.id); }}
                                                        disabled={verifyingId === f.id}
                                                        className="admin-verify-btn inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 transition-colors"
                                                    >
                                                        {verifyingId === f.id ? 'Verifying...' : 'Verify'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                <section className="admin-bubbles">
                    {sections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <button
                                key={section.id}
                                type="button"
                                className="admin-bubble"
                                onClick={() => navigate(section.path)}
                            >
                                <div className="admin-bubble-icon-wrap" aria-hidden>
                                    <Icon size={22} strokeWidth={2.2} />
                                </div>
                                <h2 className="admin-bubble-title">{section.title}</h2>
                            </button>
                        );
                    })}
                </section>
            </div>
        </div>
    );
};

export default Admin;

