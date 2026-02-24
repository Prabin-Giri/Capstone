import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { getUser } from '../../lib/auth';
import './Layout.css';

const Topbar: React.FC = () => {
    const location = useLocation();
    const user = getUser();

    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/calendar')) return 'Academic Calendar';
        if (path.includes('/faculty')) return 'Faculty Dashboard';
        if (path.includes('/student')) return 'Student Dashboard';
        return 'AutoGrade Portal';
    };

    const getInitials = () => {
        if (!user || !user.name) return '??';
        const names = user.name.split(' ');
        if (names.length >= 2) {
            return (names[0][0] + names[names.length - 1][0]).toUpperCase();
        }
        return user.name.substring(0, 2).toUpperCase();
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
                    {getInitials()}
                </div>
            </div>
        </header>
    );
};

export default Topbar;
