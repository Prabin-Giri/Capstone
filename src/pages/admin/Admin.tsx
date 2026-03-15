import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';

const Admin: React.FC = () => {
    const navigate = useNavigate();

    const sections = [
        {
            id: 'db',
            title: 'Database Explorer',
            description: 'Inspect tables, preview rows, and understand how data flows through IntelliGrade.',
            accent: 'from-rose-500 to-red-600',
            onClick: () => navigate('/admin/database')
        },
        {
            id: 'users',
            title: 'User Management',
            description: 'View and manage student, faculty, TA, and admin accounts in one place.',
            accent: 'from-red-600 to-amber-500'
        },
        {
            id: 'faculty',
            title: 'Faculty Management',
            description: 'Track faculty activity, course ownership, and grading load distribution.',
            accent: 'from-amber-500 to-rose-500'
        },
        {
            id: 'courses',
            title: 'Course Insights',
            description: 'High‑level view of enrollment, submission volume, and grading bottlenecks.',
            accent: 'from-rose-500 to-emerald-500'
        },
        {
            id: 'reports',
            title: 'Reports & Analytics',
            description: 'Generate usage reports and performance analytics for departments and admins.',
            accent: 'from-sky-500 to-indigo-600'
        }
    ];

    return (
        <div className="min-h-full bg-slate-950/95 text-slate-50 px-6 py-8">
            <div className="max-w-6xl mx-auto space-y-8">
                <header className="space-y-2">
                    <p className="inline-flex items-center rounded-full bg-red-900/50 px-3 py-1 text-xs font-medium text-red-100 ring-1 ring-red-700/60">
                        Admin Control Center
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight">
                        IntelliGrade <span className="text-red-400">Admin</span> Dashboard
                    </h1>
                    <p className="text-sm text-slate-300 max-w-2xl">
                        Explore your data, oversee users and faculty, and keep a pulse on course health and platform activity.
                    </p>
                </header>

                <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {sections.map((section) => (
                        <Card
                            key={section.id}
                            className="relative overflow-hidden bg-slate-900/70 border-slate-800 hover:border-red-500/70 transition-colors cursor-default"
                        >
                            <div
                                className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-gradient-to-br opacity-40"
                                data-accent={section.accent}
                            />
                            <div className="relative space-y-3">
                                <h2 className="text-lg font-semibold text-slate-50">{section.title}</h2>
                                <p className="text-sm text-slate-300 leading-relaxed">
                                    {section.description}
                                </p>
                                <div className="pt-1">
                                    {section.id === 'db' ? (
                                        <button
                                            onClick={section.onClick}
                                            className="inline-flex items-center rounded-md bg-gradient-to-r from-red-600 to-red-800 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:from-red-500 hover:to-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 transition-colors"
                                        >
                                            Open Database Explorer
                                        </button>
                                    ) : (
                                        <span className="inline-flex items-center rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700/80">
                                            Coming soon
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </section>
            </div>
        </div>
    );
};

export default Admin;

