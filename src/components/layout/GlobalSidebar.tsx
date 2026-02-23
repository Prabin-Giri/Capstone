import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Calendar, Mail, HelpCircle, User, LogOut, Database, X } from 'lucide-react';
import { getRole, AUTH_ROLES, logout } from '../../lib/auth';
import logoUrl from '../../assets/logo.png';
import './Layout.css';

interface GlobalSidebarProps {
    isMobileOpen?: boolean;
    onClose?: () => void;
}

const GlobalSidebar = ({ isMobileOpen, onClose }: GlobalSidebarProps) => {
    const role = getRole();
    const dashboardPath = role === AUTH_ROLES.FACULTY ? '/faculty' : '/student';

    return (
        <aside className={`global-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
            <button className="mobile-close-btn" onClick={onClose} aria-label="Close Menu">
                <X size={24} />
            </button>
            <div className="global-sidebar-header">
                <NavLink to={dashboardPath} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
                    <img src={logoUrl} alt="AutoGrade Logo" style={{ width: 'auto', height: '100%', maxHeight: '60px', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                </NavLink>
            </div>

            <nav className="global-nav">
                <NavLink
                    to={dashboardPath}
                    end
                    className={({ isActive }) =>
                        `global-nav-link ${isActive ? 'active' : ''}`
                    }
                >
                    <LayoutDashboard size={24} />
                    <span className="global-nav-text">Dashboard</span>
                </NavLink>

                <NavLink
                    to="/calendar"
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

                {role === AUTH_ROLES.FACULTY && (
                    <NavLink
                        to="/db-explorer"
                        className={({ isActive }) =>
                            `global-nav-link ${isActive ? 'active' : ''}`
                        }
                    >
                        <Database size={24} />
                        <span className="global-nav-text">DB Explorer</span>
                    </NavLink>
                )}

                <span className="global-nav-link disabled" title="Coming Soon">
                    <HelpCircle size={24} />
                    <span className="global-nav-text">Help</span>
                </span>

                <button
                    onClick={logout}
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
