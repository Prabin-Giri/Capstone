import { useLocation } from 'react-router-dom';
import { Bell, Search, Menu } from 'lucide-react';
import './Layout.css';

interface TopbarProps {
    toggleSidebar?: () => void;
}

const Topbar = ({ toggleSidebar }: TopbarProps) => {
    const location = useLocation();

    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/calendar')) return 'Academic Calendar';
        if (path.includes('/faculty')) return 'Faculty Dashboard';
        if (path.includes('/student')) return 'Student Dashboard';
        return 'AutoGrade Portal';
    };

    return (
        <header className="topbar">
            <div className="header-left">
                <button className="mobile-menu-btn" onClick={toggleSidebar} aria-label="Toggle Menu">
                    <Menu size={24} />
                </button>
                <div className="page-title">{getPageTitle()}</div>
            </div>

            <div className="user-profile">
                <div className="icon-group" style={{ display: 'flex', gap: '1rem', marginRight: '1rem', color: 'var(--text-secondary)' }}>
                    <Search size={20} className="cursor-pointer hover:text-primary" />
                    <Bell size={20} className="cursor-pointer hover:text-primary" />
                </div>
                <div className="avatar-circle">
                    PG
                </div>
            </div>
        </header>
    );
};

export default Topbar;
