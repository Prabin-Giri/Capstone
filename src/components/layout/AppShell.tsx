import { useState, useEffect } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import GlobalSidebar from './GlobalSidebar';
import AccountDrawer from './AccountDrawer';
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
    const [isAccountOpen, setIsAccountOpen] = useState(false);

    const toggleSidebar = () => setIsMobileSidebarOpen(!isMobileSidebarOpen);
    const closeSidebar = () => setIsMobileSidebarOpen(false);

    const toggleAccount = () => setIsAccountOpen(!isAccountOpen);
    const closeAccount = () => setIsAccountOpen(false);

    // Sidebar Swipe Gesture Logic
    const [touchStart, setTouchStart] = useState<number | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        const touchX = e.touches[0].clientX;
        // Only start tracking if swipe starts from the left edge (0-40px)
        if (touchX < 40 && !isMobileSidebarOpen && !isAccountOpen) {
            setTouchStart(touchX);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStart === null) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - touchStart;

        // If swiped more than 50px to the right, open the sidebar
        if (diff > 50) {
            setIsMobileSidebarOpen(true);
            setTouchStart(null);
        }
    };

    const handleTouchEnd = () => {
        setTouchStart(null);
    };

    // Lock body scroll and handle background interactions
    useEffect(() => {
        if (isAccountOpen || isMobileSidebarOpen) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
        return () => document.body.classList.remove('no-scroll');
    }, [isAccountOpen, isMobileSidebarOpen]);

    const courseMatch =
        matchPath({ path: '/student/courses/:courseId/*', end: false }, location.pathname) ||
        matchPath('/student/courses/:courseId', location.pathname);
    const courseId = courseMatch?.params.courseId;

    const handleNavigate = () => {
        setIsMobileSidebarOpen(false);
        setIsAccountOpen(false);
    };

    return (
        <div
            className={`app-shell ${isMobileSidebarOpen ? 'sidebar-open' : ''} ${isAccountOpen ? 'account-drawer-active' : ''}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {isMobileSidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}

            <GlobalSidebar
                isOpen={isMobileSidebarOpen}
                onNavigate={handleNavigate}
                onToggleAccount={toggleAccount}
                isAccountOpen={isAccountOpen}
            />

            <AccountDrawer
                isOpen={isAccountOpen}
                onClose={closeAccount}
            />

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
            <nav className={`mobile-nav ${isMobileSidebarOpen ? 'hidden-behind-sidebar' : ''}`}>
                <NavLink
                    to={dashboardPath}
                    className={({ isActive }) => `mobile-nav-link ${isActive && !isAccountOpen ? 'active' : ''}`}
                    onClick={handleNavigate}
                >
                    <LayoutDashboard size={20} />
                    <span>Dashboard</span>
                </NavLink>
                <NavLink
                    to="/calendar"
                    className={({ isActive }) => `mobile-nav-link ${isActive && !isAccountOpen ? 'active' : ''}`}
                    onClick={handleNavigate}
                >
                    <Calendar size={20} />
                    <span>Calendar</span>
                </NavLink>
                <button className="mobile-nav-link disabled" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                    <HelpCircle size={20} />
                    <span>Help</span>
                </button>
                <button
                    className={`mobile-nav-link ${isAccountOpen ? 'active' : ''}`}
                    onClick={toggleAccount}
                >
                    <User size={20} />
                    <span>Account</span>
                </button>
            </nav>
        </div>
    );
};

export default AppShell;
