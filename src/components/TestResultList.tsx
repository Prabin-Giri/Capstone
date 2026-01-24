import React, { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import './TestResultList.css';

interface TestResult {
    id: string;
    name: string;
    status: 'passed' | 'failed';
    expected?: string;
    actual?: string;
    output?: string;
}

interface TestResultListProps {
    results: TestResult[];
}

export const TestResultList: React.FC<TestResultListProps> = ({ results }) => {
    return (
        <div className="test-result-list">
            {results.map((result) => (
                <TestResultItem key={result.id} result={result} />
            ))}
        </div>
    );
};

const TestResultItem: React.FC<{ result: TestResult }> = ({ result }) => {
    const [expanded, setExpanded] = useState(false);
    const isPass = result.status === 'passed';

    return (
        <div className={`test-result-item ${isPass ? 'test-pass' : 'test-fail'}`}>
            <div
                className={`test-header ${expanded ? 'expanded' : ''}`}
                onClick={() => setExpanded(!expanded)}
            >
                <div className="test-title">
                    <div className="test-status-icon">
                        {isPass ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </div>
                    <span>{result.name}</span>
                </div>
                <div>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
            </div>

            {expanded && (
                <div className="test-details">
                    {isPass ? (
                        <div className="text-green-700">Test passed successfully.</div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <strong>Error Output:</strong>
                                <pre className="diff-box text-red-600">{result.output || 'Assertion Failed'}</pre>
                            </div>
                            {result.expected && result.actual && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <strong>Expected:</strong>
                                        <div className="diff-box diff-expected">{result.expected}</div>
                                    </div>
                                    <div>
                                        <strong>Actual:</strong>
                                        <div className="diff-box diff-actual">{result.actual}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
