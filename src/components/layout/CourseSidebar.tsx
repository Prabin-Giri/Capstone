import React, { useState, useEffect } from 'react';
import { useLocation, NavLink } from 'react-router-dom';
import { getCourse } from '../../lib/api';
import type { Course } from '../../lib/api';
import { PanelLeft, LayoutDashboard, BookOpen, BarChart2 } from 'lucide-react';
import './Layout.css';

interface CourseSidebarProps {
    courseId: string;
}

const CourseSidebar: React.FC<CourseSidebarProps> = ({ courseId }) => {
    const { pathname } = useLocation();
    const isTaPath = pathname.startsWith('/ta');
    const basePath = isTaPath ? `/ta/courses/${courseId}` : `/student/courses/${courseId}`;
    
    const [course, setCourse] = useState<Course | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        if (courseId) {
            getCourse(courseId)
                .then(setCourse)
                .catch(err => console.error('Failed to load course in sidebar:', err));
        }
    }, [courseId]);

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const navItems = [
        { label: 'Home', to: basePath, end: true, icon: <LayoutDashboard size={18} /> },
        { label: 'Assignments', to: `${basePath}/assignments`, icon: <BookOpen size={18} /> },
        { label: 'Grades', to: `${basePath}/grades`, icon: <BarChart2 size={18} /> },
    ];

    // Mobile: just render plain pill text nav, no collapse logic
    if (isMobile) {
        return (
            <aside className="course-sidebar">
                <nav className="course-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.label}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                                `course-nav-link ${isActive ? 'active' : ''}`
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>
        );
    }

    // Desktop: full collapsible sidebar with icons
    return (
        <aside className={`course-sidebar ${isCollapsed ? 'course-sidebar-collapsed' : ''}`}>
            <div className="course-context">
                <div className="course-context-header">
                    <button
                        className="course-sidebar-toggle"
                        onClick={() => setIsCollapsed(c => !c)}
                        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <PanelLeft size={16} />
                    </button>
                    {!isCollapsed && (
                        <div className="course-context-info">
                            <div className="course-context-name">{course?.name ?? 'Course'}</div>
                            <div className="course-context-id">{course?.id ?? ''}</div>
                        </div>
                    )}
                </div>
            </div>

            <nav className="course-nav">
                {navItems.map((item) => (
                    <NavLink
                        key={item.label}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                            `course-nav-link ${isActive ? 'active' : ''}`
                        }
                        title={isCollapsed ? item.label : undefined}
                    >
                        <span className="course-nav-icon">{item.icon}</span>
                        {!isCollapsed && <span className="course-label">{item.label}</span>}
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
};

export default CourseSidebar;
