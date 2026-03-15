import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import {
    Database,
    Users,
    UserCog,
    BookOpen,
    BarChart3,
    GraduationCap,
} from 'lucide-react';
import './DatabaseExplorer.css';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();

    const links = [
        { path: '/admin/database', label: 'Database Explorer', desc: 'Browse and edit tables, add or delete rows.', icon: Database },
        { path: '/admin/users', label: 'User Management', desc: 'List users, change roles, reset passwords, bulk import.', icon: Users },
        { path: '/admin/faculty', label: 'Faculty Management', desc: 'Promote users to faculty or create faculty accounts.', icon: GraduationCap },
        { path: '/admin/tas', label: 'TA Management', desc: 'List TAs, promote to TA, assign TAs to courses.', icon: UserCog },
        { path: '/admin/courses', label: 'Course Oversight', desc: 'View all courses, reassign instructor, archive.', icon: BookOpen },
        { path: '/admin/reports', label: 'Reports & Analytics', desc: 'User counts, course stats, recent signups and submissions.', icon: BarChart3 },
    ];

    return (
        <div className="db-content">
            <div className="table-header">
                <h1>Dashboard</h1>
                <p className="row-count">Admin tools for users, faculty, TAs, courses, and reports.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {links.map(({ path, label, desc, icon: Icon }) => (
                    <Card
                        key={path}
                        className="admin-card"
                        style={{ cursor: 'pointer', padding: '1.25rem' }}
                        onClick={() => navigate(path)}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                            <div style={{ background: 'var(--primary-color)', color: 'white', borderRadius: '10px', padding: '0.6rem' }}>
                                <Icon size={24} />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem' }}>{label}</h3>
                                <p className="admin-muted" style={{ margin: 0, fontSize: '0.85rem' }}>{desc}</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default AdminDashboard;
