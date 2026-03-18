import React, { useState } from 'react';
import { X, Play, Settings, AlertTriangle } from 'lucide-react';
import './AutoGradingConfigModal.css';

interface AutoGradingConfigModalProps {
    assignmentId: string;
    onClose: () => void;
    onStart: (config: { latePenalty: string; timeout: number }) => Promise<void>;
}

const AutoGradingConfigModal: React.FC<AutoGradingConfigModalProps> = ({ onClose, onStart }) => {
    const [latePenalty, setLatePenalty] = useState('none');
    const [timeout, setTimeout] = useState('2000');
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleStart = async () => {
        setIsRunning(true);
        setError(null);
        try {
            await onStart({ latePenalty, timeout: timeout === '' ? 0 : Number(timeout) });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to start auto-grading');
            setIsRunning(false);
        }
    };

    return (
        <div className="ac-modal-overlay">
            <div className="ac-modal-card">
                <div className="ac-header">
                    <div className="ac-header-content">
                        <div className="ac-icon-container">
                            <Settings size={24} />
                        </div>
                        <div>
                            <h3 className="ac-title">Run Tests for All Submissions</h3>
                        </div>
                    </div>
                    <button onClick={onClose} className="ac-close-btn">
                        <X size={20} />
                    </button>
                </div>

                <div className="ac-body">
                    <div className="ac-section">
                        <label className="ac-label">Late Submission Penalty (for suggested scores)</label>
                        <select
                            value={latePenalty}
                            onChange={(e) => setLatePenalty(e.target.value)}
                            className="ac-select"
                        >
                            <option value="none">No Penalty (Full Credit)</option>
                            <option value="daily_10">Deduct 10% per day late</option>
                            <option value="zero">Zero Credit if Late</option>
                        </select>
                            <span className="ac-help-text">Applied when computing suggested grades; does not change saved grades.</span>
                    </div>

                    <div className="ac-section">
                        <label className="ac-label">Execution Timeout (ms)</label>
                        <input
                            type="number"
                            value={timeout}
                            onChange={(e) => setTimeout(e.target.value)}
                            min="100"
                            max="10000"
                            step="100"
                            className="ac-input"
                        />
                        <span className="ac-help-text">Maximum time allowed per test case before terminating.</span>
                    </div>

                    <div className="ac-alert">
                            <AlertTriangle className="text-yellow-600" size={24} />
                        <div className="ac-alert-content">
                            <strong>Note:</strong> This will run all test cases in bulk and compute suggested scores, but it will not change submission status to graded or overwrite manual grades.
                        </div>
                    </div>

                    {error && (
                        <div className="ac-error">
                            {error}
                        </div>
                    )}

                    <div className="ac-footer">
                        <button className="ac-btn ac-btn-outline" onClick={onClose} disabled={isRunning}>
                            Cancel
                        </button>
                        <button
                            className="ac-btn ac-btn-primary"
                            onClick={handleStart}
                            disabled={isRunning}
                        >
                            {isRunning ? (
                                <>
                                    <div className="ac-spinner" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Play size={18} />
                                    Start Grading
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AutoGradingConfigModal;

