import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import GlobalSidebar from './GlobalSidebar';
import AccountDrawer from './AccountDrawer';
import CourseSidebar from './CourseSidebar';
import Breadcrumbs from './Breadcrumbs';
import Topbar from './Topbar';
import { LayoutDashboard, Calendar, User, HelpCircle, Mail } from 'lucide-react';
import { getRole, AUTH_ROLES, getUser } from '../../lib/auth';
import { getUnreadCount } from '../../lib/api';
import HelpDrawer from './HelpDrawer';
import './Layout.css';

const AppShell: React.FC = () => {
    const location = useLocation();
    const role = getRole();
    const dashboardPath =
        role === AUTH_ROLES.FACULTY ? '/faculty' :
        role === AUTH_ROLES.ADMIN ? '/admin' :
        '/student';
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const user = getUser();

    const toggleSidebar = () => setIsMobileSidebarOpen(!isMobileSidebarOpen);
    const closeSidebar = () => setIsMobileSidebarOpen(false);

    const toggleAccount = () => {
        setIsAccountOpen(!isAccountOpen);
        setIsHelpOpen(false); // Close other drawer if it's open
    };
    const closeAccount = () => setIsAccountOpen(false);

    const toggleHelp = () => {
        setIsHelpOpen(!isHelpOpen);
        setIsAccountOpen(false); // Close other drawer if it's open
        setIsMobileSidebarOpen(false);
    };
    const closeHelp = () => setIsHelpOpen(false);

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

    // Poll unread message count (mirrors Topbar bell logic)
    useEffect(() => {
        if (!user?.id) return;
        const fetchCount = () => {
            getUnreadCount(user.id).then(setUnreadCount).catch(() => {});
        };
        fetchCount();
        const interval = setInterval(fetchCount, 30000);
        window.addEventListener('inbox-read', fetchCount);
        return () => {
            clearInterval(interval);
            window.removeEventListener('inbox-read', fetchCount);
        };
    }, [user?.id]);

    // Lock body scroll and handle background interactions
    useEffect(() => {
        if (isAccountOpen || isMobileSidebarOpen || isHelpOpen) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
        return () => document.body.classList.remove('no-scroll');
    }, [isAccountOpen, isMobileSidebarOpen, isHelpOpen]);

    const courseMatch =
        matchPath({ path: '/student/courses/:courseId/*', end: false }, location.pathname) ||
        matchPath('/student/courses/:courseId', location.pathname);
    const courseId = courseMatch?.params.courseId;

    const handleNavigate = () => {
        setIsMobileSidebarOpen(false);
        setIsAccountOpen(false);
        setIsHelpOpen(false);
    };

    return (
        <div
            className={`app-shell ${isMobileSidebarOpen ? 'sidebar-open' : ''} ${isAccountOpen ? 'account-drawer-active' : ''} ${isHelpOpen ? 'help-drawer-active' : ''}`}
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
                onOpenSupport={toggleHelp}
                unreadCount={unreadCount}
            />

            <AccountDrawer
                isOpen={isAccountOpen}
                onClose={closeAccount}
            />

            <HelpDrawer
                isOpen={isHelpOpen}
                onClose={closeHelp}
            />

            <div className="app-body">
                <div className="main-wrapper">
                    <Topbar onToggleSidebar={toggleSidebar} />

                    <main className="content-area">
                        {(() => {
                            // For grading routes, use a stable key so SubmissionGrader stays
                            // mounted when switching between students (only submissionId changes).
                            // For all other routes, use the full pathname for page transitions.
                            const isGradingRoute = /\/assignments\/[^/]+\/grading\/[^/]+$/.test(location.pathname);
                            const transitionKey = isGradingRoute
                                ? location.pathname.replace(/\/grading\/[^/]+$/, '/grading')
                                : location.pathname;

                            return courseId ? (
                                <div className="course-page-layout">
                                    <CourseSidebar courseId={courseId} />
                                    <div className="course-page-content">
                                        <Breadcrumbs courseId={courseId} />
                                        <div className="page-transition" key={transitionKey}>
                                            <Outlet />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="page-transition" key={transitionKey}>
                                    <Outlet />
                                </div>
                            );
                        })()}
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
                <NavLink
                    to="/inbox"
                    className={({ isActive }) => `mobile-nav-link ${isActive && !isAccountOpen ? 'active' : ''}`}
                    onClick={handleNavigate}
                >
                    <span className="nav-icon-wrapper">
                        <Mail size={20} />
                        {unreadCount > 0 && (
                            <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                        )}
                    </span>
                    <span>Inbox</span>
                </NavLink>
                <button 
                    className={`mobile-nav-link ${isHelpOpen ? 'active' : ''}`}
                    onClick={toggleHelp}
                >
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
