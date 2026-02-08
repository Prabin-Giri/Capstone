import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FileUploader } from '../../components/ui/FileUploader';
import { createSubmission, getSubmissions, getFileUrl } from '../../lib/api';
import type { Submission } from '../../lib/api';

const STUDENT_ID = 'student-001'; // In a real app, get from auth context

const SubmitAssignment: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [existingSubmission, setExistingSubmission] = useState<Submission | null>(null);

    // Check for existing submission
    useEffect(() => {
        async function checkExisting() {
            if (!assignmentId) return;
            try {
                const submissions = await getSubmissions({
                    assignment_id: assignmentId,
                    student_id: STUDENT_ID
                });
                if (submissions.length > 0) {
                    setExistingSubmission(submissions[0]);
                }
            } catch (err) {
                console.error('Failed to check existing submissions:', err);
            }
        }
        checkExisting();
    }, [assignmentId]);

    const handleFileSelect = (file: File) => {
        setSelectedFile(file);
        setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile || !assignmentId) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const submission = await createSubmission(assignmentId, STUDENT_ID, selectedFile);
            navigate(
                `/student/courses/${courseId}/assignments/${assignmentId}/submissions/${submission.id}`
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <Card title={existingSubmission ? 'Resubmit Assignment' : 'Submit Assignment'}>
                <p className="text-gray-600 mb-6">Upload your solution file for grading.</p>

                {existingSubmission && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
                        <p className="text-sm text-yellow-800">
                            <strong>Previous submission:</strong> {existingSubmission.file_name}
                            <br />
                            <span className="text-yellow-600">
                                Submitted: {new Date(existingSubmission.submitted_at).toLocaleString()}
                            </span>
                            <br />
                            <a
                                href={getFileUrl(existingSubmission.file_path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline mt-1 inline-block"
                            >
                                Download previous file
                            </a>
                        </p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6 text-sm text-red-600">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <FileUploader
                        onFileSelect={handleFileSelect}
                        selectedFile={selectedFile}
                        disabled={isSubmitting}
                        label="Click to upload solution"
                    />

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={!selectedFile || isSubmitting}
                        isLoading={isSubmitting}
                    >
                        {existingSubmission ? 'Resubmit Solution' : 'Submit Solution'}
                    </Button>
                </form>
            </Card>
        </div>
    );
};

export default SubmitAssignment;
