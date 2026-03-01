import React from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

const LandingPage: React.FC = () => {
    return (
        <div className="landing-container">
            <div className="landing-content">
                <h1 className="landing-title">AutoGrade</h1>
                <p className="landing-subtitle">
                    Intelligent grading and assignment management system.
                </p>

                <div className="role-cards">
                    <Link to="/login/student" className="role-card">
                        <span className="role-icon">🎓</span>
                        <div className="role-type">Student</div>
                        <div className="role-action">Continue as Student &rarr;</div>
                    </Link>

                    <Link to="/login/ta" className="role-card">
                        <span className="role-icon">📚</span>
                        <div className="role-type">Teaching Assistant</div>
                        <div className="role-action">Continue as TA &rarr;</div>
                    </Link>

                    <Link to="/login/faculty" className="role-card">
                        <span className="role-icon">🏫</span>
                        <div className="role-type">Faculty</div>
                        <div className="role-action">Continue as Faculty &rarr;</div>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
