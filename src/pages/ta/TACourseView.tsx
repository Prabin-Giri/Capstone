import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getCourse,
    getCourseAssignments,
    getCourseDocuments,
    getFileUrl,
    getAssignmentGradesExportUrl,
} from '../../lib/api';
import type { Course, Assignment, CourseDocuments } from '../../lib/api';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { FileText, Calendar, Download, Users } from 'lucide-react';
import './TACourseView.css';

const TACourseView: React.FC = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [documents, setDocuments] = useState<CourseDocuments | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [courseId]);

    async function loadData() {
        if (!courseId) return;
        try {
            const [courseData, assignmentsData, documentsData] = await Promise.all([
                getCourse(courseId),
                getCourseAssignments(courseId),
                getCourseDocuments(courseId),
            ]);
            setCourse(courseData);
            setAssignments(assignmentsData);
            setDocuments(documentsData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    if (loading && !course) return <div className="ta-course-container">Loading...</div>;
    if (!course) return <div className="ta-course-container">Course not found</div>;

    return (
        <div className="ta-course-container">
            <div className="ta-course-header">
                <div className="ta-course-header-left">
                    <div className="header-title">
                        <h1>TA — {course.name}</h1>
                        <p className="header-metadata">{course.id}</p>
                    </div>
                </div>
                <div className="ta-course-header-actions">
                    <button
                        type="button"
                        className="create-btn"
                        onClick={() => navigate('students')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Users size={18} />
                        Students
                    </button>
                </div>
            </div>

            {/* Course documents (read-only) */}
            <div className="course-documents-section ta-course-docs">
                {documents?.syllabus_path ? (
                    <a href={getFileUrl(documents.syllabus_path)} target="_blank" rel="noreferrer" className="doc-pill">
                        <FileText size={16} />
                        Syllabus
                        <Download size={14} />
                    </a>
                ) : (
                    <div className="doc-pill empty">
                        <FileText size={16} />
                        No Syllabus
                    </div>
                )}
                {documents?.schedule_path ? (
                    <a href={getFileUrl(documents.schedule_path)} target="_blank" rel="noreferrer" className="doc-pill">
                        <Calendar size={16} />
                        Assignment Schedule
                        <Download size={14} />
                    </a>
                ) : (
                    <div className="doc-pill empty">
                        <Calendar size={16} />
                        No Schedule
                    </div>
                )}
            </div>

            <div className="ta-course-main">
                <h2 className="ta-course-section-title">Assignments — Grade only</h2>
                <p className="ta-course-section-desc">Open an assignment to grade student submissions. You cannot create or edit assignments.</p>
                <div className="assignments-list ta-course-assignments">
                    {assignments.length === 0 ? (
                        <div className="empty-state">
                            <p>No assignments in this course.</p>
                        </div>
                    ) : (
                        assignments.map((assignment) => (
                            <div key={assignment.id} className="assignment-card ta-assignment-card">
                                <div className="card-content">
                                    <div className="card-title-row">
                                        <h3
                                            className="assignment-title"
                                            onClick={() => navigate(`assignments/${assignment.id}/grading`)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {assignment.title}
                                        </h3>
                                    </div>
                                    <div className="card-details-row">
                                        <div className="meta-group">
                                            <div className="due-date">
                                                <span className="due-label">DEADLINE</span>
                                                {new Date(assignment.due_date).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                })}
                                            </div>
                                            <StatusBadge status={assignment.status} />
                                        </div>
                                        <div className="action-group">
                                            <a
                                                href={getAssignmentGradesExportUrl(assignment.id)}
                                                download
                                                className="action-btn"
                                                title="Download Grades"
                                            >
                                                <Download size={14} />
                                                Grades
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => navigate(`assignments/${assignment.id}/grading`)}
                                                className="action-btn ta-grade-btn"
                                            >
                                                Grade
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default TACourseView;
