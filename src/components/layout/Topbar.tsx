import React from 'react';
import { logout } from '../../lib/auth';
import './Layout.css';

const Topbar: React.FC = () => {
    return (
        <header className="topbar">
            <div className="page-title">Dashboard</div>
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
