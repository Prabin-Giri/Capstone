import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getRole, getSession, type AuthRole } from '../../lib/auth';

interface ProtectedRouteProps {
    /** Single role or array of roles (any match allows access). Use array to allow e.g. TA + student. */
    requiredRole: AuthRole | AuthRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole }) => {
    const currentRole = getRole();
    const session = getSession();

    if (!currentRole) {
        return <Navigate to="/" replace />;
    }

    // Redirect to email verification if not verified
    if (session && session.emailVerified === false) {
        return <Navigate to="/verify-email" replace />;
    }

    const allowed = Array.isArray(requiredRole)
        ? requiredRole.includes(currentRole)
        : currentRole === requiredRole;
    if (!allowed) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
