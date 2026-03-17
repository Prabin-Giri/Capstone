import React, { useState, useEffect } from 'react';
import { useLocation, NavLink } from 'react-router-dom';
import { getCourse, getCourseDocuments, getFileUrl } from '../../lib/api';
import type { Course, CourseDocuments } from '../../lib/api';
import { PanelLeft, BookOpen, BarChart2, FileText, CalendarDays } from 'lucide-react';
import './Layout.css';

interface CourseSidebarProps {
    courseId: string;
}

const CourseSidebar: React.FC<CourseSidebarProps> = ({ courseId }) => {
    const { pathname } = useLocation();
    const isTaPath = pathname.startsWith('/ta');
    const basePath = isTaPath ? `/ta/courses/${courseId}` : `/student/courses/${courseId}`;
    
    const [course, setCourse] = useState<Course | null>(null);
    const [documents, setDocuments] = useState<CourseDocuments | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        if (courseId) {
            getCourse(courseId)
                .then(setCourse)
                .catch(err => console.error('Failed to load course in sidebar:', err));

            getCourseDocuments(courseId)
                .then(setDocuments)
                .catch(() => setDocuments(null));
        }
    }, [courseId]);

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const navItems: Array<
        | { label: string; to: string; end?: boolean; icon: React.ReactNode; external?: false; disabled?: false }
        | { label: string; to: string; icon: React.ReactNode; external: true; disabled?: boolean }
    > = [
        { label: 'Assignments', to: `${basePath}/assignments`, end: true, icon: <BookOpen size={18} /> },
        { label: 'Grades', to: `${basePath}/grades`, icon: <BarChart2 size={18} /> },
        {
            label: 'Syllabus',
            to: documents?.syllabus_path ? getFileUrl(documents.syllabus_path) : '#',
            icon: <FileText size={18} />,
            external: true,
            disabled: !documents?.syllabus_path
        },
        {
            label: 'Schedule',
            to: documents?.schedule_path ? getFileUrl(documents.schedule_path) : '#',
            icon: <CalendarDays size={18} />,
            external: true,
            disabled: !documents?.schedule_path
        },
    ];

    // Mobile: just render plain pill text nav, no collapse logic
    if (isMobile) {
        return (
            <aside className="course-sidebar">
                <nav className="course-nav">
                    {navItems.map((item) =>
                        item.external ? (
                            item.disabled ? (
                                <span key={item.label} className="course-nav-link disabled" aria-disabled="true">
                                    {item.label}
                                </span>
                            ) : (
                                <a
                                    key={item.label}
                                    href={item.to}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="course-nav-link"
                                >
                                    {item.label}
                                </a>
                            )
                        ) : (
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
                        )
                    )}
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
                {navItems.map((item) =>
                    item.external ? (
                        item.disabled ? (
                            <span
                                key={item.label}
                                className="course-nav-link disabled"
                                aria-disabled="true"
                                title={isCollapsed ? item.label : undefined}
                            >
                                <span className="course-nav-icon">{item.icon}</span>
                                {!isCollapsed && <span className="course-label">{item.label}</span>}
                            </span>
                        ) : (
                            <a
                                key={item.label}
                                href={item.to}
                                target="_blank"
                                rel="noreferrer"
                                className="course-nav-link"
                                title={isCollapsed ? item.label : undefined}
                            >
                                <span className="course-nav-icon">{item.icon}</span>
                                {!isCollapsed && <span className="course-label">{item.label}</span>}
                            </a>
                        )
                    ) : (
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
                    )
                )}
            </nav>
        </aside>
    );
};

export default CourseSidebar;
