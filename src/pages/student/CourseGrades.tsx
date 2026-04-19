import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCourse, getCourseAssignments, getSubmissions } from '../../lib/api';
import type { Course, Assignment, Submission } from '../../lib/api';
import { getUser } from '../../lib/auth';
import GradedAssignmentModal from '../../components/ui/GradedAssignmentModal';
import './CourseGrades.css';

const CourseGrades: React.FC = () => {
    const { courseId } = useParams();
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
    const [showReportModal, setShowReportModal] = useState(false);

    useEffect(() => {
        loadData();
    }, [courseId]);

    async function loadData() {
        if (!courseId) return;
        try {
            // Fetch course details, all assignments for the course, and student's submissions
            const [courseData, assignmentsData, submissionsData] = await Promise.all([
                getCourse(courseId),
                getCourseAssignments(courseId),
                getSubmissions({ student_id: studentId })
            ]);
            setCourse(courseData);
            setAssignments(assignmentsData);
            setSubmissions(submissionsData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    // Helper to find submission for an assignment
    const getSubmissionForAssignment = (assignmentId: string) => {
        return submissions.find(s => s.assignment_id === assignmentId);
    };

    // Calculate totals
    const calculateTotals = () => {
        let earned = 0;
        let possible = 0;

        assignments.forEach(assignment => {
            const submission = getSubmissionForAssignment(assignment.id);
            const assignmentPoints = assignment.points || 100; // Default to 100 if not set
            const isGraded = submission && (
                ['graded', 'returned'].includes(submission.status?.toLowerCase() || '') ||
                (submission.grade !== undefined && submission.grade !== null)
            );
            if (isGraded && submission.grade !== undefined && submission.grade !== null) {
                earned += Number(submission.grade);
                possible += Number(assignmentPoints);
            }
        });

        return { earned, possible };
    };

    const { earned, possible } = calculateTotals();
    const totalPercentage = possible > 0 ? ((earned / possible) * 100).toFixed(2) : '0.00';

    if (loading) return <div className="p-8">Loading...</div>;
    if (!course) return <div className="p-8">Course not found</div>;



    return (
        <div className="course-grades">
            <div className="grades-header">
                <div>
                    <h1 className="grades-title">Grades</h1>
                </div>
            </div>

            <div className="table-wrapper">
                <table className="grades-table">
                    <thead>
                        <tr>
                            <th>Assignment name</th>
                            <th>Due date</th>
                            <th>Submitted Date</th>
                            <th>Status</th>
                            <th>Grade</th>
                            <th>Feedback</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {assignments.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    No assignments in this course yet.
                                </td>
                            </tr>
                        ) : (
                            assignments.map(assignment => {
                                const submission = getSubmissionForAssignment(assignment.id);
                                const dueDate = new Date(assignment.due_date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                });
                                const submittedDate = submission ? new Date(submission.submitted_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                }) : '-';
                                const maxPoints = assignment.points || 100;

                                return (
                                    <tr key={assignment.id} className="grade-row">
                                        <td className="assignment-name">
                                            <Link
                                                to={`/student/courses/${courseId}/assignments/${assignment.id}`}
                                                className="assignment-link"
                                            >
                                                {assignment.title}
                                            </Link>
                                        </td>
                                        <td>{dueDate}</td>
                                        <td>{submittedDate}</td>
                                        <td>
                                            {submission ? (
                                                <span className={`status-pill status-${['graded', 'returned'].includes(submission.status?.toLowerCase() || '') ? 'completed' : 'submitted'}`}>
                                                    {['graded', 'returned'].includes(submission.status?.toLowerCase() || '') ? 'Graded' : 'Submitted'}
                                                </span>
                                            ) : new Date() > new Date(assignment.due_date) ? (
                                                <span className="status-pill status-late">Late</span>
                                            ) : (
                                                <span className="status-pill status-pending">Pending</span>
                                            )}
                                        </td>
                                        <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                                            {submission?.grade !== null && submission?.grade !== undefined ? (
                                                <span>{Number(submission.grade).toFixed(2)}/{maxPoints.toFixed(2)}</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-tertiary)' }}>-/{maxPoints.toFixed(2)}</span>
                                            )}
                                        </td>
                                        <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {submission?.feedback ? submission.feedback : <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>None</span>}
                                        </td>
                                        <td>
                                            <button
                                                className="view-button"
                                                onClick={() => {
                                                    if (submission) {
                                                        setSelectedSubmission(submission);
                                                        setSelectedAssignment(assignment);
                                                        setShowReportModal(true);
                                                    }
                                                }}
                                                disabled={!submission}
                                                style={!submission ? { color: 'var(--text-tertiary)', cursor: 'not-allowed' } : {}}
                                            >
                                                {submission ? 'View' : 'No Submission'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                        {assignments.length > 0 && (
                            <tr className="grade-row" style={{ backgroundColor: 'var(--bg-surface)', borderTop: '2px solid var(--border-color)' }}>
                                <td colSpan={4} style={{ fontWeight: 700, paddingLeft: '1.5rem' }}>Total Grade</td>
                                <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {possible > 0 ? `${Number(earned).toFixed(2)} / ${Number(possible).toFixed(2)} (${totalPercentage}%)` : '-'}
                                </td>
                                <td></td>
                                <td></td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <GradedAssignmentModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                submission={selectedSubmission}
                assignment={selectedAssignment}
            />
        </div>
    );
};

export default CourseGrades;
