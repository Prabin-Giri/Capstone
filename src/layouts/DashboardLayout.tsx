import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Settings, LogOut, BarChart } from 'lucide-react';
import './DashboardLayout.css';

const DashboardLayout: React.FC = () => {
    const location = useLocation();
    const isFaculty = location.pathname.startsWith('/faculty');

    const studentLinks = [
        { to: '/student', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/student/profile', label: 'Profile', icon: Settings },
    ];

    const facultyLinks = [
        { to: '/faculty', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/faculty/reports', label: 'Reports', icon: BarChart },
    ];

    const links = isFaculty ? facultyLinks : studentLinks;

    return (
        <div className="dashboard-layout">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <h1 className="brand-title">AutoGrade</h1>
                    <span className="portal-label">{isFaculty ? 'FACULTY PORTAL' : 'STUDENT PORTAL'}</span>
                </div>

                <nav className="sidebar-nav">
                    {links.map((link) => {
                        const Icon = link.icon;
                        const isActive = location.pathname === link.to;
                        return (
                            <Link
                                key={link.to}
                                to={link.to}
                                className={`nav-link ${isActive ? 'active' : ''}`}
                            >
                                <Icon className="nav-icon" />
                                {link.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    <button className="sign-out-btn">
                        <LogOut className="nav-icon" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="main-content">
                <header className="top-header">
                    <h2 className="header-title">
                        Dashboard
                    </h2>
                    <div className="header-actions">
                        <div className="user-avatar">
                            {isFaculty ? 'F' : 'S'}
                        </div>
                    </div>
                </header>

                <main className="page-container">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default DashboardLayout;
