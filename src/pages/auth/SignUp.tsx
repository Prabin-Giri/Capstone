import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { login } from '../../lib/auth';
import { signupRequest } from '../../lib/api';
import './Login.css';

type SignupRole = 'student' | 'faculty';

const SignUp: React.FC = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [studentId, setStudentId] = useState('');
    const [role, setRole] = useState<SignupRole>('student');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

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
                role,
                student_id: role === 'student' ? studentId : undefined,
            });
            const verified = user.verified !== false;
            login({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role as any,
                profilePicture: user.profile_picture,
                verified,
            });
        } catch (err: any) {
            setError(err.message || 'Sign up failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="auth-shell auth-shell-signup">
                {/* Left: maroon branding (exact layout from image) */}
                <div className="auth-brand-side">
                    <div className="auth-logo-circle-signup">
                        <img src="/ulm-logo.png" alt="ULM Logo" className="auth-logo-img" />
                    </div>
                    <h1 className="auth-brand-title">Automated Grading tool</h1>
                    <p className="auth-brand-subtitle">
                        Submit code, run test cases, and manage grades for every class in one place.
                    </p>
                    <div className="auth-pill-list">
                        <span className="auth-pill-btn">Auto-graded assignments</span>
                        <span className="auth-pill-btn">Python / Java code runner</span>
                        <span className="auth-pill-btn">Faculty & TA dashboards</span>
                        <span className="auth-pill-btn">Student gradebook</span>
                    </div>
                </div>

                {/* Right: white form */}
                <div className="auth-form-side">
                    <div className="auth-form-header auth-form-header-row">
                        <h2 className="auth-form-title">Create new Account</h2>
                        <p className="auth-form-subtitle auth-form-subtitle-right">
                            Already registered? <Link to="/login" className="auth-switch-link">Login</Link>
                        </p>
                    </div>

                    <form className="login-form" onSubmit={handleSubmit}>
                        {error && (
                            <div className="login-error">{error}</div>
                        )}

                        <div className="form-group">
                            <label className="form-label" htmlFor="name">Please enter your name</label>
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
                            <label className="form-label" htmlFor="email">Please enter Email</label>
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

                        {role === 'student' && (
                            <div className="form-group">
                                <label className="form-label" htmlFor="studentId">Please enter Student ID</label>
                                <input
                                    id="studentId"
                                    type="text"
                                    className="form-input"
                                    value={studentId}
                                    onChange={(e) => setStudentId(e.target.value)}
                                    placeholder="e.g. 20054321"
                                    required={role === 'student'}
                                />
                            </div>
                        )}

                        <div className="form-group form-group-role">
                            <span className="form-label">Role</span>
                            <div className="role-ticks">
                                <label className="role-tick">
                                    <input
                                        type="radio"
                                        name="role"
                                        value="student"
                                        checked={role === 'student'}
                                        onChange={() => setRole('student')}
                                    />
                                    <span className="role-tick-label">Student</span>
                                </label>
                                <label className="role-tick">
                                    <input
                                        type="radio"
                                        name="role"
                                        value="faculty"
                                        checked={role === 'faculty'}
                                        onChange={() => setRole('faculty')}
                                    />
                                    <span className="role-tick-label">Faculty</span>
                                </label>
                            </div>
                            {role === 'faculty' && (
                                <span className="form-hint">
                                    Sign up as Faculty to create courses and enroll students. An admin must verify your account before you can access the dashboard.
                                </span>
                            )}
                            {role === 'student' && (
                                <span className="form-hint">
                                    Students are added to classes by faculty. After signup, you will see only courses you are enrolled in.
                                </span>
                            )}
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="password">Please enter password</label>
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
                            <label className="form-label" htmlFor="confirmPassword">Confirm password</label>
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

                        <button type="submit" className="submit-btn submit-btn-primary submit-btn-signup" disabled={loading}>
                            {loading ? 'Creating account...' : 'SIGN UP'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default SignUp;
