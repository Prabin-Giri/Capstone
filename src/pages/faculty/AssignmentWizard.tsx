import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAssignment, createAssignment, updateAssignment } from '../../lib/api';

import { Button } from '../../components/ui/Button';
import './AssignmentWizard.css';

const AssignmentWizard: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const isEditing = !!assignmentId;

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        due_date: '',
        due_time: '23:59',
        status: 'active' as 'active' | 'closed' | 'late',
        points: 100
    });
    const [loading, setLoading] = useState(isEditing);

    useEffect(() => {
        if (isEditing && assignmentId) {
            getAssignment(assignmentId).then(data => {
                const dateObj = new Date(data.due_date);
                setFormData({
                    title: data.title,
                    description: data.description || '',
                    due_date: dateObj.toISOString().split('T')[0],
                    // Check if the source had a time component (not midnight default if only date was stored)
                    // But for simplicity, we extract the time from the stored ISO string
                    due_time: dateObj.toISOString().split('T')[1].substring(0, 5),
                    status: data.status,
                    points: data.points || 100
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
            // Combine date and time
            const combinedDateTime = new Date(`${formData.due_date}T${formData.due_time}:00`).toISOString();

            const payload = {
                ...formData,
                due_date: combinedDateTime
            };
            // Remove due_time from payload to match API type
            const { due_time, ...finalPayload } = payload;

            if (isEditing && assignmentId) {
                await updateAssignment(assignmentId, finalPayload);
            } else {
                if (!courseId) return;
                await createAssignment({
                    ...finalPayload,
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
        <div className="assignment-wizard-container">
            <h1 className="wizard-title">
                {isEditing ? 'Edit Assignment' : 'Create New Assignment'}
            </h1>

            <form onSubmit={handleSubmit} className="wizard-form">
                <div className="form-group">
                    <label className="form-label">Title</label>
                    <input
                        type="text"
                        required
                        className="form-input"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g. Midterm Project"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                        required
                        className="form-textarea"
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Enter assignment instructions..."
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Due Date</label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <input
                                type="date"
                                required
                                className="form-input"
                                value={formData.due_date}
                                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                                style={{ flex: 2 }}
                            />
                            <input
                                type="time"
                                required
                                className="form-input"
                                value={formData.due_time}
                                onChange={e => setFormData({ ...formData, due_time: e.target.value })}
                                style={{ flex: 1 }}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Grade</label>
                        <input
                            type="number"
                            min="0"
                            className="form-input"
                            value={formData.points}
                            onChange={e => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Status</label>
                        <select
                            className="form-select"
                            value={formData.status}
                            onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                        >
                            <option value="active">Active</option>
                            <option value="closed">Closed</option>
                            <option value="late">Late</option>
                        </select>
                    </div>
                </div>

                <div className="form-actions">
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
