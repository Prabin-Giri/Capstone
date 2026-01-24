import React from 'react';
import { Link } from 'react-router-dom';

const Sidebar: React.FC = () => {
    return (
        <aside className="w-64 bg-white border-r border-gray-200 h-full flex flex-col">
            <div className="p-6 border-b border-gray-100">
                <h1 className="text-xl font-bold text-indigo-600">AutoGrade</h1>
            </div>

            <nav className="flex-1 p-4 space-y-1">
                <Link to="/student" className="block px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded">
                    Student Dashboard
                </Link>
                <Link to="/faculty" className="block px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded">
                    Faculty Dashboard
                </Link>
            </nav>
        </aside>
    );
};

export default Sidebar;
