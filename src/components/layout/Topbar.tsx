import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import './Layout.css';

const Topbar: React.FC = () => {
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
            <div className="page-title">{getPageTitle()}</div>

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
