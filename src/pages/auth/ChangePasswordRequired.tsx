import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { changePassword } from '../../lib/api';
import { getSession, updateUser, redirectToDashboard, logout, AUTH_ROLES, type UserSession } from '../../lib/auth';
import { AgnosTitle } from '../../components/branding/AgnosTitle';
import './Login.css';

function dashboardPath(s: UserSession): string {
    if (s.role === AUTH_ROLES.ADMIN) return '/admin';
    if (s.role === AUTH_ROLES.FACULTY) return s.verified !== false ? '/faculty' : '/faculty/pending';
    return '/student';
}

/**
 * Shown after login when the account was created with a default password (e.g. faculty CSV enroll).
 * User must set a new password before using the app.
 */
const ChangePasswordRequired: React.FC = () => {
    const session = typeof window !== 'undefined' ? getSession() : null;
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    if (session.mustChangePassword !== true) {
        return <Navigate to={dashboardPath(session)} replace />;
    }

    const checks = {
        length: newPassword.length >= 8,
        letter: /[a-zA-Z]/.test(newPassword),
        number: /[0-9]/.test(newPassword),
        special: /[^a-zA-Z0-9]/.test(newPassword),
    };
    const allValid = checks.length && checks.letter && checks.number && checks.special;
    const passwordsMatch = newPassword === confirmPassword;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!currentPassword.trim()) {
            setError('Enter your current (temporary) password.');
            return;
        }
        if (!allValid) {
            setError('New password must be at least 8 characters and include a letter, a number, and a special character.');
            return;
        }
        if (!passwordsMatch) {
            setError('New passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            await changePassword(session.id, currentPassword, newPassword);
            updateUser({ mustChangePassword: false });
            const after = getSession();
            if (after) redirectToDashboard(after);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not update password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="auth-card" style={{ maxWidth: 420 }}>
                <div className="auth-card-logo">
                    <AgnosTitle variant="auth" />
                </div>
                <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', color: '#1f2937' }}>Choose a new password</h2>
                <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.45 }}>
                    Your account was created with a default password. For security, set a new password before continuing.
                </p>
                <form className="login-form" onSubmit={handleSubmit}>
                    {error && <div className="login-error">{error}</div>}
                    <div className="form-group">
                        <label htmlFor="cur-pw">Current password</label>
                        <div className="password-input-wrapper">
                            <Lock size={16} className="input-icon" />
                            <input
                                id="cur-pw"
                                type={showCurrent ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Temporary / default password"
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowCurrent(!showCurrent)}
                                aria-label={showCurrent ? 'Hide password' : 'Show password'}
                            >
                                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="new-pw">New password</label>
                        <div className="password-input-wrapper">
                            <Lock size={16} className="input-icon" />
                            <input
                                id="new-pw"
                                type={showNew ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="8+ chars, letter, number, symbol"
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowNew(!showNew)}
                                aria-label={showNew ? 'Hide password' : 'Show password'}
                            >
                                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="conf-pw">Confirm new password</label>
                        <input
                            id="conf-pw"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repeat new password"
                            autoComplete="new-password"
                        />
                    </div>
                    <button type="submit" className="submit-btn submit-btn-primary" disabled={loading}>
                        {loading ? 'Saving…' : 'Save and continue'}
                    </button>
                </form>
                <p style={{ marginTop: '1rem', fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center' }}>
                    <button type="button" className="back-link-inline" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }} onClick={() => logout()}>
                        Sign out
                    </button>
                    {' · '}
                    <Link to="/login" className="back-link-inline">
                        Back to login
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default ChangePasswordRequired;
