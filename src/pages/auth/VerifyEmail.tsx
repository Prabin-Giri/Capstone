import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader, Mail } from 'lucide-react';
import { verifyEmailByOtp, verifyEmailByToken, resendVerificationEmail } from '../../lib/api';
import { getSession, updateUser, redirectToDashboard } from '../../lib/auth';
import './Login.css';
import './VerifyEmail.css';

const VerifyEmail: React.FC = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const session = getSession();

    const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [tokenVerifying, setTokenVerifying] = useState(!!token);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Auto-verify via token from email link
    useEffect(() => {
        if (!token) return;
        setTokenVerifying(true);
        verifyEmailByToken(token)
            .then((user) => {
                updateUser({ emailVerified: true, verified: user.verified });
                setSuccess(true);
                setTimeout(() => {
                    const updated = getSession();
                    if (updated) redirectToDashboard(updated);
                }, 1500);
            })
            .catch((err) => {
                setError(err.message || 'Invalid or expired verification link');
                setTokenVerifying(false);
            });
    }, [token]);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendCooldown]);

    // Redirect if already verified or no session
    useEffect(() => {
        if (!session) {
            window.location.href = '/login';
            return;
        }
        if (session.emailVerified) {
            redirectToDashboard(session);
        }
    }, []);

    const handleOtpChange = useCallback((index: number, value: string) => {
        if (value.length > 1) {
            // Handle paste: distribute digits across boxes
            const digits = value.replace(/\D/g, '').slice(0, 6).split('');
            const newOtp = [...otp];
            digits.forEach((d, i) => {
                if (index + i < 6) newOtp[index + i] = d;
            });
            setOtp(newOtp);
            const focusIndex = Math.min(index + digits.length, 5);
            inputRefs.current[focusIndex]?.focus();
            return;
        }

        if (value && !/^\d$/.test(value)) return;

        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);

        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    }, [otp]);

    const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    }, [otp]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = otp.join('');
        if (code.length !== 6) {
            setError('Please enter the complete 6-digit code');
            return;
        }
        if (!session?.email) {
            setError('No email found. Please log in again.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const user = await verifyEmailByOtp(session.email, code);
            updateUser({ emailVerified: true, verified: user.verified });
            setSuccess(true);
            setTimeout(() => {
                const updated = getSession();
                if (updated) redirectToDashboard(updated);
            }, 1500);
        } catch (err: any) {
            setError(err.message || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0 || !session?.email) return;
        try {
            await resendVerificationEmail(session.email);
            setResendCooldown(60);
            setError('');
        } catch (err: any) {
            setError(err.message || 'Failed to resend verification email');
        }
    };

    if (!session) return null;

    // Token verification in progress
    if (tokenVerifying) {
        return (
            <div className="login-container">
                <div className="auth-shell">
                    <div className="auth-form-side" style={{ alignItems: 'center', textAlign: 'center' }}>
                        <Loader size={40} className="verify-spinner" />
                        <p style={{ color: '#6b7280', marginTop: '1rem' }}>Verifying your email...</p>
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
                        <div className="verify-success">
                            <CheckCircle size={48} color="#16a34a" />
                            <h2 style={{ color: '#1f2937', marginTop: '0.75rem' }}>Email Verified!</h2>
                            <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Redirecting to your dashboard...</p>
                        </div>
                    ) : (
                        <>
                            <div className="auth-form-header">
                                <div className="verify-icon-wrap">
                                    <Mail size={32} color="#7f1d1d" />
                                </div>
                                <h1 className="auth-form-title">Verify Your Email</h1>
                                <p className="auth-form-subtitle">
                                    We sent a verification code to <strong>{session.email}</strong>
                                </p>
                            </div>

                            {error && <p className="login-error">{error}</p>}

                            <form className="login-form" onSubmit={handleSubmit}>
                                <div className="otp-container">
                                    {otp.map((digit, i) => (
                                        <input
                                            key={i}
                                            ref={(el) => { inputRefs.current[i] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            className={`otp-box${digit ? ' otp-box-filled' : ''}`}
                                            value={digit}
                                            onChange={(e) => handleOtpChange(i, e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(i, e)}
                                            autoFocus={i === 0}
                                        />
                                    ))}
                                </div>

                                <button type="submit" className="submit-btn submit-btn-primary" disabled={loading}>
                                    {loading ? 'Verifying...' : 'Verify Email'}
                                </button>
                            </form>

                            <div className="verify-resend">
                                <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>Didn't receive the code?</span>
                                <button
                                    type="button"
                                    className="verify-resend-btn"
                                    onClick={handleResend}
                                    disabled={resendCooldown > 0}
                                >
                                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                                </button>
                            </div>

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

export default VerifyEmail;
