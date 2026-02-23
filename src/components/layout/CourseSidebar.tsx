import React from 'react';
import { NavLink } from 'react-router-dom';
import { courses } from '../../lib/mockData';
import './Layout.css';

interface CourseSidebarProps {
    courseId: string;
}

const CourseSidebar: React.FC<CourseSidebarProps> = ({ courseId }) => {
    const course = courses.find((item) => item.id === courseId);
    const basePath = `/student/courses/${courseId}`;

    const navItems = [
        { label: 'Home', to: basePath, end: true },
        { label: 'Assignments', to: `${basePath}/assignments` },
        { label: 'Grades', to: `${basePath}/grades` },
    ];

    return (
        <aside className="course-sidebar-wrapper">
            {/* Desktop Vertical Sidebar */}
            <div className="course-sidebar desktop-only">
                <div className="course-context">
                    <div className="course-context-name">{course?.name ?? 'Course'}</div>
                    <div className="course-context-id">{course?.id ?? ''}</div>
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
                        >
                            <span className="course-label">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </div>

            {/* Mobile Horizontal Navigation */}
            <nav className="mobile-course-nav mobile-tablet-only">
                {navItems.map((item) => (
                    <NavLink
                        key={item.label}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                            `mobile-nav-pill ${isActive ? 'active' : ''}`
                        }
                    >
                        {item.label}
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
};

export default CourseSidebar;
