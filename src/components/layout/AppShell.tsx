import React from 'react';
import { Outlet, matchPath, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import GlobalSidebar from './GlobalSidebar';
import CourseSidebar from './CourseSidebar';
import Breadcrumbs from './Breadcrumbs';
import Topbar from './Topbar';
import './Layout.css';

const AppShell: React.FC = () => {
    const location = useLocation();
    const courseMatch =
        matchPath({ path: '/student/courses/:courseId/*', end: false }, location.pathname) ||
        matchPath('/student/courses/:courseId', location.pathname);
    const courseId = courseMatch?.params.courseId;

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Close sidebar on route change
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    return (
        <div className="app-shell">
            <GlobalSidebar isMobileOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            {isSidebarOpen && (
                <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />
            )}

            <div className="app-body">
                <div className="main-wrapper">
                    <Topbar toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

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
        </div>
    );
};

export default AppShell;
