import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AUTH_ROLES, login } from '../../lib/auth';
import { loginRequest } from '../../lib/api';
import './Login.css';

const Login: React.FC = () => {
    const { role } = useParams<{ role: string }>();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const targetRole = role === 'faculty' ? AUTH_ROLES.FACULTY : AUTH_ROLES.STUDENT;
    const title = role === 'faculty' ? 'Faculty Login' : 'Student Login';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const user = await loginRequest(email, targetRole);

            // Check if role matches
            if (user.role !== targetRole) {
                setError(`This account is not registered as ${targetRole}.`);
                return;
            }

            // Mock password check for demo purposes (accept anything)
            if (password) {
                login({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                });
            }
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1 className="app-name">AutoGrade</h1>
                    <h2 className="login-title">{title}</h2>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>
                            {error}
                        </div>
                    )}
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
                        {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>

                <Link to="/" className="back-link">
                    &larr; Back to Role Selection
                </Link>
            </div>
        </div>
    );
};

export default Login;
