import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, Check, X } from 'lucide-react';
import { resetPassword } from '../../lib/api';
import './Login.css';

const ResetPassword: React.FC = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

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
        if (!allValid) {
            setError('Password does not meet all requirements');
            return;
        }
        if (!passwordsMatch) {
            setError('Passwords do not match');
            return;
        }
        if (!token) return;

        setLoading(true);
        setError('');
        try {
            await resetPassword(token, newPassword);
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    // No token in URL
    if (!token) {
        return (
            <div className="login-container">
                <div className="auth-shell">
                    <div className="auth-form-side" style={{ alignItems: 'center', textAlign: 'center', padding: '2rem 1.25rem' }}>
                        <AlertCircle size={48} color="#ef4444" />
                        <h2 style={{ color: '#1f2937', marginTop: '0.75rem', fontSize: '1.2rem' }}>Invalid Reset Link</h2>
                        <p style={{ color: '#6b7280', fontSize: '0.85rem', maxWidth: 280 }}>
                            This password reset link is invalid or has expired.
                        </p>
                        <Link to="/forgot-password" className="submit-btn submit-btn-primary" style={{ marginTop: '1.25rem', width: '100%', maxWidth: 260 }}>
                            Request New Link
                        </Link>
                        <Link to="/login" className="back-link-inline" style={{ marginTop: '0.75rem', fontSize: '0.78rem' }}>
                            Back to Login
                        </Link>
                    </div>
                    <div className="auth-brand-side">
                        <img src="/ulm-logo.png" alt="ULM Logo" className="auth-logo-img" />
                        <h2 className="auth-brand-title">AutoGrade</h2>
                        <p className="auth-brand-subtitle">Automated Assignment Grading Platform</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-container">
            <div className="auth-shell">
                <div className="auth-form-side">
                    {success ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '1.5rem 0' }}>
                            <CheckCircle size={48} color="#16a34a" />
                            <h2 style={{ color: '#1f2937', marginTop: '0.75rem', fontSize: '1.25rem' }}>Password Reset!</h2>
                            <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                                Your password has been updated successfully.
                            </p>
                            <Link to="/login" className="submit-btn submit-btn-primary" style={{ marginTop: '1.25rem', width: '100%', maxWidth: 260 }}>
                                Go to Login
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="auth-form-header">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', marginBottom: '0.5rem' }}>
                                    <Lock size={28} color="#7f1d1d" />
                                </div>
                                <h1 className="auth-form-title">Reset Password</h1>
                                <p className="auth-form-subtitle">Enter your new password below</p>
                            </div>

                            {error && <p className="login-error">{error}</p>}

                            <form className="login-form" onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="new-password">New Password</label>
                                    <div className="form-input-wrap-underline">
                                        <input
                                            id="new-password"
                                            type={showPassword ? 'text' : 'password'}
                                            className="form-input form-input-underline"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            className="form-password-toggle"
                                            onClick={() => setShowPassword((p) => !p)}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                    {newPassword && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.75rem', marginTop: '0.35rem' }}>
                                            {([
                                                ['length', '8+ characters'],
                                                ['letter', 'Letter'],
                                                ['number', 'Number'],
                                                ['special', 'Special char'],
                                            ] as const).map(([key, label]) => (
                                                <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.68rem', color: checks[key] ? '#16a34a' : '#9ca3af' }}>
                                                    {checks[key] ? <Check size={12} /> : <X size={12} />} {label}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label className="form-label" htmlFor="confirm-password">Confirm Password</label>
                                    <div className="form-input-wrap-underline">
                                        <input
                                            id="confirm-password"
                                            type={showPassword ? 'text' : 'password'}
                                            className="form-input form-input-underline"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            style={confirmPassword && !passwordsMatch ? { borderBottomColor: '#ef4444' } : undefined}
                                        />
                                    </div>
                                    {confirmPassword && !passwordsMatch && (
                                        <span style={{ color: '#ef4444', fontSize: '0.7rem', marginTop: '0.2rem' }}>Passwords do not match</span>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    className="submit-btn submit-btn-primary"
                                    disabled={loading || !allValid || !passwordsMatch}
                                    style={{ marginTop: '0.5rem' }}
                                >
                                    {loading ? 'Resetting...' : 'Reset Password'}
                                </button>
                            </form>

                            <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                                <Link to="/login" className="back-link-inline" style={{ fontSize: '0.78rem' }}>
                                    Back to Login
                                </Link>
                            </div>
                        </>
                    )}
                </div>

                <div className="auth-brand-side">
                    <img src="/ulm-logo.png" alt="ULM Logo" className="auth-logo-img" />
                    <h2 className="auth-brand-title">AutoGrade</h2>
                    <p className="auth-brand-subtitle">Automated Assignment Grading Platform</p>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
