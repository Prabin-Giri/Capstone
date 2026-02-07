import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './SubmitAssignment.css';

const SubmitAssignment: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile) return;

        // Mock submission process
        const mockSubmissionId = 'sub-123';
        navigate(
            `/student/courses/${courseId}/assignments/${assignmentId}/submissions/${mockSubmissionId}`
        );
    };

    return (
        <div className="submit-page">
            <div className="submit-card">
                <h1 className="section-title">Submit Assignment</h1>
                <p className="description-text mb-6">Upload your solution file for grading.</p>

                <form onSubmit={handleSubmit}>
                    <div className="upload-area">
                        <input
                            type="file"
                            id="file-upload"
                            className="hidden"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                        />
                        <label htmlFor="file-upload" className="file-input-label cursor-pointer block h-full">
                            {selectedFile ? (
                                <span className="text-gray-900 font-semibold">{selectedFile.name}</span>
                            ) : (
                                <span>Click to upload file</span>
                            )}
                        </label>
                    </div>

                    <button
                        type="submit"
                        className="btn-primary w-full"
                        disabled={!selectedFile}
                        style={{ width: '100%', opacity: selectedFile ? 1 : 0.5 }}
                    >
                        Submit Solution
                    </button>
                </form>
            </div>
        </div>
    );
};

export default SubmitAssignment;
