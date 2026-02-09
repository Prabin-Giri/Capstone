import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAssignment, createAssignment, updateAssignment } from '../../lib/api';
import type { Assignment } from '../../lib/api';
import { Button } from '../../components/ui/Button';

const AssignmentWizard: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const isEditing = !!assignmentId;

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        due_date: '',
        status: 'active' as 'active' | 'closed' | 'late'
    });
    const [loading, setLoading] = useState(isEditing);

    useEffect(() => {
        if (isEditing && assignmentId) {
            getAssignment(assignmentId).then(data => {
                setFormData({
                    title: data.title,
                    description: data.description || '',
                    due_date: new Date(data.due_date).toISOString().split('T')[0], // Simple date picker format
                    status: data.status
                });
                setLoading(false);
            }).catch(err => {
                console.error(err);
                navigate(`/faculty/courses/${courseId}`);
            });
        }
    }, [isEditing, assignmentId, courseId, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isEditing && assignmentId) {
                await updateAssignment(assignmentId, formData);
            } else {
                if (!courseId) return;
                await createAssignment({
                    ...formData,
                    course_id: courseId,
                });
            }
            navigate(`/faculty/courses/${courseId}`);
        } catch (err) {
            console.error('Failed to save', err);
            alert('Failed to save assignment');
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="max-w-3xl mx-auto p-8">
            <h1 className="text-2xl font-bold mb-6">
                {isEditing ? 'Edit Assignment' : 'Create New Assignment'}
            </h1>

            <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border border-gray-200">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                        type="text"
                        required
                        className="w-full p-2 border border-gray-300 rounded-md"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                        required
                        rows={4}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                        <input
                            type="date"
                            required
                            className="w-full p-2 border border-gray-300 rounded-md"
                            value={formData.due_date}
                            onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-md"
                            value={formData.status}
                            onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                        >
                            <option value="active">Active</option>
                            <option value="closed">Closed</option>
                            <option value="late">Late</option>
                        </select>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="ghost" onClick={() => navigate(`/faculty/courses/${courseId}`)}>
                        Cancel
                    </Button>
                    <Button type="submit">
                        {isEditing ? 'Update Assignment' : 'Create Assignment'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default AssignmentWizard;
