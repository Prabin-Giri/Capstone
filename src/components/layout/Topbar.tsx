import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search, Menu, Moon, Sun } from 'lucide-react';
import './Layout.css';

interface TopbarProps {
    onToggleSidebar: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ onToggleSidebar }) => {
    const location = useLocation();
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        try {
            const stored = typeof window !== 'undefined' ? window.localStorage.getItem('theme') : null;
            const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            const initialDark = stored ? stored === 'dark' : prefersDark;
            setIsDark(initialDark);
            if (typeof document !== 'undefined') {
                document.body.classList.toggle('dark-theme', initialDark);
            }
        } catch {
            // ignore storage errors
        }
    }, []);

    const toggleTheme = () => {
        setIsDark(prev => {
            const next = !prev;
            if (typeof document !== 'undefined') {
                document.body.classList.toggle('dark-theme', next);
            }
            try {
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem('theme', next ? 'dark' : 'light');
                }
            } catch {
                // ignore
            }
            return next;
        });
    };

    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/calendar')) return 'Calendar';
        if (path.includes('/faculty')) return 'Faculty Dashboard';
        if (path.includes('/student') || path.includes('/ta')) return 'Dashboard';
        return 'AutoGrade';
    };

    return (
        <header className="topbar">
            <div className="topbar-left">
                <button className="mobile-toggle" onClick={onToggleSidebar}>
                    <Menu size={24} />
                </button>
                <div className="topbar-title">{getPageTitle()}</div>
            </div>

            <div className="user-profile">
                <button
                    type="button"
                    className="theme-toggle"
                    onClick={toggleTheme}
                    aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {isDark ? <Sun size={18} /> : <Moon size={18} />}
                    <span className="theme-toggle-label">{isDark ? 'Light' : 'Dark'}</span>
                </button>
                <div className="icon-group" style={{ display: 'flex', color: 'var(--text-secondary)' }}>
                    <Search size={20} className="cursor-pointer hover:text-primary" />
                    <Bell size={20} className="cursor-pointer hover:text-primary" />
                </div>
            </div>
        </header>
    );
};

export default Topbar;
