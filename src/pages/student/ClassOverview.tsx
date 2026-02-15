import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourse, getCourseAssignments } from '../../lib/api';
import type { Course, Assignment } from '../../lib/api';
import './ClassOverview.css';

const ClassOverview: React.FC = () => {
    const { courseId } = useParams();
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
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
                setError('Failed to load course data.');
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [courseId]);

    if (loading) return <div className="p-8">Loading...</div>;
    if (error) return <div className="p-8 text-red-600">{error}</div>;

    if (!course) {
        return (
            <div className="class-overview">
                <div className="state-card">
                    <h1 className="overview-title">Course not found</h1>
                    <p className="overview-subtitle">We could not find that course.</p>
                    <Link to="/student" className="btn-primary">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const activeAssignments = assignments.filter(
        (assignment) => assignment.status === 'active'
    );

    return (
        <div className="class-overview">
            <div className="overview-header">
                <div>
                    <h1 className="overview-title">{course.name}</h1>
                    <p className="overview-subtitle">
                        {course.name} &bull; {course.term}
                    </p>
                </div>
                <Link to={`/student/courses/${course.id}/assignments`} className="btn-view-assignments">
                    View Assignments
                </Link>
            </div>

            <div className="overview-card">
                <div className="overview-stat">
                    <span className="stat-value">{assignments.length}</span>
                    <span className="stat-label">Assignments</span>
                </div>
                <div className="overview-stat">
                    <span className="stat-value">{activeAssignments.length}</span>
                    <span className="stat-label">Active</span>
                </div>
            </div>
        </div>
    );
};

export default ClassOverview;
