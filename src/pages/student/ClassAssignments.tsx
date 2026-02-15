import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getCourse, getCourseAssignments, getSubmissions } from '../../lib/api';
import type { Course, Assignment, Submission } from '../../lib/api';
import './ClassAssignments.css';

const STUDENT_ID = 'student-001'; // In a real app, get from auth context

const ClassAssignments: React.FC = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [submissions, setSubmissions] = useState<Map<string, Submission>>(new Map());

    useEffect(() => {
        async function loadData() {
            if (!courseId) return;
            try {
                const [courseData, assignmentsData, submissionsData] = await Promise.all([
                    getCourse(courseId),
                    getCourseAssignments(courseId),
                    getSubmissions({ student_id: STUDENT_ID })
                ]);
                setCourse(courseData);
                setAssignments(assignmentsData);

                // Map submissions by assignment_id for quick lookup
                const submissionMap = new Map<string, Submission>();
                submissionsData.forEach(sub => {
                    submissionMap.set(sub.assignment_id, sub);
                });
                setSubmissions(submissionMap);
            } catch (err) {
                setError('Failed to load course data. Make sure the backend server is running.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [courseId]);

    if (!courseId) {
        return (
            <div className="class-assignments">
                <div className="state-card">
                    <h1 className="assignments-title">Course not found</h1>
                    <p className="assignments-subtitle">Invalid course ID.</p>
                    <Link to="/student" className="link-primary">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const header = (
        <div className="assignments-header">
            <div>
                <h1 className="assignments-title">Assignments</h1>
                <p className="assignments-subtitle">
                    {course ? `${course.name} • ${course.term}` : 'Loading...'}
                </p>
            </div>
            <Link to={`/student/courses/${courseId}`} className="btn-course-home">
                Course Home
            </Link>
        </div>
    );

    if (isLoading) {
        return (
            <div className="class-assignments">
                {header}
                <div className="state-card">Loading assignments...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="class-assignments">
                {header}
                <div className="state-card" style={{ color: '#dc2626' }}>{error}</div>
            </div>
        );
    }

    if (!course) {
        return (
            <div className="class-assignments">
                <div className="state-card">
                    <h1 className="assignments-title">Course not found</h1>
                    <p className="assignments-subtitle">We could not find that course.</p>
                    <Link to="/student" className="link-primary">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    if (assignments.length === 0) {
        return (
            <div className="class-assignments">
                {header}
                <div className="state-card">No assignments yet.</div>
            </div>
        );
    }

    return (
        <div className="class-assignments">
            {header}
            <div className="table-wrapper">
                <table className="assignments-table">
                    <thead>
                        <tr>
                            <th>Assignment name</th>
                            <th>Due date</th>
                            <th>Status</th>
                            <th>Submitted</th>
                            <th>Grade</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {assignments.map((assignment) => {
                            const submission = submissions.get(assignment.id);
                            const dueDate = new Date(assignment.due_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            });

                            const gradeDisplay =
                                submission &&
                                    submission.grade !== undefined &&
                                    submission.grade !== null
                                    ? `${submission.grade}/${assignment.points || 100}`
                                    : `-/${assignment.points || 100}`;

                            return (
                                <tr
                                    key={assignment.id}
                                    className="assignment-row"
                                    onClick={() =>
                                        navigate(
                                            `/student/courses/${course.id}/assignments/${assignment.id}`
                                        )
                                    }
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            navigate(
                                                `/student/courses/${course.id}/assignments/${assignment.id}`
                                            );
                                        }
                                    }}
                                >
                                    <td className="assignment-name">{assignment.title}</td>
                                    <td>{dueDate}</td>
                                    <td>
                                        <span className={`status-pill status-${assignment.status}`}>
                                            {assignment.status}
                                        </span>
                                    </td>
                                    <td>
                                        {submission ? (
                                            <span style={{ color: '#16a34a', fontWeight: 500 }}>
                                                ✓ {submission.file_name}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#9ca3af' }}>Not submitted</span>
                                        )}
                                    </td>
                                    <td style={{ fontWeight: 500, color: '#374151' }}>
                                        {gradeDisplay}
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className="view-button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                navigate(
                                                    `/student/courses/${course.id}/assignments/${assignment.id}`
                                                );
                                            }}
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ClassAssignments;
