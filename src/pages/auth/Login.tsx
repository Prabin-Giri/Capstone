import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AUTH_ROLES, login } from '../../lib/auth';
import './Login.css';

const Login: React.FC = () => {
    const { role } = useParams<{ role: string }>();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const targetRole = role === 'faculty' ? AUTH_ROLES.FACULTY : AUTH_ROLES.STUDENT;
    const title = role === 'faculty' ? 'Faculty Login' : 'Student Login';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (email && password) {
            // Mock login - strictly frontend
            login(targetRole);
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

                    <button type="submit" className="submit-btn">
                        Sign in
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
