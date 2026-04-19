import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Zap, MessageSquareText, ShieldCheck, Code2,
    ArrowRight, ChevronRight, Upload, Cpu, BarChart3,
    GraduationCap, BookOpen, CheckCircle2
} from 'lucide-react';
import './LandingPage.css';

const features = [
    {
        icon: <Zap size={24} />,
        title: 'Auto Grading',
        desc: 'Submissions are compiled, executed, and scored against test cases automatically by the grader.',
    },
    {
        icon: <MessageSquareText size={24} />,
        title: 'Detailed Results',
        desc: 'Students see pass/fail breakdowns, output diffs, and scores once grading completes.',
    },
    {
        icon: <ShieldCheck size={24} />,
        title: 'Plagiarism Detection',
        desc: 'Built-in similarity analysis flags copied code and AI-generated content for review.',
    },
    {
        icon: <Code2 size={24} />,
        title: 'Multi-Language',
        desc: 'Full support for Python, Java, JavaScript, C, C++, and more — all in one platform.',
    },
];

const studentBenefits = [
    'Write and submit code with a built-in editor',
    'View detailed test results and output diffs',
    'Track grades and deadlines in one dashboard',
    'Run and test code directly in the browser',
];

const instructorBenefits = [
    'Create assignments with custom test suites',
    'Automated grading with configurable rubrics',
    'Detect plagiarism and AI-generated submissions',
    'Manage courses, students, and grade books',
];

function useFadeIn() {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    el.classList.add('visible');
                    observer.unobserve(el);
                }
            },
            { threshold: 0.15 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return ref;
}

function FadeSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    const ref = useFadeIn();
    return (
        <div ref={ref} className={`landing-fade-in ${className}`}>
            {children}
        </div>
    );
}

const LandingPage: React.FC = () => {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div className="landing">
            {/* ── NAV ── */}
            <nav className={`landing-nav${scrolled ? ' scrolled' : ''}`}>
                <Link to="/" className="landing-logo">
                    Agno<span>s</span>
                </Link>
                <div className="landing-nav-links">
                    <a href="#features" className="landing-nav-link">Features</a>
                    <a href="#how" className="landing-nav-link">How It Works</a>
                    <a href="#roles" className="landing-nav-link">Who It's For</a>
                    <Link to="/login" className="landing-nav-cta">
                        Log In <ArrowRight size={16} />
                    </Link>
                </div>
            </nav>

            {/* ── HERO ── */}
            <section className="landing-hero">
                <div className="landing-hero-badge">
                    <Zap size={14} /> Automated grading, simplified
                </div>
                <h1>
                    Code. Submit.<br />
                    <span className="hero-highlight">We'll Take It From Here.</span>
                </h1>
                <p className="landing-hero-sub">
                    Agnos is an intelligent grading platform that automates assignment evaluation
                    and gives instructors their time back.
                </p>
                <div className="landing-hero-actions">
                    <Link to="/signup" className="landing-btn-primary">
                        Get Started Free <ArrowRight size={18} />
                    </Link>
                    <a href="#features" className="landing-btn-secondary">
                        Learn More <ChevronRight size={18} />
                    </a>
                </div>
            </section>

            {/* ── FEATURES ── */}
            <section className="landing-features" id="features">
                <FadeSection>
                    <span className="landing-section-label">Features</span>
                    <h2 className="landing-section-title">Everything you need to teach and learn code</h2>
                    <p className="landing-section-desc">
                        From submission to score — Agnos handles grading, feedback, and integrity checks so you can focus on what matters.
                    </p>
                </FadeSection>
                <div className="landing-features-grid">
                    {features.map((f, i) => (
                        <FadeSection key={i}>
                            <div className="landing-feature-card">
                                <div className="landing-feature-icon">{f.icon}</div>
                                <h3>{f.title}</h3>
                                <p>{f.desc}</p>
                            </div>
                        </FadeSection>
                    ))}
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section className="landing-how" id="how">
                <div className="landing-how-inner">
                    <FadeSection>
                        <span className="landing-section-label">How It Works</span>
                        <h2 className="landing-section-title">Three steps to a graded assignment</h2>
                        <p className="landing-section-desc" style={{ margin: '0 auto' }}>
                            No complex setup. Students submit, Agnos evaluates, everyone sees results.
                        </p>
                    </FadeSection>
                    <div className="landing-how-steps">
                        <FadeSection className="landing-step">
                            <div className="landing-step-num"><Upload size={24} /></div>
                            <h3>Submit</h3>
                            <p>Write or upload code in the built-in editor and hit submit.</p>
                        </FadeSection>
                        <div className="landing-step-connector">
                            <ChevronRight size={24} />
                        </div>
                        <FadeSection className="landing-step">
                            <div className="landing-step-num"><Cpu size={24} /></div>
                            <h3>Evaluate</h3>
                            <p>Code runs in a secure sandbox against instructor-defined test cases.</p>
                        </FadeSection>
                        <div className="landing-step-connector">
                            <ChevronRight size={24} />
                        </div>
                        <FadeSection className="landing-step">
                            <div className="landing-step-num"><BarChart3 size={24} /></div>
                            <h3>Results</h3>
                            <p>Detailed feedback, scores, and output diffs are posted once grading completes.</p>
                        </FadeSection>
                    </div>
                </div>
            </section>

            {/* ── FOR STUDENTS / INSTRUCTORS ── */}
            <section className="landing-roles" id="roles">
                <FadeSection>
                    <span className="landing-section-label">Who It's For</span>
                    <h2 className="landing-section-title">Built for students and instructors alike</h2>
                    <p className="landing-section-desc">
                        Whether you're learning to code or teaching a class of hundreds, Agnos scales with you.
                    </p>
                </FadeSection>
                <div className="landing-roles-grid">
                    <FadeSection>
                        <div className="landing-role-card">
                            <div className="landing-role-header">
                                <div className="landing-role-icon student">
                                    <GraduationCap size={22} />
                                </div>
                                <h3>For Students</h3>
                            </div>
                            <ul className="landing-role-list">
                                {studentBenefits.map((b, i) => (
                                    <li key={i}>
                                        <span className="landing-role-check student">
                                            <CheckCircle2 size={14} />
                                        </span>
                                        {b}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </FadeSection>
                    <FadeSection>
                        <div className="landing-role-card">
                            <div className="landing-role-header">
                                <div className="landing-role-icon instructor">
                                    <BookOpen size={22} />
                                </div>
                                <h3>For Instructors</h3>
                            </div>
                            <ul className="landing-role-list">
                                {instructorBenefits.map((b, i) => (
                                    <li key={i}>
                                        <span className="landing-role-check instructor">
                                            <CheckCircle2 size={14} />
                                        </span>
                                        {b}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </FadeSection>
                </div>
            </section>

            {/* ── CTA ── */}
            <section className="landing-cta-section">
                <FadeSection>
                    <div className="landing-cta-box">
                        <h2>Ready to transform your grading workflow?</h2>
                        <p>Join instructors and students who are saving hours every week with automated grading and evaluation.</p>
                        <Link to="/signup" className="landing-cta-btn">
                            Get Started Now <ArrowRight size={18} />
                        </Link>
                    </div>
                </FadeSection>
            </section>

            {/* ── FOOTER ── */}
            <footer className="landing-footer">
                <p>&copy; {new Date().getFullYear()} Agnos. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default LandingPage;
