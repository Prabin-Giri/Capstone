export const AUTH_ROLES = {
    STUDENT: 'student',
    FACULTY: 'faculty',
    TA: 'ta',
    ADMIN: 'admin',
} as const;

export type AuthRole = typeof AUTH_ROLES[keyof typeof AUTH_ROLES];

const SESSION_KEY = 'autograde_session';

export interface UserSession {
    id: string;
    name: string;
    email: string;
    role: AuthRole;
    profilePicture?: string;
    verified?: boolean;
}

export const updateUser = (updates: Partial<UserSession>) => {
    const current = getSession();
    if (current) {
        const updated = { ...current, ...updates };
        localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
        // Optional: Trigger a custom event to notify other components
        window.dispatchEvent(new Event('user-profile-updated'));
    }
};

export const getSession = (): UserSession | null => {
    const session = localStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
};

export const getRole = (): AuthRole | null => {
    const session = getSession();
    return session ? session.role : null;
};

export const getUser = (): UserSession | null => {
    return getSession();
};
export const login = (user: UserSession) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    if (user.role === AUTH_ROLES.ADMIN) {
        window.location.href = '/admin';
    } else if (user.role === AUTH_ROLES.FACULTY) {
        window.location.href = user.verified ? '/faculty' : '/faculty/pending';
    } else if (user.role === AUTH_ROLES.TA) {
        window.location.href = '/student';
    } else {
        window.location.href = '/student';
    }
};

export const isFacultyVerified = (): boolean => {
    const s = getSession();
    return !!(s && s.role === AUTH_ROLES.FACULTY && s.verified);
};

export const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = '/';
};

export const isAuthenticated = (): boolean => {
    return !!getSession();
};
