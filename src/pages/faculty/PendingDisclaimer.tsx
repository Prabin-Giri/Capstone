import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getSession, logout, updateUser } from '../../lib/auth';
import { checkUserVerified } from '../../lib/api';
import './PendingDisclaimer.css';

const PendingDisclaimer: React.FC = () => {
    const navigate = useNavigate();
    const [checking, setChecking] = useState(false);
    const session = getSession();

    if (!session || session.role !== 'faculty') {
        return <Navigate to="/" replace />;
    }
    if (session.verified) {
        return <Navigate to="/faculty" replace />;
    }

    const handleCheckStatus = async () => {
        setChecking(true);
        try {
            const { verified } = await checkUserVerified(session.id);
            if (verified) {
                updateUser({ verified: true });
                navigate('/faculty', { replace: true });
            }
        } catch {
            // keep on pending page
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="pending-disclaimer">
            <div className="pending-card">
                <div className="pending-icon">⏳</div>
                <h1 className="pending-title">Account pending verification</h1>
                <p className="pending-message">
                    Your faculty account has been created and is waiting for admin approval.
                    Once an administrator verifies your account, you can access the faculty dashboard,
                    create courses, enroll students in your classes, and manage assignments.
                </p>
                <p className="pending-note">
                    Only verified faculty can enroll students in courses. Students sign up as &quot;Student&quot; and are added to classes by faculty.
                </p>
                <div className="pending-actions">
                    <button
                        type="button"
                        className="pending-check-btn"
                        onClick={handleCheckStatus}
                        disabled={checking}
                    >
                        {checking ? 'Checking…' : 'Check verification status'}
                    </button>
                    <button type="button" className="pending-logout-btn" onClick={() => logout()}>
                        Sign out
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PendingDisclaimer;
