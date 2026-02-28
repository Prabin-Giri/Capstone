import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Calendar, Mail, HelpCircle, User, LogOut } from 'lucide-react';
import { getRole, AUTH_ROLES, logout } from '../../lib/auth';
import './Layout.css';

interface GlobalSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

const GlobalSidebar: React.FC<GlobalSidebarProps> = ({ isOpen, onClose }) => {
    const role = getRole();
    const dashboardPath = role === AUTH_ROLES.FACULTY ? '/faculty' : '/student';

    return (
        <aside className={`global-sidebar ${isOpen ? 'mobile-open' : ''}`}>
            <div className="global-sidebar-header" style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}>
                <img src="/ulm-logo.png" alt="ULM Logo" style={{ width: '64px', height: '64px', objectFit: 'contain' }} />
            </div>

            <nav className="global-nav">
                <NavLink
                    to={dashboardPath}
                    end
                    onClick={onClose}
                    className={({ isActive }) =>
                        `global-nav-link ${isActive ? 'active' : ''}`
                    }
                >
                    <LayoutDashboard size={24} />
                    <span className="global-nav-text">Dashboard</span>
                </NavLink>

                <NavLink
                    to="/calendar"
                    onClick={onClose}
                    className={({ isActive }) =>
                        `global-nav-link ${isActive ? 'active' : ''}`
                    }
                >
                    <Calendar size={24} />
                    <span className="global-nav-text">Calendar</span>
                </NavLink>

                <div className="global-nav-divider" />

                <span className="global-nav-link disabled" title="Coming Soon">
                    <Mail size={24} />
                    <span className="global-nav-text">Inbox</span>
                </span>
                <span className="global-nav-link disabled" title="Coming Soon">
                    <User size={24} />
                    <span className="global-nav-text">Account</span>
                </span>

                <div style={{ flex: 1 }} />

                <span className="global-nav-link disabled" title="Coming Soon">
                    <HelpCircle size={24} />
                    <span className="global-nav-text">Help</span>
                </span>

                <button
                    onClick={() => {
                        onClose();
                        logout();
                    }}
                    className="global-nav-link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}
                >
                    <LogOut size={24} />
                    <span className="global-nav-text">Logout</span>
                </button>
            </nav>
        </aside>
    );
};

export default GlobalSidebar;
