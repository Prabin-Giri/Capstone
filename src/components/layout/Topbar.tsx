import React from 'react';

const Topbar: React.FC = () => {
    return (
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6">
            <div className="text-lg font-semibold text-gray-800">
                Dashboard
            </div>
            <div className="flex items-center space-x-4">
                <div className="h-8 w-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm">
                    U
                </div>
            </div>
        </header>
    );
};

export default Topbar;
