import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { login } from '../../lib/auth';
import { signupRequest } from '../../lib/api';
import './Login.css';

type SignupRole = 'student' | 'faculty';

function inferRoleFromEmail(email: string): SignupRole | null {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.endsWith('@warhawks.ulm.edu')) {
        return 'student';
    }
    if (normalizedEmail.endsWith('@ulm.edu')) {
        return 'faculty';
    }
    return null;
}

const SignUp: React.FC = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [studentId, setStudentId] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const inferredRole = inferRoleFromEmail(email);
    const isStudentSignup = inferredRole === 'student';

    const passwordChecks = {
        length: password.length >= 8,
        letter: /[a-zA-Z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^a-zA-Z0-9]/.test(password),
    };

    const isPasswordValid = passwordChecks.length && passwordChecks.letter && passwordChecks.number && passwordChecks.special;
    const passwordsMatch = password === confirmPassword;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!isPasswordValid) {
            setError('Password must be at least 8 characters and include a letter, number, and special character');
            return;
        }

        if (!inferredRole) {
            setError('Use a @warhawks.ulm.edu student email or an @ulm.edu faculty email');
            return;
        }

        if (isStudentSignup && !studentId.trim()) {
            setError('Student ID is required for @warhawks.ulm.edu accounts');
            return;
        }

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
                student_id: isStudentSignup ? studentId : undefined,
            });
            const verified = user.verified !== false;
            login({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role as any,
                profilePicture: user.profile_picture,
                verified,
                emailVerified: user.email_verified === true,
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
                            <span className="form-hint">
                                {inferredRole === 'student'
                                    ? 'Detected as Student account from @warhawks.ulm.edu email.'
                                    : inferredRole === 'faculty'
                                        ? 'Detected as Faculty account from @ulm.edu email.'
                                        : 'Use @warhawks.ulm.edu for students or @ulm.edu for faculty.'}
                            </span>
                        </div>

                        {isStudentSignup && (
                            <div className="form-group">
                                <label className="form-label" htmlFor="studentId">Please enter Student ID</label>
                                <input
                                    id="studentId"
                                    type="text"
                                    className="form-input"
                                    value={studentId}
                                    onChange={(e) => setStudentId(e.target.value)}
                                    placeholder="e.g. 20054321"
                                    required={isStudentSignup}
                                />
                            </div>
                        )}

                        {inferredRole && (
                            <div className="form-group">
                                <span className="form-hint">
                                    {inferredRole === 'faculty'
                                        ? 'Faculty accounts require admin approval before dashboard access.'
                                        : 'Students are added to classes by faculty after signup.'}
                                </span>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label" htmlFor="password">Please enter password</label>
                            <div className="form-input-wrap">
                                <input
                                    id="password"
                                    type={showPasswords ? 'text' : 'password'}
                                    className="form-input"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Letters, numbers & special characters"
                                    autoComplete="new-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="form-password-toggle"
                                    onClick={() => setShowPasswords((prev) => !prev)}
                                    aria-label={showPasswords ? 'Hide password' : 'Show password'}
                                >
                                    {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {password && (
                                <div className="form-requirements">
                                    {([
                                        ['length', '8+ characters'],
                                        ['letter', 'Letter'],
                                        ['number', 'Number'],
                                        ['special', 'Special char'],
                                    ] as const).map(([key, label]) => (
                                        <span
                                            key={key}
                                            className={`form-requirement ${passwordChecks[key] ? 'is-valid' : ''}`}
                                        >
                                            {passwordChecks[key] ? <Check size={12} /> : <X size={12} />}
                                            {label}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="confirmPassword">Confirm password</label>
                            <div className="form-input-wrap">
                                <input
                                    id="confirmPassword"
                                    type={showPasswords ? 'text' : 'password'}
                                    className="form-input"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter password"
                                    autoComplete="new-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="form-password-toggle"
                                    onClick={() => setShowPasswords((prev) => !prev)}
                                    aria-label={showPasswords ? 'Hide password' : 'Show password'}
                                >
                                    {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {confirmPassword && !passwordsMatch && (
                                <span className="form-inline-error">Passwords do not match</span>
                            )}
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
