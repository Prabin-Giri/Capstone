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

    if (!token) {
        return (
            <div className="login-container">
                <div className="auth-card">
                    <div className="auth-card-logo">
                        <img src="/ulm-logo.png" alt="Agnos" />
                        <h1 className="auth-card-logo-name">Agnos</h1>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <AlertCircle size={48} color="#ef4444" />
                        <h2 style={{ color: '#1f2937', marginTop: '0.75rem', fontSize: '1.2rem' }}>Invalid Reset Link</h2>
                        <p style={{ color: '#6b7280', fontSize: '0.85rem', maxWidth: 280 }}>
                            This password reset link is invalid or has expired.
                        </p>
                        <Link to="/forgot-password" className="submit-btn submit-btn-primary" style={{ marginTop: '1.25rem', width: '100%' }}>
                            Request New Link
                        </Link>
                        <Link to="/login" className="back-link-inline" style={{ marginTop: '0.75rem', fontSize: '0.78rem' }}>
                            Back to Login
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-container">
            <div className="auth-card">
                <div className="auth-card-logo">
                    <img src="/ulm-logo.png" alt="Agnos" />
                    <h1 className="auth-card-logo-name">Agnos</h1>
                </div>

                {success ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0.5rem 0' }}>
                        <CheckCircle size={48} color="#16a34a" />
                        <h2 style={{ color: '#1f2937', marginTop: '0.75rem', fontSize: '1.25rem' }}>Password Reset!</h2>
                        <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                            Your password has been updated successfully.
                        </p>
                        <Link to="/login" className="submit-btn submit-btn-primary" style={{ marginTop: '1.25rem', width: '100%' }}>
                            Go to Login
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="auth-form-header">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', margin: '0 auto 0.5rem' }}>
                                <Lock size={28} color="#7f1d1d" />
                            </div>
                            <h2 className="auth-form-title">Reset Password</h2>
                            <p className="auth-form-subtitle">Enter your new password below</p>
                        </div>

                        {error && <p className="login-error">{error}</p>}

                        <form className="login-form" onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label" htmlFor="new-password">New Password</label>
                                <div className="form-input-wrap">
                                    <input
                                        id="new-password"
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-input"
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
                                    <div className="form-requirements">
                                        {([
                                            ['length', '8+ characters'],
                                            ['letter', 'Letter'],
                                            ['number', 'Number'],
                                            ['special', 'Special char'],
                                        ] as const).map(([key, label]) => (
                                            <span key={key} className={`form-requirement ${checks[key] ? 'is-valid' : ''}`}>
                                                {checks[key] ? <Check size={12} /> : <X size={12} />} {label}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="confirm-password">Confirm Password</label>
                                <div className="form-input-wrap">
                                    <input
                                        id="confirm-password"
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-input"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        style={confirmPassword && !passwordsMatch ? { borderColor: '#ef4444' } : undefined}
                                    />
                                </div>
                                {confirmPassword && !passwordsMatch && (
                                    <span className="form-inline-error">Passwords do not match</span>
                                )}
                            </div>

                            <button
                                type="submit"
                                className="submit-btn submit-btn-primary"
                                disabled={loading || !allValid || !passwordsMatch}
                                style={{ marginTop: '0.25rem' }}
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
        </div>
    );
};

export default ResetPassword;
