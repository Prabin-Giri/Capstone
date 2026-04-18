import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Users, GraduationCap, UserCheck, BarChart2, Settings, BookOpen, ChevronRight, type LucideIcon } from 'lucide-react';
import { getPendingFaculty, verifyFaculty, type PendingFaculty } from '../../lib/api';
import '../../components/ui/components.css';
import './Admin.css';

type AdminNavStat = { value: string | number; label: string };

type AdminSection = {
    id: string;
    title: string;
    path: string;
    icon: LucideIcon;
    badge: string;
    subtitle: string;
    statLeft: AdminNavStat;
    statRight: AdminNavStat;
};

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

    const sections: AdminSection[] = [
        {
            id: 'db',
            title: 'Database Explorer',
            path: '/admin/database',
            icon: Database,
            badge: 'DB',
            subtitle: 'Browse schema & run queries',
            statLeft: { value: 1, label: 'Console' },
            statRight: { value: '—', label: 'Instances' },
        },
        {
            id: 'users',
            title: 'User Management',
            path: '/admin/users',
            icon: Users,
            badge: 'USERS',
            subtitle: 'Accounts, roles & access',
            statLeft: { value: '—', label: 'Accounts' },
            statRight: { value: '—', label: 'Roles' },
        },
        {
            id: 'students',
            title: 'Student Insights',
            path: '/admin/students',
            icon: GraduationCap,
            badge: 'STU',
            subtitle: 'Cohorts & enrollment',
            statLeft: { value: '—', label: 'Cohorts' },
            statRight: { value: '—', label: 'Reports' },
        },
        {
            id: 'faculty',
            title: 'Faculty Management',
            path: '/admin/faculty',
            icon: UserCheck,
            badge: 'FAC',
            subtitle: 'Verify & manage faculty',
            statLeft: { value: pendingFaculty.length, label: 'Pending' },
            statRight: { value: '—', label: 'Review' },
        },
        {
            id: 'analytics',
            title: 'App Analytics',
            path: '/admin/analytics',
            icon: BarChart2,
            badge: 'ANLY',
            subtitle: 'Usage & performance',
            statLeft: { value: '—', label: 'Metrics' },
            statRight: { value: '—', label: 'Export' },
        },
        {
            id: 'settings',
            title: 'App Settings',
            path: '/admin/settings',
            icon: Settings,
            badge: 'CFG',
            subtitle: 'Global configuration',
            statLeft: { value: '—', label: 'Options' },
            statRight: { value: '—', label: 'Policies' },
        },
        {
            id: 'courses',
            title: 'Course Management',
            path: '/admin/courses',
            icon: BookOpen,
            badge: 'CRS',
            subtitle: 'Catalog & sections',
            statLeft: { value: '—', label: 'Catalog' },
            statRight: { value: '—', label: 'Terms' },
        },
    ];

    return (
        <div className="admin-page">
            <div className="admin-bg-orb admin-bg-orb-1" aria-hidden />
            <div className="admin-bg-orb admin-bg-orb-2" aria-hidden />
            <div className="admin-bg-orb admin-bg-orb-3" aria-hidden />

            <div className="max-w-6xl mx-auto">
                {pendingFaculty.length > 0 && (
                    <div className="admin-pending-wrap">
                        <div className="course-card-premium admin-card-static">
                            <div className="course-card-header">
                                <div>
                                    <h2 className="course-title-display">Pending faculty verification</h2>
                                    <p className="course-term">
                                        Approve signups before they can use the faculty dashboard and enroll students.
                                    </p>
                                </div>
                                <div className="admin-card-header-actions">
                                    <span className="tag-pill">PENDING</span>
                                </div>
                            </div>
                            <div className="admin-pending-table-outer">
                                <div className="overflow-x-auto admin-pending-table-scroll">
                                    <table className="admin-pending-table w-full text-sm">
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Email</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pendingFaculty.map((f) => (
                                                <tr key={f.id}>
                                                    <td>{f.name}</td>
                                                    <td>{f.email}</td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleVerify(f.id)}
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
                            <div className="course-stats-display">
                                <div className="stat-item">
                                    <span className="stat-v">{pendingFaculty.length}</span>
                                    <span className="stat-label">In queue</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-v">1</span>
                                    <span className="stat-label">Action</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <section className="dashboard-grid admin-dashboard-grid">
                    {sections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <button
                                key={section.id}
                                type="button"
                                className="course-card-premium admin-nav-card cursor-pointer"
                                onClick={() => navigate(section.path)}
                            >
                                <div className="course-card-header">
                                    <div>
                                        <h3 className="course-title-display">{section.title}</h3>
                                        <p className="course-term">{section.subtitle}</p>
                                    </div>
                                    <div className="admin-card-header-actions">
                                        <span className="tag-pill">{section.badge}</span>
                                        <span className="admin-card-chevron" aria-hidden>
                                            <Icon size={18} strokeWidth={2} />
                                        </span>
                                        <span className="admin-card-chevron admin-card-chevron-accent" aria-hidden>
                                            <ChevronRight size={18} strokeWidth={2.25} />
                                        </span>
                                    </div>
                                </div>
                                <div className="course-stats-display">
                                    <div className="stat-item">
                                        <span className="stat-v">{section.statLeft.value}</span>
                                        <span className="stat-label">{section.statLeft.label}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-v">{section.statRight.value}</span>
                                        <span className="stat-label">{section.statRight.label}</span>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </section>
            </div>
        </div>
    );
};

export default Admin;

