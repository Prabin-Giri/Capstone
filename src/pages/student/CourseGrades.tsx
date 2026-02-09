import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCourse, getCourseAssignments, getSubmissions } from '../../lib/api';
import type { Course, Assignment, Submission } from '../../lib/api';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';

const CourseGrades: React.FC = () => {
    const { courseId } = useParams();
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);

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
                getSubmissions({ student_id: '1' }) // Hardcoded student ID for now as per auth mock
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

    if (loading) return <div className="p-8">Loading...</div>;
    if (!course) return <div className="p-8">Course not found</div>;

    // Calculate overall grade (simple average for now)
    const gradedAssignments = assignments.filter(a => {
        const sub = getSubmissionForAssignment(a.id);
        return sub && sub.grade !== undefined;
    });

    // Calculate simple average if there are graded assignments
    const totalScore = gradedAssignments.reduce((acc, curr) => {
        const sub = getSubmissionForAssignment(curr.id);
        return acc + (sub?.grade || 0);
    }, 0);

    const averageGrade = gradedAssignments.length > 0
        ? Math.round(totalScore / gradedAssignments.length)
        : null;

    return (
        <div className="max-w-7xl mx-auto p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{course.name}</h1>
                    <p className="text-gray-500 mt-1">Grades & Feedback</p>
                </div>
                {averageGrade !== null && (
                    <div className="bg-blue-50 px-6 py-3 rounded-lg border border-blue-100">
                        <span className="text-sm text-blue-600 block">Current Average</span>
                        <span className="text-2xl font-bold text-blue-900">{averageGrade}%</span>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Assignment</th>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Due Date</th>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Grade</th>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Feedback</th>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {assignments.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                    No assignments in this course yet.
                                </td>
                            </tr>
                        ) : (
                            assignments.map(assignment => {
                                const submission = getSubmissionForAssignment(assignment.id);
                                return (
                                    <tr key={assignment.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{assignment.title}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {new Date(assignment.due_date).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {submission ? (
                                                <StatusBadge status={submission.status === 'graded' || submission.status === 'returned' ? 'completed' : 'submitted'} />
                                            ) : (
                                                <StatusBadge status="pending" />
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {submission?.grade !== undefined ? (
                                                <span className="font-bold text-gray-900">{submission.grade} / 100</span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                                            {submission?.feedback || <span className="text-gray-400 italic">None</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Link
                                                to={`/student/courses/${courseId}/assignments/${assignment.id}/submissions/${submission?.id || ''}`}
                                                className={`text-sm font-medium ${submission ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 cursor-not-allowed'}`}
                                                onClick={(e) => !submission && e.preventDefault()}
                                            >
                                                {submission ? 'View Details' : 'No Submission'}
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CourseGrades;
