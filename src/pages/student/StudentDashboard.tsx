import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourses, getAssignments } from '../../lib/api';
import type { Course, Assignment } from '../../lib/api';
import { Card } from '../../components/ui/Card';
// import './StudentDashboard.css'; // Replaced with Tailwind utility classes

const StudentDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [courses, setCourses] = useState<Course[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadData() {
            try {
                const [coursesData, assignmentsData] = await Promise.all([
                    getCourses(),
                    getAssignments()
                ]);
                setCourses(coursesData);
                setAssignments(assignmentsData);
            } catch (err) {
                setError('Failed to load data. Make sure the backend server is running.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="student-dashboard">
                <div className="dashboard-header">
                    <h1 className="dashboard-title">Dashboard</h1>
                    <p className="dashboard-subtitle">Loading...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="student-dashboard">
                <div className="dashboard-header">
                    <h1 className="dashboard-title">Dashboard</h1>
                    <p className="dashboard-subtitle" style={{ color: '#ef4444' }}>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="student-dashboard p-6">
            <div className="dashboard-header mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-600">Welcome back, Student.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses.map((course) => {
                    const courseAssignments = assignments.filter(
                        (assignment) => assignment.course_id === course.id
                    );
                    const openAssignments = courseAssignments.filter(
                        (assignment) => assignment.status === 'open'
                    );
                    const nextDue = openAssignments[0]?.due_date
                        ? new Date(openAssignments[0].due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'No upcoming due dates';

                    return (
                        <Card
                            key={course.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => navigate(`/student/courses/${course.id}`)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    navigate(`/student/courses/${course.id}`);
                                }
                            }}
                            title={course.name}
                            action={<span className="text-sm text-gray-500">{course.id}</span>}
                        >
                            <div className="class-stats space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-gray-500">Open Assignments</span>
                                    <span className="text-lg font-bold text-indigo-600">{openAssignments.length}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-gray-500">Next Due</span>
                                    <span className="text-sm text-gray-900">{nextDue}</span>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

export default StudentDashboard;
