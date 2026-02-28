import { useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import GlobalSidebar from './GlobalSidebar';
import CourseSidebar from './CourseSidebar';
import Breadcrumbs from './Breadcrumbs';
import Topbar from './Topbar';
import { LayoutDashboard, Calendar, User, HelpCircle } from 'lucide-react';
import { getRole, AUTH_ROLES } from '../../lib/auth';
import './Layout.css';

const AppShell: React.FC = () => {
    const location = useLocation();
    const role = getRole();
    const dashboardPath = role === AUTH_ROLES.FACULTY ? '/faculty' : '/student';
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    const toggleSidebar = () => setIsMobileSidebarOpen(!isMobileSidebarOpen);
    const closeSidebar = () => setIsMobileSidebarOpen(false);

    const courseMatch =
        matchPath({ path: '/student/courses/:courseId/*', end: false }, location.pathname) ||
        matchPath('/student/courses/:courseId', location.pathname);
    const courseId = courseMatch?.params.courseId;

    return (
        <div className={`app-shell ${isMobileSidebarOpen ? 'sidebar-open' : ''}`}>
            {isMobileSidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}

            <GlobalSidebar isOpen={isMobileSidebarOpen} onClose={closeSidebar} />

            <div className="app-body">
                <div className="main-wrapper">
                    <Topbar onToggleSidebar={toggleSidebar} />

                    <main className="content-area">
                        {courseId ? (
                            <div className="course-page-layout">
                                <CourseSidebar courseId={courseId} />
                                <div className="course-page-content">
                                    <Breadcrumbs courseId={courseId} />
                                    <div className="page-transition" key={location.pathname}>
                                        <Outlet />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="page-transition" key={location.pathname}>
                                <Outlet />
                            </div>
                        )}
                    </main>
                </div>
            </div>

            {/* Mobile Bottom Navigation */}
            <nav className="mobile-nav">
                <NavLink to={dashboardPath} className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
                    <LayoutDashboard size={20} />
                    <span>Dashboard</span>
                </NavLink>
                <NavLink to="/calendar" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
                    <Calendar size={20} />
                    <span>Calendar</span>
                </NavLink>
                <button className="mobile-nav-link disabled" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                    <HelpCircle size={20} />
                    <span>Help</span>
                </button>
                <button className="mobile-nav-link disabled" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                    <User size={20} />
                    <span>Account</span>
                </button>
            </nav>
        </div>
    );
};

export default AppShell;
