import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CheckCircle, ChevronLeft } from 'lucide-react';
import { forgotPassword } from '../../lib/api';
import { AgnosTitle } from '../../components/branding/AgnosTitle';
import './Login.css';

const ForgotPassword: React.FC = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) {
            setError('Please enter your email address');
            return;
        }

        setLoading(true);
        setError('');
        try {
            await forgotPassword(email.trim());
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="auth-card">
                <div className="auth-card-logo">
                    <AgnosTitle variant="auth" />
                </div>

                {success ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0.5rem 0' }}>
                        <CheckCircle size={48} color="#16a34a" />
                        <h2 style={{ color: '#1f2937', marginTop: '0.75rem', fontSize: '1.25rem' }}>Check Your Email</h2>
                        <p style={{ color: '#6b7280', fontSize: '0.85rem', lineHeight: 1.5, maxWidth: 280, margin: '0.5rem auto 0' }}>
                            If an account with <strong>{email}</strong> exists, we've sent a password reset link. Check your inbox.
                        </p>
                        <Link to="/login" className="submit-btn submit-btn-primary" style={{ marginTop: '1.5rem', width: '100%' }}>
                            Back to Login
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="auth-form-header">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', margin: '0 auto 0.5rem' }}>
                                <Mail size={28} color="#7f1d1d" />
                            </div>
                            <h2 className="auth-form-title">Forgot Password?</h2>
                            <p className="auth-form-subtitle">Enter your email and we'll send you a reset link</p>
                        </div>

                        {error && <p className="login-error">{error}</p>}

                        <form className="login-form" onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label" htmlFor="email">Email Address</label>
                                <input
                                    id="email"
                                    type="email"
                                    className="form-input"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@university.edu"
                                    required
                                    autoFocus
                                />
                            </div>

                            <button type="submit" className="submit-btn submit-btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
                                {loading ? 'Sending...' : 'Send Reset Link'}
                            </button>
                        </form>

                        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                            <Link to="/login" className="back-link-inline" style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <ChevronLeft size={14} /> Back to Login
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ForgotPassword;
