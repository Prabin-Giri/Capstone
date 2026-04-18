import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { login } from '../../lib/auth';
import { loginRequest } from '../../lib/api';
import { AgnosTitle } from '../../components/branding/AgnosTitle';
import './Login.css';

const REMEMBER_KEY = 'login_remember_email';

const Login: React.FC = () => {
    const [email, setEmail] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem(REMEMBER_KEY) || '') : '');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(!!(typeof window !== 'undefined' && localStorage.getItem(REMEMBER_KEY)));
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        if (remember && typeof window !== 'undefined') {
            localStorage.setItem(REMEMBER_KEY, email);
        } else if (typeof window !== 'undefined') {
            localStorage.removeItem(REMEMBER_KEY);
        }

        try {
            const user = await loginRequest(email, password);
            const verified = user.verified !== false;
            login({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role as any,
                profilePicture: user.profile_picture,
                verified,
                emailVerified: user.email_verified !== false,
            });
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
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

                <div className="auth-form-header">
                    <h2 className="auth-form-title">Welcome back</h2>
                    <p className="auth-form-subtitle">Sign in to your account</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && <div className="login-error">{error}</div>}

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
                        <div className="form-input-wrap">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                className="form-input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
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
                    </div>

                    <div className="login-options">
                        <label className="login-remember">
                            <input
                                type="checkbox"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                            />
                            <span>Remember me</span>
                        </label>
                        <Link to="/forgot-password" className="login-forgot">Forgot password?</Link>
                    </div>

                    <button type="submit" className="submit-btn submit-btn-primary" disabled={loading}>
                        {loading ? 'Signing in...' : 'Log In'}
                    </button>
                </form>

                <div className="auth-card-footer">
                    Don't have an account? <Link to="/signup">Sign up</Link>
                </div>
            </div>
        </div>
    );
};

export default Login;
