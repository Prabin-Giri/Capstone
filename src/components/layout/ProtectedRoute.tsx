import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getRole, type AuthRole } from '../../lib/auth';

interface ProtectedRouteProps {
    requiredRole: AuthRole;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole }) => {
    const currentRole = getRole();

    if (!currentRole) {
        // Not logged in -> Redirect to landing
        return <Navigate to="/" replace />;
    }

    if (currentRole !== requiredRole) {
        // Wrong role -> Redirect to correct dashboard or landing
        // For simplicity V1, just clear and go to landing to force re-login
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
