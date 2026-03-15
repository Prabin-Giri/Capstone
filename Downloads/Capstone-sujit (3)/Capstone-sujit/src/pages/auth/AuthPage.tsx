import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AUTH_ROLES, login, type AuthRole } from '../../lib/auth';
import { loginRequest, signupRequest } from '../../lib/api';
import './Login.css';

type Mode = 'signin' | 'signup';

const AuthPage: React.FC = () => {
    const location = useLocation();

    const isSignupPath = location.pathname.startsWith('/signup');
    const [mode, setMode] = useState<Mode>(isSignupPath ? 'signup' : 'signin');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const user = await loginRequest(email, password);
            // No role (null) = just a user; normalize to USER for routing
            login({
                id: user.id,
                name: user.name,
                email: user.email,
                role: (user.role ?? AUTH_ROLES.USER) as AuthRole,
                profilePicture: user.profile_picture,
            });
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);
        try {
            const user = await signupRequest({
                name,
                email,
                password,
                role: AUTH_ROLES.USER, // ignored; server creates user with no role
            });
            // New signups have no role (null); normalize to USER for routing
            login({
                id: user.id,
                name: user.name,
                email: user.email,
                role: (user.role ?? AUTH_ROLES.USER) as AuthRole,
                profilePicture: user.profile_picture,
            });
        } catch (err: any) {
            setError(err.message || 'Sign up failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const onTabChange = (nextMode: Mode) => {
        setError(null);
        setMode(nextMode);
    };

    return (
        <div className="login-container">
            <div className={`auth-card-2col ${mode === 'signup' ? 'auth-card-signup' : ''}`}>
                {/* Sign in: left = branding, right = form. Sign up: left = form, right = branding + CTA */}
                {mode === 'signin' && (
                    <div className="auth-left">
                        <div className="auth-left-inner">
                            <div className="auth-logo-wrapper">
                                <img src="/ulm-logo.png" alt="ULM Logo" className="auth-logo" />
                            </div>
                            <div className="auth-brand">
                                <span className="auth-brand-name">AUTOGRADE</span>
                            </div>
                            <p className="auth-tagline">
                                One place where students submit, TAs grade, and faculty get real-time insight.
                            </p>
                            <div className="auth-highlights">
                                <div className="auth-highlight-pill">Smart grading</div>
                                <div className="auth-highlight-pill">Plagiarism hints</div>
                                <div className="auth-highlight-pill">Course-wide overview</div>
                                <div className="auth-highlight-pill">Live code editor</div>
                                <div className="auth-highlight-pill">Instant test feedback</div>
                                <div className="auth-highlight-pill">Enrolled-classes calendar</div>
                            </div>
                            <div className="auth-microcopy">
                                Built for ULM to simplify CSCI assignments, grading, and feedback loops.
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'signup' && (
                    <div className="auth-create-left">
                        <h2 className="auth-create-title">Create Account</h2>
                        {error && (
                            <div className="auth-error">
                                {error}
                            </div>
                        )}
                        <form className="login-form auth-create-form" onSubmit={handleSignUp}>
                            <div className="form-group">
                                <label className="form-label" htmlFor="signup-name">Full Name</label>
                                <input
                                    id="signup-name"
                                    type="text"
                                    className="form-input"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="John Doe"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="signup-email">Email</label>
                                <input
                                    id="signup-email"
                                    type="email"
                                    className="form-input"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@university.edu"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="signup-password">Password</label>
                                <input
                                    id="signup-password"
                                    type="password"
                                    className="form-input"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="signup-confirm">Confirm Password</label>
                                <input
                                    id="signup-confirm"
                                    type="password"
                                    className="form-input"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <button type="submit" className="submit-btn auth-signup-btn" disabled={loading}>
                                {loading ? 'Creating account...' : 'Sign Up'}
                            </button>
                        </form>
                    </div>
                )}

                {mode === 'signup' && (
                    <div className="auth-cta-right">
                        <div className="auth-cta-inner">
                            <div className="auth-logo-wrapper">
                                <img src="/ulm-logo.png" alt="ULM Logo" className="auth-logo" />
                            </div>
                            <div className="auth-brand">
                                <span className="auth-brand-name">AUTOGRADE</span>
                            </div>
                            <h2 className="auth-cta-heading">Get Started</h2>
                            <p className="auth-cta-sub">Already have an account?</p>
                            <button
                                type="button"
                                onClick={() => onTabChange('signin')}
                                className="auth-cta-login-btn"
                            >
                                Log in
                            </button>
                            <div className="auth-bubbles">
                                <span className="auth-bubble auth-bubble-active" aria-hidden />
                                <span className="auth-bubble" aria-hidden />
                                <span className="auth-bubble" aria-hidden />
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'signin' && (
                    <div className="auth-right">
                        <div className="auth-right-inner">
                            <h2 className="auth-title">Get Started</h2>
                            <p className="auth-subtitle">Sign in to your AutoGrade account.</p>
                            {error && (
                                <div className="auth-error">
                                    {error}
                                </div>
                            )}
                            <form className="login-form" onSubmit={handleSignIn}>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="email">Email</label>
                                    <input
                                        id="email"
                                        type="email"
                                        className="form-input"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="name@university.edu"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="password">Password</label>
                                    <input
                                        id="password"
                                        type="password"
                                        className="form-input"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                                <button type="submit" className="submit-btn" disabled={loading}>
                                    {loading ? 'Signing in...' : 'Sign In'}
                                </button>
                                <div className="auth-footer">
                                    Don&apos;t have an account?{' '}
                                    <button type="button" onClick={() => onTabChange('signup')} className="auth-link-button">
                                        Create one
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthPage;

