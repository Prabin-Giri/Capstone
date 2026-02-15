import React from 'react';
import { logout } from '../../lib/auth';
import './Layout.css';

import { useLocation } from 'react-router-dom';

const Topbar: React.FC = () => {
    const location = useLocation();

    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/calendar')) return 'Calendar';
        // Add more routes here as needed
        return 'Dashboard';
    };

    return (
        <header className="topbar">
            <div className="page-title">{getPageTitle()}</div>
            <div className="user-profile">
                <button
                    onClick={logout}
                    className="text-sm text-gray-500 hover:text-red-600 mr-4 font-medium"
                >
                    Logout
                </button>
                <div className="avatar-circle">
                    U
                </div>
            </div>
        </header>
    );
};

export default Topbar;
