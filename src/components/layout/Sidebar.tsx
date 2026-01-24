import React from 'react';
import { Link } from 'react-router-dom';
import './Layout.css';

const Sidebar: React.FC = () => {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <h1 className="brand-title">AutoGrade</h1>
            </div>

            <nav className="sidebar-nav">
                <Link to="/student" className="nav-link">
                    Student Dashboard
                </Link>
                <Link to="/faculty" className="nav-link">
                    Faculty Dashboard
                </Link>
            </nav>
        </aside>
    );
};

export default Sidebar;
