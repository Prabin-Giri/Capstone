import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { TestResultList } from '../../components/TestResultList';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import './SubmissionResults.css';

// Mock Data
type status = 'queued' | 'running' | 'completed';

const MOCK_RESULTS = [
    { id: 't1', name: 'Test Case 1 (Basic Input)', status: 'passed' as const },
    { id: 't2', name: 'Test Case 2 (Large Input)', status: 'passed' as const },
    { id: 't3', name: 'Test Case 3 (Empty Input)', status: 'failed' as const, output: 'IndexError: list index out of range\n  at binary_search line 4', expected: '-1', actual: 'Error' },
    { id: 't4', name: 'Test Case 4 (Not Found)', status: 'passed' as const },
];

const SubmissionResults: React.FC = () => {
    const { classId, assignmentId } = useParams();
    const [status, setStatus] = useState<status>('queued');
    const [results, setResults] = useState<any[]>([]);

    useEffect(() => {
        // Simulate grading pipeline
        const timer1 = setTimeout(() => setStatus('running'), 1500);
        const timer2 = setTimeout(() => {
            setStatus('completed');
            setResults(MOCK_RESULTS);
        }, 4000);

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
        };
    }, []);

    return (
        <div className="results-page">
            <div className="mb-4">
                <Link to={`/student/classes/${classId}/assignments/${assignmentId}`} className="text-gray-500 hover:text-gray-900 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to Assignment
                </Link>
            </div>

            <div className="results-header">
                <div className="flex justify-between items-center">
                    <h1 className="results-title">Submission Results</h1>
                    <Badge status={status}>{status}</Badge>
                </div>
            </div>

            {status !== 'completed' ? (
                <div className="loading-container">
                    <Loader2 className="loading-spinner" />
                    <div className={`status-step ${status === 'queued' ? 'active-step' : ''}`}>
                        1. Queued for execution...
                    </div>
                    <div className={`status-step ${status === 'running' ? 'active-step' : ''}`}>
                        2. Running tests across sandbox...
                    </div>
                    <div className="status-step">
                        3. Analyzing execution results...
                    </div>
                </div>
            ) : (
                <>
                    <Card>
                        <CardContent>
                            <div className="score-card">
                                <span className="score-value">75</span>
                                <span className="score-label">/ 100 Points</span>
                            </div>
                            <div className="text-center text-sm text-gray-500 mb-6">
                                Passed 3 of 4 public tests.
                            </div>

                            <TestResultList results={results} />
                        </CardContent>
                    </Card>

                    <div className="flex justify-center">
                        <Button onClick={() => window.location.reload()}>
                            Resubmit
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
};

export default SubmissionResults;
