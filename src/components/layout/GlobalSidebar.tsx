import React from 'react';
import { NavLink } from 'react-router-dom';
import { getRole, AUTH_ROLES } from '../../lib/auth';
import './Layout.css';

const GlobalSidebar: React.FC = () => {
    const role = getRole();
    const dashboardPath = role === AUTH_ROLES.FACULTY ? '/faculty' : '/student';

    return (
        <aside className="global-sidebar">
            <div className="global-sidebar-header">
                <h1 className="brand-title">AutoGrade</h1>
            </div>

            <nav className="global-nav">
                <NavLink
                    to={dashboardPath}
                    className={({ isActive }) =>
                        `global-nav-link ${isActive ? 'active' : ''}`
                    }
                >
                    <span className="global-nav-text">Dashboard</span>
                </NavLink>
                <div className="global-nav-divider" />
                <span className="global-nav-link disabled">
                    <span className="global-nav-text">Calendar</span>
                </span>
                <span className="global-nav-link disabled">
                    <span className="global-nav-text">Inbox</span>
                </span>
                <span className="global-nav-link disabled">
                    <span className="global-nav-text">Help</span>
                </span>
                <span className="global-nav-link disabled">
                    <span className="global-nav-text">Account</span>
                </span>
            </nav>
        </aside>
    );
};

export default GlobalSidebar;
