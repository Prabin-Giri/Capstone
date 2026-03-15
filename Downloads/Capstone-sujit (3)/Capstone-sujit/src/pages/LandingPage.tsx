import React from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

const LandingPage: React.FC = () => {
    return (
        <div className="landing-container">
            <div className="landing-gradient-overlay" />

            <main className="landing-content">
                <section className="landing-hero">
                    <div className="landing-badge-row">
                        <div className="landing-logo-circle">
                            <img
                                src="/ulm-logo-round.png"
                                alt="ULM logo"
                                className="landing-logo-img"
                            />
                        </div>
                        <span className="landing-badge-pill">CSCI Autograder for ULM</span>
                    </div>

                    <h1 className="landing-title">AUTOGRADE</h1>
                    <div className="landing-title-underline" />

                    <p className="landing-subtitle">
                        One place where students submit, TAs grade, and faculty see live
                        course health&mdash;all in one dashboard.
                    </p>

                    <div className="landing-cta-row">
                        <Link to="/login" className="landing-cta-primary">
                            <span>Open Dashboard</span>
                            <span className="landing-cta-arrow">→</span>
                        </Link>
                        <button
                            type="button"
                            className="landing-cta-ghost"
                            onClick={() => {
                                const el = document.getElementById('lp-feature-grid');
                                if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                            }}
                        >
                            Watch how it helps
                        </button>
                    </div>

                    <div className="landing-pill-row">
                        <div className="landing-pill">Smart grading</div>
                        <div className="landing-pill">Plagiarism hints</div>
                        <div className="landing-pill">Course-wide overview</div>
                        <div className="landing-pill">Live code editor</div>
                        <div className="landing-pill">Instant test feedback</div>
                        <div className="landing-pill">Enrolled-classes calendar</div>
                    </div>

                    <p className="landing-footnote">
                        Built for ULM to simplify CSCI assignments, grading, and feedback loops.
                    </p>
                </section>

                <section id="lp-feature-grid" className="landing-feature-grid">
                    <article className="feature-card">
                        <h3 className="feature-title">For students</h3>
                        <p className="feature-body">
                            Upload code, edit in the browser Monaco editor, and re-run public tests
                            until you are confident in every submission.
                        </p>
                    </article>
                    <article className="feature-card">
                        <h3 className="feature-title">For TAs</h3>
                        <p className="feature-body">
                            Grade faster with side-by-side submissions and instant
                            autograder results you can override when needed.
                        </p>
                    </article>
                    <article className="feature-card">
                        <h3 className="feature-title">For faculty</h3>
                        <p className="feature-body">
                            Track class progress, late work, and potential plagiarism at a glance,
                            so you can spend more time teaching and less time triaging.
                        </p>
                    </article>
                </section>
            </main>
        </div>
    );
};

export default LandingPage;
