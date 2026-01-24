import React from 'react';
import './Layout.css';

const Topbar: React.FC = () => {
    return (
        <header className="topbar">
            <div className="page-title">
                Student Dashboard
            </div>
            <div className="user-profile">
                <div className="avatar-circle">
                    U
                </div>
            </div>
        </header>
    );
};

export default Topbar;
