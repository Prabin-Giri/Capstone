import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calendar, Mail, HelpCircle, ShieldAlert } from 'lucide-react';
import { getRole, AUTH_ROLES, getUser } from '../../lib/auth';
import UserAvatar from '../ui/UserAvatar';
import { cancelDialog } from '../ui/Dialog';
import './Layout.css';

interface GlobalSidebarProps {
    isOpen: boolean;
    onNavigate: () => void;
    onToggleAccount: () => void;
    isAccountOpen?: boolean;
    onOpenSupport?: () => void;
    unreadCount?: number;
}

const GlobalSidebar: React.FC<GlobalSidebarProps> = ({ isOpen, onNavigate, onToggleAccount, isAccountOpen, unreadCount = 0 }) => {
    const role = getRole();
    const dashboardPath =
        role === AUTH_ROLES.FACULTY ? '/faculty' :
        role === AUTH_ROLES.ADMIN ? '/admin' :
        '/student';
    const [userData, setUserData] = React.useState(getUser());
    const location = useLocation();

    React.useEffect(() => {
        const handleUpdate = () => setUserData(getUser());
        window.addEventListener('user-profile-updated', handleUpdate);
        return () => window.removeEventListener('user-profile-updated', handleUpdate);
    }, []);

    const isDashboardActive = location.pathname.startsWith('/student') ||
        location.pathname.startsWith('/faculty') ||
        location.pathname.startsWith('/ta') ||
        location.pathname.startsWith('/admin');

    const isCalendarActive = location.pathname.startsWith('/calendar');
    const isPlagScanActive = location.pathname.startsWith('/faculty/plagscan');

    return (
        <aside
            className={`global-sidebar ${isOpen ? 'mobile-open' : ''}`}
            onClick={() => {
                if (document.body.classList.contains('dialog-open')) {
                    cancelDialog();
                }
            }}
        >
            <div className="global-sidebar-header">
                <NavLink to={dashboardPath} onClick={onNavigate} style={{ display: 'flex', justifyContent: 'center' }}>
                    <img src="/ulm-logo.png" alt="ULM Logo" style={{ width: '44px', height: '44px', objectFit: 'contain' }} />
                </NavLink>
            </div>

            <nav className="global-nav">
                <button
                    onClick={() => {
                        onNavigate();
                        onToggleAccount();
                    }}
                    className={`global-nav-link ${isAccountOpen ? 'active' : ''}`}
                    style={{ cursor: 'pointer' }}
                >
                    <UserAvatar 
                        user={userData || undefined} 
                        size={32} 
                        style={{ marginBottom: '4px' }}
                    />
                    <span className="global-nav-text">Account</span>
                </button>

                <div className="global-nav-divider" />

                <NavLink
                    to={dashboardPath}
                    onClick={onNavigate}
                    className={() => `global-nav-link ${isDashboardActive && !isAccountOpen ? 'active' : ''}`}
                >
                    <LayoutDashboard size={24} />
                    <span className="global-nav-text">Dashboard</span>
                </NavLink>

                <NavLink
                    to="/calendar"
                    onClick={onNavigate}
                    className={() => `global-nav-link ${isCalendarActive && !isAccountOpen ? 'active' : ''}`}
                >
                    <Calendar size={24} />
                    <span className="global-nav-text">Calendar</span>
                </NavLink>

                <div className="global-nav-divider" />

                <NavLink
                    to="/inbox"
                    onClick={onNavigate}
                    className={({ isActive }) => `global-nav-link ${isActive && !isAccountOpen ? 'active' : ''}`}
                >
                    <div className="nav-icon-wrapper">
                        <Mail size={24} />
                        {unreadCount > 0 && (
                            <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                        )}
                    </div>
                    <span className="global-nav-text">Inbox</span>
                </NavLink>

                {role === AUTH_ROLES.FACULTY && (
                    <NavLink
                        to="/faculty/plagscan"
                        onClick={onNavigate}
                        className={() => `global-nav-link ${isPlagScanActive && !isAccountOpen ? 'active' : ''}`}
                    >
                        <ShieldAlert size={24} />
                        <span className="global-nav-text">PlagScan</span>
                    </NavLink>
                )}

                <div style={{ flex: 1 }} />

                <span className="global-nav-link disabled" title="Coming Soon">
                    <HelpCircle size={24} />
                    <span className="global-nav-text">Help</span>
                </span>
            </nav>
        </aside>
    );
};

export default GlobalSidebar;
