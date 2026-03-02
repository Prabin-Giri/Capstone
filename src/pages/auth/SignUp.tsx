import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AUTH_ROLES, login } from '../../lib/auth';
import { signupRequest } from '../../lib/api';
import './Login.css';

const SignUp: React.FC = () => {
    const { role } = useParams<{ role: string }>();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const targetRole = role === 'faculty' ? AUTH_ROLES.FACULTY : (role === 'ta' ? AUTH_ROLES.TA : AUTH_ROLES.STUDENT);
    const title = role === 'faculty' ? 'Faculty Sign Up' : (role === 'ta' ? 'TA Sign Up' : 'Student Sign Up');

    const handleSubmit = async (e: React.FormEvent) => {
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
                role: targetRole
            });

            // Automatically log in after successful signup
            login({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role as any,
                profilePicture: user.profile_picture
            });
        } catch (err: any) {
            setError(err.message || 'Sign up failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header" style={{ textAlign: 'center' }}>
                    <div className="brand-container" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
                        <img src="/ulm-logo.png" alt="ULM Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                    </div>
                    <h2 className="login-title">{title}</h2>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>
                            {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label" htmlFor="name">Full Name</label>
                        <input
                            id="name"
                            type="text"
                            className="form-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="John Doe"
                            required
                        />
                    </div>

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

                    <div className="form-group">
                        <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            className="form-input"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? 'Creating account...' : 'Create Account'}
                    </button>

                    <div className="auth-footer">
                        Already have an account? <Link to={`/login/${role}`}>Sign In</Link>
                    </div>
                </form>

                <Link to="/" className="back-link">
                    &larr; Back to Role Selection
                </Link>
            </div>
        </div>
    );
};

export default SignUp;
