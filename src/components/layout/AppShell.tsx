import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import './Layout.css';

const AppShell: React.FC = () => {
    return (
        <div className="app-shell">
            <Sidebar />

            <div className="main-wrapper">
                <Topbar />

                <main className="content-area">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AppShell;
