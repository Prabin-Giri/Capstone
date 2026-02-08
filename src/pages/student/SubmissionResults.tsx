import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { getSubmission, getFileUrl } from '../../lib/api';
import type { Submission } from '../../lib/api';

const SubmissionResults: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadSubmission() {
            if (!submissionId) return;
            try {
                // Cast the response to match our strict typing if the backend returns legacy status
                // In a real app, we'd have a mapping layer
                const data = await getSubmission(parseInt(submissionId, 10));
                setSubmission(data as Submission);
            } catch (err) {
                setError('Failed to load submission');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        loadSubmission();
    }, [submissionId]);

    if (loading) {
        return (
            <div className="p-6 max-w-4xl mx-auto">
                <Card>
                    <div className="p-8 text-center text-gray-500">Loading submission...</div>
                </Card>
            </div>
        );
    }

    if (error || !submission) {
        return (
            <div className="p-6 max-w-4xl mx-auto">
                <div className="mb-4">
                    <Link to={`/student/courses/${courseId}/assignments/${assignmentId}`} className="text-gray-500 hover:text-gray-900 pb-2 inline-block">
                        &larr; Back to Assignment
                    </Link>
                </div>
                <Card className="text-center py-10">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Submission Not Found</h1>
                    <p className="text-red-600">{error || 'This submission does not exist.'}</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="mb-4">
                <Link to={`/student/courses/${courseId}/assignments/${assignmentId}`} className="text-gray-500 hover:text-gray-900">
                    &larr; Back to Assignment
                </Link>
            </div>

            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Submission Details</h1>
                <StatusBadge status={submission.status} />
            </div>

            <Card title="File Information">
                <div className="bg-gray-50 rounded-md p-4 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <span className="text-sm text-gray-500 block">File Name</span>
                            <span className="font-medium">{submission.file_name}</span>
                        </div>
                        <div>
                            <span className="text-sm text-gray-500 block">Submitted At</span>
                            <span>{new Date(submission.submitted_at).toLocaleString()}</span>
                        </div>
                        {submission.updated_at !== submission.submitted_at && (
                            <div>
                                <span className="text-sm text-gray-500 block">Last Updated</span>
                                <span>{new Date(submission.updated_at).toLocaleString()}</span>
                            </div>
                        )}
                        {submission.grade !== null && submission.grade !== undefined && (
                            <div>
                                <span className="text-sm text-gray-500 block">Grade</span>
                                <span className="font-bold text-green-600">{submission.grade}/100</span>
                            </div>
                        )}
                    </div>
                </div>

                {submission.feedback && (
                    <div className="bg-blue-50 border border-blue-100 rounded-md p-4 mb-4">
                        <h3 className="text-sm font-semibold text-blue-900 mb-2">Instructor Feedback</h3>
                        <p className="text-blue-800 text-sm leading-relaxed">{submission.feedback}</p>
                    </div>
                )}

                <div className="flex flex-wrap gap-3 mt-6">
                    <a
                        href={getFileUrl(submission.file_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary" // keeping class for now or use Button component logic
                    >
                        <Button variant="primary">Download File</Button>
                    </a>

                    <Link to={`/student/courses/${courseId}/assignments/${assignmentId}/submit`}>
                        <Button variant="secondary">Resubmit Assignment</Button>
                    </Link>
                </div>
            </Card>
        </div>
    );
};

export default SubmissionResults;
