import React from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';
import './auth/Login.css';

const LandingPage: React.FC = () => {
    return (
        <div className="landing-container">
            <div className="auth-shell landing-shell">
                {/* Left: white card - sign in / sign up */}
                <div className="auth-form-side">
                    <div className="auth-form-header">
                        <h2 className="auth-form-title">Welcome again!</h2>
                        <p className="auth-form-subtitle">Please sign in or create an account to continue.</p>
                    </div>

                    <div className="landing-actions">
                        <Link to="/login" className="submit-btn submit-btn-primary landing-cta">
                            Log In
                        </Link>
                        <Link to="/signup" className="submit-btn submit-btn-secondary landing-cta">
                            Sign up
                        </Link>
                    </div>

                    <p className="landing-hint">
                        Use one account for student, faculty, or admin. Faculty accounts require admin verification.
                    </p>
                </div>

                {/* Right: maroon branding */}
                <div className="auth-brand-side">
                    <img src="/ulm-logo.png" alt="ULM Logo" className="auth-logo-img" />
                    <h1 className="auth-brand-title">Automated Grading tool</h1>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
