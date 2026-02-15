import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCourse, getCourseAssignments, deleteAssignment } from '../../lib/api';
import type { Course, Assignment } from '../../lib/api';
import { StatusBadge } from '../../components/ui/StatusBadge';
import './FacultyCourseView.css';

const FacultyCourseView: React.FC = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [courseId]);

    async function loadData() {
        if (!courseId) return;
        try {
            const [courseData, assignmentsData] = await Promise.all([
                getCourse(courseId),
                getCourseAssignments(courseId)
            ]);
            setCourse(courseData);
            setAssignments(assignmentsData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this assignment?')) return;
        try {
            await deleteAssignment(id);
            setAssignments(assignments.filter(a => a.id !== id));
        } catch (err) {
            console.error('Failed to delete', err);
            alert('Failed to delete assignment');
        }
    }

    if (loading) return <div className="faculty-course-container">Loading...</div>;
    if (!course) return <div className="faculty-course-container">Course not found</div>;

    return (
        <div className="faculty-course-container">
            {/* Page Header */}
            <div className="faculty-course-header">
                <div className="header-title">
                    <h1>{course.name}</h1>
                    <p className="header-metadata">{course.term} • {course.id}</p>
                </div>
                <button
                    onClick={() => navigate('assignments/new')}
                    className="create-btn"
                >
                    + Create Assignment
                </button>
            </div>

            {/* Assignment List */}
            <div className="assignments-list">
                {assignments.length === 0 ? (
                    <div className="empty-state">
                        <p>No assignments yet</p>
                        <small>Create your first assignment to get started.</small>
                    </div>
                ) : (
                    assignments.map(assignment => (
                        <div key={assignment.id} className="assignment-card">
                            <div className="card-content">
                                {/* Row 1: Title */}
                                <div className="card-title-row">
                                    <h3 className="assignment-title">
                                        {assignment.title}
                                    </h3>
                                </div>

                                {/* Divider */}
                                <div className="card-divider"></div>

                                {/* Row 2: Metadata & Actions */}
                                <div className="card-details-row">
                                    {/* Left: Metadata */}
                                    <div className="meta-group">
                                        <div className="due-date">
                                            <span className="due-label">DUE</span>
                                            {new Date(assignment.due_date).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric'
                                            })}
                                        </div>
                                        <StatusBadge status={assignment.status} className="status-pill-small" />
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="action-group">
                                        <div className="button-group">
                                            <button
                                                onClick={() => navigate(`assignments/${assignment.id}/grading`)}
                                                className="action-btn"
                                            >
                                                Grade
                                            </button>
                                            <div className="divider-vertical"></div>
                                            <button
                                                onClick={() => navigate(`assignments/${assignment.id}/edit`)}
                                                className="action-btn"
                                            >
                                                Edit
                                            </button>
                                        </div>

                                        <button
                                            onClick={() => handleDelete(assignment.id)}
                                            className="delete-btn"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default FacultyCourseView;
