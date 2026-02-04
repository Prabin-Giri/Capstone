import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { SUBMISSION_STATUS } from '../../lib/constants';
import './SubmissionResults.css';

// Mock Data
const MOCK_RESULTS = [
    { id: 't1', name: 'Test Case 1 (Basic Input)', status: 'passed' },
    { id: 't2', name: 'Test Case 2 (Large Input)', status: 'passed' },
    { id: 't3', name: 'Test Case 3 (Edge Case)', status: 'failed', output: 'IndexError: list index out of range' },
];

const SubmissionResults: React.FC = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { courseId, assignmentId } = useParams();
    const [status, setStatus] = useState<string>(SUBMISSION_STATUS.QUEUED);

    useEffect(() => {
        const timer1 = setTimeout(() => setStatus(SUBMISSION_STATUS.RUNNING), 1000);
        const timer2 = setTimeout(() => setStatus(SUBMISSION_STATUS.COMPLETED), 3000);
        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
        };
    }, []);

    return (
        <div className="submission-results">
            <div className="mb-4">
                <Link to={`/student/courses/${courseId}/assignments/${assignmentId}`} className="text-gray-500 hover:text-gray-900 back-link">
                    &larr; Back to Assignment
                </Link>
            </div>

            <div className="results-header">
                <h1 className="results-title">Submission Results</h1>
                <StatusBadge status={status} />
            </div>

            {status !== SUBMISSION_STATUS.COMPLETED ? (
                <div className="loading-state">
                    <p>Processing submission... ({status})</p>
                </div>
            ) : (
                <div className="results-content">
                    <div className="score-summary">
                        <span className="score">66/100</span>
                        <span className="status-text">Passed 2/3 tests</span>
                    </div>

                    <div className="test-list">
                        {MOCK_RESULTS.map((test) => (
                            <div key={test.id} className={`test-item ${test.status}`}>
                                <div className="test-name">
                                    <span className={`status-dot ${test.status}`}></span>
                                    {test.name}
                                </div>
                                {test.status === 'failed' && (
                                    <div className="test-output">
                                        <pre>{test.output}</pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubmissionResults;
