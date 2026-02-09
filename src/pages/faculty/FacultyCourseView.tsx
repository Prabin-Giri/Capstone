import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getCourse, getCourseAssignments, deleteAssignment } from '../../lib/api';
import type { Course, Assignment } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';

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

    if (loading) return <div className="p-8">Loading...</div>;
    if (!course) return <div className="p-8">Course not found</div>;

    return (
        <div className="max-w-7xl mx-auto p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{course.name}</h1>
                    <p className="text-gray-500 mt-1">{course.term} • {course.id}</p>
                </div>
                <Button onClick={() => navigate('assignments/new')}>
                    + Create Assignment
                </Button>
            </div>

            <div className="grid gap-6">
                {assignments.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                        <p className="text-gray-500">No assignments yet. Create one to get started.</p>
                    </div>
                ) : (
                    assignments.map(assignment => (
                        <Card key={assignment.id} className="flex justify-between items-center p-6">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">{assignment.title}</h3>
                                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                                    <span>Due: {new Date(assignment.due_date).toLocaleDateString()}</span>
                                    <StatusBadge status={assignment.status} />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`assignments/${assignment.id}/grading`)}
                                >
                                    Grade
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`assignments/${assignment.id}/edit`)}
                                >
                                    Edit
                                </Button>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => handleDelete(assignment.id)}
                                >
                                    Delete
                                </Button>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};

export default FacultyCourseView;
