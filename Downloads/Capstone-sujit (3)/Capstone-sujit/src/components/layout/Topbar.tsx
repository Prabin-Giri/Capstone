import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search, Menu } from 'lucide-react';
import './Layout.css';

interface TopbarProps {
    onToggleSidebar: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ onToggleSidebar }) => {
    const location = useLocation();

    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/calendar')) return 'Calendar';
        if (path.includes('/faculty')) return 'Faculty Dashboard';
        if (path.includes('/student')) return 'Student Dashboard';
        if (path.includes('/ta')) return 'TA Dashboard';
        return 'AutoGrade';
    };

    return (
        <header className="topbar">
            <div className="topbar-left">
                <button className="mobile-toggle" onClick={onToggleSidebar}>
                    <Menu size={24} />
                </button>
                <div className="page-title">{getPageTitle()}</div>
            </div>

            <div className="user-profile">
                <div className="icon-group" style={{ display: 'flex', color: 'var(--text-secondary)' }}>
                    <Search size={20} className="cursor-pointer hover:text-primary" />
                    <Bell size={20} className="cursor-pointer hover:text-primary" />
                </div>
            </div>
        </header>
    );
};

export default Topbar;
