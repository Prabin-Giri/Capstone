import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, Moon, Sun, Monitor, MessageSquare, Calendar as CalendarIcon, CheckCheck, Inbox, ArrowRight } from 'lucide-react';
import { getUser, getRole, AUTH_ROLES } from '../../lib/auth';
import { getUnreadCount, getConversations, getAssignments } from '../../lib/api';
import type { Conversation, Assignment } from '../../lib/api';
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
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifLoading, setNotifLoading] = useState(false);
    const [recentMessages, setRecentMessages] = useState<Conversation[]>([]);
    const [upcomingDeadlines, setUpcomingDeadlines] = useState<Assignment[]>([]);
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

    useEffect(() => {
        if (!notifOpen) return;
        const onDocClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.topbar-bell-wrap')) setNotifOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [notifOpen]);

    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/inbox')) return 'Inbox';
        if (path.includes('/calendar')) return 'Calendar';
        if (path === '/student' || path === '/student/') {
            return getRole() === AUTH_ROLES.TA ? 'TA Dashboard' : 'Student Dashboard';
        }
        if (path === '/admin' || path === '/admin/') return 'Admin Dashboard';
        if (path.startsWith('/admin/database')) return 'Database Explorer';
        if (path.startsWith('/admin/users')) return 'User Management';
        if (path.startsWith('/admin/students')) return 'Student Insights';
        if (path.startsWith('/admin/faculty')) return 'Faculty Management';
        if (path.startsWith('/admin/analytics')) return 'App Analytics';
        if (path.startsWith('/admin/settings')) return 'App Settings';
        if (path.startsWith('/admin/courses')) return 'Course Management';
        if (path.startsWith('/admin')) return 'Admin Dashboard';
        if (path === '/faculty' || path === '/faculty/') return 'Faculty Dashboard';
        if (path.includes('/faculty/pending')) return 'Faculty Verification';
        if (path.includes('/faculty/courses/new')) return 'Create Course';
        if (/^\/faculty\/courses\/[^/]+\/assignments\/new\/?$/.test(path)) return 'New Assignment';
        if (/^\/faculty\/courses\/[^/]+\/assignments\/[^/]+\/edit\/?$/.test(path)) return 'Edit Assignment';
        if (/^\/faculty\/courses\/[^/]+\/assignments\/[^/]+\/grading\/[^/]+\/?$/.test(path)) return 'Submission Grading';
        if (/^\/faculty\/courses\/[^/]+\/assignments\/[^/]+\/grading\/?$/.test(path)) return 'Grading Dashboard';
        if (/^\/faculty\/courses\/[^/]+\/assignments\/[^/]+\/?$/.test(path)) return 'Assignment Details';
        if (/^\/faculty\/courses\/[^/]+\/assignments\/?$/.test(path)) return 'Assignments';
        if (/^\/faculty\/courses\/[^/]+\/gradebook\/?$/.test(path)) return 'Course Gradebook';
        if (/^\/faculty\/courses\/[^/]+\/students\/?$/.test(path)) return 'Students';
        if (/^\/faculty\/courses\/[^/]+\/?$/.test(path)) return 'Faculty Command Center';
        if (path.includes('/faculty')) return 'Faculty Dashboard';
        if (path.includes('/student') || path.includes('/ta')) return 'Dashboard';
        return 'Agnos';
    };

    const themeLabel = themeMode === 'system' ? 'System' : themeMode === 'dark' ? 'Dark' : 'Light';
    const themeIcon = themeMode === 'system'
        ? <Monitor size={18} />
        : themeMode === 'dark'
            ? <Moon size={18} />
            : <Sun size={18} />;

    const formatDue = (iso?: string) => {
        if (!iso) return 'No due date';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return 'No due date';
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const formatTimeAgo = (iso?: string) => {
        if (!iso) return '';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h ago`;
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 7) return `${diffInDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const loadNotifications = async () => {
        if (!user?.id) return;
        setNotifLoading(true);
        try {
            const [conversations, assignments] = await Promise.all([
                getConversations(user.id),
                getAssignments(),
            ]);
            const messages = [...conversations]
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                .slice(0, 5);
            const now = Date.now();
            const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
            const deadlines = assignments
                .filter(a => !!a.due_date)
                .filter(a => {
                    const t = new Date(a.due_date).getTime();
                    return !Number.isNaN(t) && t >= now && t <= sevenDaysFromNow;
                })
                .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
                .slice(0, 5);
            setRecentMessages(messages);
            setUpcomingDeadlines(deadlines);
        } catch {
            setRecentMessages([]);
            setUpcomingDeadlines([]);
        } finally {
            setNotifLoading(false);
        }
    };

    const onBellClick = async () => {
        const next = !notifOpen;
        setNotifOpen(next);
        if (next) await loadNotifications();
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
                    onClick={cycleThemeMode}
                    aria-label={`Theme mode: ${themeLabel}. Click to switch mode.`}
                    title={`Theme: ${themeLabel} (click to cycle)`}
                >
                    {themeIcon}
                    <span className="theme-toggle-label">{themeLabel}</span>
                </button>
                <div className="topbar-bell-wrap">
                    <button
                        className="topbar-bell-btn"
                        onClick={onBellClick}
                        title="Notifications"
                        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && <span className="topbar-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                    </button>
                    {notifOpen && (
                        <div className="topbar-notif-popover">
                            <div className="topbar-notif-header">
                                <span className="topbar-notif-title">Notifications</span>
                                {(recentMessages.length > 0 || upcomingDeadlines.length > 0) && (
                                    <button 
                                        className="topbar-notif-clear"
                                        onClick={() => {
                                            setRecentMessages([]);
                                            setUpcomingDeadlines([]);
                                        }}
                                    >
                                        <CheckCheck size={14} style={{ marginRight: '4px' }} />
                                        Clear all
                                    </button>
                                )}
                            </div>
                            
                            <div className="topbar-notif-content">
                                {notifLoading ? (
                                    <div className="topbar-notif-empty">Loading notifications...</div>
                                ) : recentMessages.length === 0 && upcomingDeadlines.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                        <div style={{ marginBottom: '12px', opacity: 0.2 }}>
                                            <Bell size={48} style={{ margin: '0 auto' }} />
                                        </div>
                                        <div className="topbar-notif-item-title" style={{ textAlign: 'center' }}>All caught up!</div>
                                        <div className="topbar-notif-item-sub" style={{ textAlign: 'center' }}>No new notifications right now.</div>
                                    </div>
                                ) : (
                                    <>
                                        {recentMessages.length > 0 && (
                                            <>
                                                <div className="topbar-notif-section-title">Recent Messages</div>
                                                {recentMessages.map(c => (
                                                    <div key={c.id} className={`topbar-notif-item ${c.unread_count > 0 ? 'unread' : ''}`} onClick={() => { setNotifOpen(false); navigate(`/inbox?conversationId=${c.id}`); }}>
                                                        <div className="topbar-notif-icon-wrap">
                                                            <MessageSquare size={18} />
                                                        </div>
                                                        <div className="topbar-notif-text">
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <div className="topbar-notif-item-title">
                                                                    {c.last_message?.sender_name || 'Someone'}
                                                                    {c.unread_count > 0 && <span className="topbar-notif-unread-dot" />}
                                                                </div>
                                                                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                                                    {formatTimeAgo(c.updated_at)}
                                                                </span>
                                                            </div>
                                                            <div className={`topbar-notif-item-subject ${c.unread_count > 0 ? 'unread' : ''}`}>{c.subject}</div>
                                                            <div className="topbar-notif-item-sub">{c.last_message?.body || 'No messages yet.'}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                        
                                        {upcomingDeadlines.length > 0 && (
                                            <>
                                                <div className="topbar-notif-section-title">Upcoming Deadlines</div>
                                                {upcomingDeadlines.map(a => (
                                                    <div key={a.id} className="topbar-notif-item" onClick={() => { 
                                                        setNotifOpen(false); 
                                                        const isInstructor = user?.role === AUTH_ROLES.FACULTY || user?.role === AUTH_ROLES.TA;
                                                        const basePath = isInstructor ? '/faculty' : '/student';
                                                        navigate(`${basePath}/courses/${a.course_id}/assignments/${a.id}${isInstructor ? '/grading' : ''}`); 
                                                    }}>
                                                        <div className="topbar-notif-icon-wrap deadline">
                                                            <CalendarIcon size={18} />
                                                        </div>
                                                        <div className="topbar-notif-text">
                                                            <div className="topbar-notif-item-title">{a.title}</div>
                                                            <div className="topbar-notif-item-sub">Due {formatDue(a.due_date)}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="topbar-notif-footer">
                                <button
                                    className="topbar-notif-viewall"
                                    onClick={() => {
                                        setNotifOpen(false);
                                        navigate('/inbox');
                                    }}
                                >
                                    <Inbox size={16} />
                                    Go to Inbox
                                    <ArrowRight size={14} style={{ marginLeft: 'auto' }} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Topbar;
