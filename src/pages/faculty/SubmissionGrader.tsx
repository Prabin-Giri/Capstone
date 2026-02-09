import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSubmission, updateSubmission, getFileUrl, getAssignment } from '../../lib/api';
import type { Submission, Assignment } from '../../lib/api';
import { Button } from '../../components/ui/Button';

const SubmissionGrader: React.FC = () => {
    const { courseId, assignmentId, submissionId } = useParams();
    const navigate = useNavigate();
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [loading, setLoading] = useState(true);

    // Form State
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');
    const [status, setStatus] = useState<'pending' | 'graded' | 'returned'>('pending');

    useEffect(() => {
        loadData();
    }, [submissionId]);

    async function loadData() {
        if (!submissionId || !assignmentId) return;
        try {
            const [subData, assignData] = await Promise.all([
                getSubmission(parseInt(submissionId)),
                getAssignment(assignmentId)
            ]);
            setSubmission(subData);
            setAssignment(assignData);

            setGrade(subData.grade?.toString() || '');
            setFeedback(subData.feedback || '');
            setStatus(subData.status);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        if (!submissionId) return;
        try {
            await updateSubmission(parseInt(submissionId), {
                grade: grade ? parseFloat(grade) : undefined,
                feedback,
                status: 'graded' // Auto-update status to graded on save
            });
            navigate(`/faculty/courses/${courseId}/assignments/${assignmentId}/grading`);
        } catch (err) {
            console.error('Failed to save grade', err);
            alert('Failed to save grade');
        }
    }

    if (loading) return <div className="p-8">Loading...</div>;
    if (!submission || !assignment) return <div className="p-8">Submission not found</div>;

    return (
        <div className="flex h-[calc(100vh-64px)]">
            {/* Left Panel: Submission Info & File */}
            <div className="w-1/2 p-8 border-r border-gray-200 overflow-y-auto bg-gray-50">
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-gray-900">{assignment.title}</h2>
                    <p className="text-gray-500">Student ID: {submission.student_id}</p>
                    <p className="text-gray-500">Submitted: {new Date(submission.submitted_at).toLocaleString()}</p>
                </div>

                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <h3 className="font-semibold mb-2">Submitted File</h3>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                        <span className="font-mono text-sm">{submission.file_name}</span>
                        <a
                            href={getFileUrl(submission.file_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                            Download
                        </a>
                    </div>
                    {/* Add visual preview here later if needed (e.g. for PDFs or Code) */}
                    <div className="mt-4 p-4 bg-gray-100 rounded text-center text-gray-500 text-sm">
                        File preview not available. Please download to view.
                    </div>
                </div>
            </div>

            {/* Right Panel: Grading Form */}
            <div className="w-1/2 p-8 overflow-y-auto bg-white">
                <h2 className="text-xl font-bold mb-6">Grading</h2>

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Grade (0-100)</label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            className="w-full p-2 border border-gray-300 rounded-md"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Feedback</label>
                        <textarea
                            rows={8}
                            className="w-full p-2 border border-gray-300 rounded-md"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Enter detailed feedback here..."
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button variant="ghost" onClick={() => navigate(-1)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>
                            Save & Return to Dashboard
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SubmissionGrader;
