import React from 'react';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    return (
        <div className="dashboard-container">
            <div>
                <h1 className="dashboard-title">Student Dashboard</h1>
                <p className="dashboard-subtitle">Welcome to the automated grading system.</p>
            </div>

            <div className="dashboard-grid">
                {/* Placeholder cards */}
                <div className="info-card">
                    <h3 className="card-title">My Classes</h3>
                    <p className="card-text">No classes enrolled yet.</p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
