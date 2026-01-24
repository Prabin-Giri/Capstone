import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { FileUploader } from '../../components/FileUploader';
import { CodeViewer } from '../../components/CodeViewer';
import './AssignmentDetails.css';

const MOCK_ASSIGNMENT = {
    id: 'a1',
    title: 'Binary Search Implementation',
    dueDate: 'Oct 12, 11:59 PM',
    points: 100,
    status: 'open',
    description: `Implement the binary search algorithm in Python. Your function should take a sorted list and a target value, returning the index of the target or -1 if not found.`,
    starterCode: `def binary_search(arr, target):
    # Your code here
    pass`,
    rubric: [
        { criteria: 'Correctness (Public Tests)', points: 40 },
        { criteria: 'Edge Cases', points: 20 },
        { criteria: 'Time Complexity O(log n)', points: 20 },
        { criteria: 'Code Style & Comments', points: 20 },
    ]
};

const AssignmentDetails: React.FC = () => {
    const { assignmentId } = useParams();
    const navigate = useNavigate();
    const [files, setFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // In real app, fetch assignment by assignmentId
    const assignment = MOCK_ASSIGNMENT;

    const handleSubmit = async () => {
        if (files.length === 0) return;

        setIsSubmitting(true);
        // Simulate network delay
        setTimeout(() => {
            setIsSubmitting(false);
            // Navigate to results page (mock submission ID generated)
            const submissionId = 'sub-' + Date.now();
            navigate(`/student/classes/cs101/assignments/${assignmentId}/results/${submissionId}`);
        }, 1500);
    };

    return (
        <div className="assignment-details-page">
            {/* Header */}
            <div className="assignment-header">
                <div>
                    <h1 className="assignment-title">{assignment.title}</h1>
                    <div className="assignment-meta">
                        <div className="meta-item">
                            <Calendar className="w-4 h-4" />
                            <span>Due: {assignment.dueDate}</span>
                        </div>
                        <div className="meta-item">
                            <Clock className="w-4 h-4" />
                            <span>Points: {assignment.points}</span>
                        </div>
                    </div>
                </div>
                <Badge status={assignment.status as any}>{assignment.status}</Badge>
            </div>

            <div className="layout-grid">
                {/* Left Column: Instructions & Code */}
                <div className="space-y-8">
                    <section>
                        <h2 className="section-title">Instructions</h2>
                        <Card>
                            <CardContent className="pt-6">
                                <p className="description-content">{assignment.description}</p>

                                <h3 className="font-semibold mb-3 mt-6">Grading Rubric</h3>
                                <table className="rubric-table">
                                    <thead>
                                        <tr>
                                            <th>Criteria</th>
                                            <th className="rubric-points">Points</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {assignment.rubric.map((item, idx) => (
                                            <tr key={idx}>
                                                <td>{item.criteria}</td>
                                                <td className="rubric-points">{item.points}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </CardContent>
                        </Card>
                    </section>

                    <section>
                        <h2 className="section-title">Starter Code</h2>
                        <CodeViewer
                            filename="starter.py"
                            code={assignment.starterCode}
                            onDownload={() => alert('Download started...')}
                        />
                    </section>
                </div>

                {/* Right Column: Submission */}
                <div>
                    <h2 className="section-title">Submission</h2>
                    <Card>
                        <CardHeader title="Upload Files" description="Upload your solution files here." />
                        <CardContent>
                            <div className="space-y-4">
                                <FileUploader
                                    onFilesSelected={setFiles}
                                    acceptedFileTypes={['.py']}
                                />

                                <div className="pt-4 border-t border-gray-100 flex justify-end">
                                    <Button
                                        fullWidth
                                        disabled={files.length === 0}
                                        isLoading={isSubmitting}
                                        onClick={handleSubmit}
                                    >
                                        {isSubmitting ? 'Submitting...' : 'Submit Assignment'}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default AssignmentDetails;
