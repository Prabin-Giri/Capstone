import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourse, getCourseAssignments, getCourseDocuments, getFileUrl } from '../../lib/api';
import type { Course, Assignment, CourseDocuments } from '../../lib/api';
import { Calendar, FileText, GraduationCap, ListChecks, Rocket, ChevronLeft } from 'lucide-react';
import UserAvatar from '../../components/ui/UserAvatar';
import './ClassOverview.css';

const ClassOverview: React.FC = () => {
    const { courseId } = useParams();
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [documents, setDocuments] = useState<CourseDocuments | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadData() {
            if (!courseId) return;
            try {
                const [courseData, assignmentsData, documentsData] = await Promise.all([
                    getCourse(courseId),
                    getCourseAssignments(courseId),
                    getCourseDocuments(courseId)
                ]);
                setCourse(courseData);
                setAssignments(assignmentsData);
                setDocuments(documentsData);
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
                    <div className="breadcrumb">
                         <Link to="/student">
                             <ChevronLeft size={14} />
                             Back to Dashboard
                         </Link>
                    </div>
                </div>
            </div>
        );
    }

    const activeAssignments = assignments.filter((assignment) => {
        const isOpen = new Date(assignment.due_date) >= new Date();
        return assignment.status === 'active' && isOpen;
    });

    const nextActive = [...activeAssignments].sort(
        (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    )[0];

    return (
        <div className="class-overview">
            <div className="breadcrumb">
                 <Link to="/student">
                     <ChevronLeft size={14} />
                     Back to Dashboard
                 </Link>
            </div>
            <div className="overview-header">
                <div>
                    <h1 className="overview-title">{course.name}</h1>
                    <p className="overview-subtitle">
                        {course.name} &bull; {course.term}
                    </p>
                </div>
                <div className="instructor-badge-large">
                    <UserAvatar 
                        user={{ 
                            name: course.instructor_name, 
                            profile_picture: course.instructor_profile_picture 
                        }} 
                        size={40} 
                    />
                    <div className="instructor-badge-info">
                        <span className="instructor-label">Instructor</span>
                        <span className="instructor-name">{course.instructor_name}</span>
                    </div>
                </div>
            </div>

            <div className="quick-actions">
                <div className="quick-actions-header">
                    <h2 className="quick-actions-title">Quick actions</h2>
                    <p className="quick-actions-subtitle">Jump back in without hunting through menus.</p>
                </div>

                <div className="quick-actions-grid">
                    <Link to={`/student/courses/${course.id}/assignments`} className="quick-action">
                        <span className="qa-icon"><ListChecks size={18} /></span>
                        <span className="qa-main">
                            <span className="qa-title">Assignments</span>
                            <span className="qa-desc">View all tasks and due dates</span>
                        </span>
                    </Link>

                    <Link to={`/student/courses/${course.id}/grades`} className="quick-action">
                        <span className="qa-icon"><GraduationCap size={18} /></span>
                        <span className="qa-main">
                            <span className="qa-title">Grades</span>
                            <span className="qa-desc">Check feedback and scores</span>
                        </span>
                    </Link>

                    <Link to="/calendar" className="quick-action">
                        <span className="qa-icon"><Calendar size={18} /></span>
                        <span className="qa-main">
                            <span className="qa-title">Calendar</span>
                            <span className="qa-desc">See upcoming deadlines</span>
                        </span>
                    </Link>

                    {nextActive ? (
                        <Link
                            to={`/student/courses/${course.id}/assignments/${nextActive.id}`}
                            className="quick-action quick-action-primary"
                        >
                            <span className="qa-icon"><Rocket size={18} /></span>
                            <span className="qa-main">
                                <span className="qa-title">Continue next assignment</span>
                                <span className="qa-desc">{nextActive.title}</span>
                            </span>
                        </Link>
                    ) : (
                        <div className="quick-action is-disabled" aria-disabled="true">
                            <span className="qa-icon"><Rocket size={18} /></span>
                            <span className="qa-main">
                                <span className="qa-title">No active assignments</span>
                                <span className="qa-desc">You’re all caught up</span>
                            </span>
                        </div>
                    )}

                    {documents?.syllabus_path ? (
                        <a
                            className="quick-action"
                            href={getFileUrl(documents.syllabus_path)}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <span className="qa-icon"><FileText size={18} /></span>
                            <span className="qa-main">
                                <span className="qa-title">Syllabus</span>
                                <span className="qa-desc">Open course syllabus</span>
                            </span>
                        </a>
                    ) : null}

                    {documents?.schedule_path ? (
                        <a
                            className="quick-action"
                            href={getFileUrl(documents.schedule_path)}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <span className="qa-icon"><Calendar size={18} /></span>
                            <span className="qa-main">
                                <span className="qa-title">Schedule</span>
                                <span className="qa-desc">Open assignment schedule</span>
                            </span>
                        </a>
                    ) : null}
                </div>
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
