import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, Moon, Sun, Monitor } from 'lucide-react';
import { getUser } from '../../lib/auth';
import { getUnreadCount } from '../../lib/api';
import './Layout.css';

interface TopbarProps {
    onToggleSidebar: () => void;
}

type ThemeMode = 'system' | 'light' | 'dark';

const isThemeMode = (value: string | null): value is ThemeMode =>
    value === 'system' || value === 'light' || value === 'dark';

const getSystemIsDark = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const resolveThemeMode = (): ThemeMode => {
    if (typeof window === 'undefined') {
        return 'system';
    }

    const appTheme = window.localStorage.getItem('app-theme');
    if (isThemeMode(appTheme)) {
        return appTheme;
    }

    const legacyTheme = window.localStorage.getItem('theme');
    if (legacyTheme === 'dark' || legacyTheme === 'light') {
        return legacyTheme;
    }

    return 'system';
};

const applyThemeClass = (mode: ThemeMode) => {
    if (typeof document === 'undefined') {
        return;
    }
    const isDark = mode === 'dark' || (mode === 'system' && getSystemIsDark());
    document.body.classList.toggle('dark-theme', isDark);
};

const getNextThemeMode = (current: ThemeMode): ThemeMode => {
    if (current === 'system') return 'dark';
    if (current === 'dark') return 'light';
    return 'system';
};

const Topbar: React.FC<TopbarProps> = ({ onToggleSidebar }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [themeMode, setThemeMode] = useState<ThemeMode>('system');
    const [unreadCount, setUnreadCount] = useState(0);
    const user = getUser();

    useEffect(() => {
        const syncTheme = () => {
            const mode = resolveThemeMode();
            setThemeMode(mode);
            applyThemeClass(mode);
        };

        syncTheme();

        if (typeof window === 'undefined') {
            return;
        }

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemThemeChange = () => {
            if (resolveThemeMode() === 'system') {
                applyThemeClass('system');
            }
        };

        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'app-theme' || e.key === 'theme' || e.key === null) {
                syncTheme();
            }
        };

        const handleThemeEvent = (e: Event) => {
            const detail = (e as CustomEvent<ThemeMode>).detail;
            if (detail === 'dark' || detail === 'light' || detail === 'system') {
                setThemeMode(detail);
                applyThemeClass(detail);
                return;
            }
            syncTheme();
        };

        mediaQuery.addEventListener('change', handleSystemThemeChange);
        window.addEventListener('storage', handleStorage);
        window.addEventListener('theme-change', handleThemeEvent as EventListener);

        return () => {
            mediaQuery.removeEventListener('change', handleSystemThemeChange);
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('theme-change', handleThemeEvent as EventListener);
        };
    }, []);

    const cycleThemeMode = () => {
        const nextMode = getNextThemeMode(themeMode);
        setThemeMode(nextMode);
        applyThemeClass(nextMode);

        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem('app-theme', nextMode);
                // Keep legacy key in sync for older reads.
                const resolvedLegacy = nextMode === 'system' ? (getSystemIsDark() ? 'dark' : 'light') : nextMode;
                window.localStorage.setItem('theme', resolvedLegacy);
                window.dispatchEvent(new CustomEvent('theme-change', { detail: nextMode }));
            }
        } catch {
            // ignore storage errors
        }
    };

    // Poll unread message count + listen for instant refresh
    useEffect(() => {
        if (!user?.id) return;
        const fetchCount = () => {
            getUnreadCount(user.id).then(setUnreadCount).catch(() => {});
        };
        fetchCount();
        const interval = setInterval(fetchCount, 30000);
        const handleInboxRead = () => fetchCount();
        window.addEventListener('inbox-read', handleInboxRead);
        return () => { clearInterval(interval); window.removeEventListener('inbox-read', handleInboxRead); };
    }, [user?.id]);

    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/calendar')) return 'Calendar';
        if (path.includes('/faculty')) return 'Faculty Dashboard';
        if (path.includes('/student') || path.includes('/ta')) return 'Dashboard';
        return 'AutoGrade';
    };

    const themeLabel = themeMode === 'system' ? 'System' : themeMode === 'dark' ? 'Dark' : 'Light';
    const themeIcon = themeMode === 'system'
        ? <Monitor size={18} />
        : themeMode === 'dark'
            ? <Moon size={18} />
            : <Sun size={18} />;

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
                    onClick={cycleThemeMode}
                    aria-label={`Theme mode: ${themeLabel}. Click to switch mode.`}
                    title={`Theme: ${themeLabel} (click to cycle)`}
                >
                    {themeIcon}
                    <span className="theme-toggle-label">{themeLabel}</span>
                </button>
                <button
                    className="topbar-bell-btn"
                    onClick={() => navigate('/inbox')}
                    title="Inbox"
                    aria-label={`Inbox${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
                >
                    <Bell size={20} />
                    {unreadCount > 0 && <span className="topbar-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                </button>
            </div>
        </header>
    );
};

export default Topbar;
