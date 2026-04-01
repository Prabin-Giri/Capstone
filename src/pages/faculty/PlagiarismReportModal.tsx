import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, AlertTriangle, FileText, CheckCircle, Search } from 'lucide-react';
import { runPlagiarismCheck } from '../../lib/api';
import './PlagiarismReportModal.css';

interface PlagiarismResult {
    student1: { name: string; id: string };
    student2: { name: string; id: string };
    similarity: number;
    matchedTokens: number;
    totalTokens: number;
}

interface PlagiarismReportProps {
    assignmentId: string;
    assignmentTitle: string;
    onClose: () => void;
}

const PlagiarismReportModal: React.FC<PlagiarismReportProps> = ({ assignmentId, assignmentTitle, onClose }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<PlagiarismResult[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const runAnalysis = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await runPlagiarismCheck(assignmentId);
            setResults(data.flaggedPairs);
        } catch (err) {
            setError('Failed to run plagiarism analysis. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="plagiarism-modal-overlay">
            <div className="plagiarism-modal-card">

                {/* Header */}
                <div className="pm-header">
                    <div className="pm-header-content">
                        <div className="pm-icon-wrapper">
                            <Search size={24} />
                        </div>
                        <div>
                            <h3 className="pm-title">Plagiarism Detection</h3>
                            <p className="pm-subtitle">Analyzing: <span className="pm-highlight">{assignmentTitle}</span></p>
                        </div>
                    </div>
                    <button onClick={onClose} className="pm-close-btn">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="pm-body">
                    {!results && !loading && (
                        <div className="pm-empty-state">
                            <div className="pm-empty-card">
                                <div className="pm-hero-icon">
                                    <Search size={40} />
                                </div>
                                <h4 className="pm-hero-title">Ready to Analyze?</h4>
                                <p className="pm-hero-text">
                                    The system will scan all student submissions for this assignment and compare code structure using token-based similarity analysis.
                                </p>
                                <button
                                    onClick={runAnalysis}
                                    className="pm-btn-primary"
                                >
                                    <Search size={20} />
                                    Run Similarity Check
                                </button>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="pm-loading-container">
                            <div className="pm-spinner"></div>
                            <div className="pm-loading-text">Analyzing Codebase...</div>
                            <div style={{ color: '#9ca3af', marginTop: '8px' }}>Comparing tokens and calculating similarity indices.</div>
                        </div>
                    )}

                    {results && (
                        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                            <div className="pm-results-header">
                                <div className="pm-results-title">
                                    Analysis Results
                                    <span className="pm-badge-count">{results.length} Matches</span>
                                </div>
                                {results.length > 0 && (
                                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Sorted by similarity score</div>
                                )}
                            </div>

                            {results.length === 0 ? (
                                <div className="pm-clean-record">
                                    <div style={{ width: '64px', height: '64px', background: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                                        <CheckCircle size={32} />
                                    </div>
                                    <h5 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>Clean Record!</h5>
                                    <p style={{ color: '#6b7280' }}>No submission pairs exceeded the 50% similarity threshold.</p>
                                </div>
                            ) : (
                                <div>
                                    {results.map((match, idx) => (
                                        <div key={idx} className="pm-match-card">
                                            <div className="pm-match-left">
                                                <div className={`pm-score-box ${match.similarity > 80 ? 'pm-score-high' :
                                                    match.similarity > 60 ? 'pm-score-med' :
                                                        'pm-score-low'
                                                    }`}>
                                                    <span>{match.similarity}%</span>
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <div className="pm-student-pair">
                                                        <div className="pm-student-badge">
                                                            <div className="pm-student-avatar">
                                                                {match.student1.name.charAt(0)}
                                                            </div>
                                                            {match.student1.name}
                                                        </div>
                                                        <span className="pm-vs">VS</span>
                                                        <div className="pm-student-badge">
                                                            <div className="pm-student-avatar">
                                                                {match.student2.name.charAt(0)}
                                                            </div>
                                                            {match.student2.name}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', paddingLeft: '4px' }}>
                                                        Matched Tokens: {match.matchedTokens} • Total Tokens: {match.totalTokens}
                                                    </div>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => {
                                                    onClose();
                                                    navigate(`/faculty/plagscan?assignment=${assignmentId}&s1=${match.student1.id}&s2=${match.student2.id}`);
                                                }}
                                                style={{ color: '#2563eb', background: '#eff6ff', padding: '8px 16px', borderRadius: '8px', border: 'none', fontWeight: '500', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                                            >
                                                <FileText size={16} />
                                                View Diff
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div style={{ marginTop: '24px', padding: '16px', background: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <AlertTriangle size={24} style={{ flexShrink: 0 }} />
                            <div>
                                <p style={{ fontWeight: '700', margin: 0 }}>Analysis Failed</p>
                                <p style={{ fontSize: '0.875rem', opacity: 0.9, margin: 0 }}>{error}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="pm-footer">
                    <button onClick={onClose} className="pm-btn-close">
                        Close Report
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PlagiarismReportModal;
