import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourse, getCourseAssignments, getSubmissions } from '../../lib/api';
import { getUser } from '../../lib/auth';
import type { Course, Assignment, Submission } from '../../lib/api';
import './ClassAssignments.css';

const ClassAssignments: React.FC = () => {
    const { courseId } = useParams();
    const user = getUser();
    const studentId = user?.id || 'student-001';
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
                    getSubmissions({ student_id: studentId })
                ]);
                setCourse(courseData);
                setAssignments(assignmentsData);

                // Map submissions by assignment_id for quick lookup
                const submissionMap = new Map<string, Submission>();
                submissionsData.forEach(sub => {
                    if (!submissionMap.has(sub.assignment_id)) {
                        submissionMap.set(sub.assignment_id, sub);
                    }
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
                            <th className="col-name">Assignment name</th>
                            <th className="col-due-date">Due date</th>
                            <th className="col-status">Status</th>
                            <th className="col-submitted">Submitted</th>
                            <th className="col-grade">Grade</th>
                            <th className="col-action">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {assignments.map((assignment) => {
                            const submission = submissions.get(assignment.id);
                            const dueDateObj = new Date(assignment.due_date);
                            const isPastDue = new Date() > dueDateObj;

                            // Dynamic status calculation
                            let displayStatus = assignment.status;
                            if (assignment.status === 'active' && isPastDue) {
                                displayStatus = 'late';
                            }

                            const dueDate = dueDateObj.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            });

                            const isGraded = submission && (submission.status === 'graded' || submission.status === 'returned');
                            const gradeDisplay =
                                isGraded &&
                                    submission.grade !== undefined &&
                                    submission.grade !== null
                                    ? `${submission.grade.toFixed(2)}/${(assignment.points || 100).toFixed(2)}`
                                    : `-/${(assignment.points || 100).toFixed(2)}`;

                            return (
                                <tr
                                    key={assignment.id}
                                    className="class-assignment-row"
                                >
                                    <td className="col-name assignment-name">
                                        <Link
                                            to={`/student/courses/${course.id}/assignments/${assignment.id}`}
                                            className="assignment-link"
                                        >
                                            {assignment.title}
                                        </Link>
                                    </td>
                                    <td className="col-due-date">{dueDate}</td>
                                    <td className="col-status">
                                        <span className={`status-pill status-${displayStatus}`}>
                                            {displayStatus}
                                        </span>
                                    </td>
                                    <td className="col-submitted">
                                        {submission ? (
                                            <span style={{ color: '#16a34a', fontWeight: 500 }}>
                                                ✓ {submission.files && submission.files.length > 1 ? `${submission.files.length} files` : submission.file_name}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#9ca3af' }}>Not submitted</span>
                                        )}
                                    </td>
                                    <td className="col-grade" style={{ fontWeight: 500, color: '#374151' }}>
                                        {gradeDisplay}
                                    </td>
                                    <td className="col-action">
                                        <Link
                                            to={`/student/courses/${course.id}/assignments/${assignment.id}`}
                                            className="view-button"
                                            style={{ textDecoration: 'none', display: 'inline-block' }}
                                        >
                                            View
                                        </Link>
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
