export const AUTH_ROLES = {
    STUDENT: 'student',
    FACULTY: 'faculty',
} as const;

export type AuthRole = typeof AUTH_ROLES[keyof typeof AUTH_ROLES];

const SESSION_KEY = 'autograde_session';

export interface UserSession {
    id: string;
    name: string;
    email: string;
    role: AuthRole;
}

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
    window.location.href = user.role === AUTH_ROLES.FACULTY ? '/faculty' : '/student';
};

export const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = '/';
};

export const isAuthenticated = (): boolean => {
    return !!getSession();
};
