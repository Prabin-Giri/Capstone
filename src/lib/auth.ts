export const AUTH_ROLES = {
    STUDENT: 'student',
    FACULTY: 'faculty',
} as const;

export type AuthRole = typeof AUTH_ROLES[keyof typeof AUTH_ROLES];

const STORAGE_KEY = 'autograde_role';

export const getRole = (): AuthRole | null => {
    return localStorage.getItem(STORAGE_KEY) as AuthRole | null;
};

export const login = (role: AuthRole) => {
    localStorage.setItem(STORAGE_KEY, role);
    window.location.href = role === AUTH_ROLES.FACULTY ? '/faculty' : '/student';
};

export const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.href = '/';
};

export const isAuthenticated = (): boolean => {
    return !!getRole();
};
