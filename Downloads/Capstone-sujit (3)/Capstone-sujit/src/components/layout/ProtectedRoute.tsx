import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getRole, type AuthRole } from '../../lib/auth';

interface ProtectedRouteProps {
    requiredRole: AuthRole | AuthRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole }) => {
    const currentRole = getRole();

    if (!currentRole) {
        // Not logged in -> Redirect to landing
        return <Navigate to="/" replace />;
    }

    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowedRoles.includes(currentRole)) {
        // Wrong role -> Redirect to landing to force re-login
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
