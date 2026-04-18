import React, { useState, useEffect, useRef } from 'react';
import { useLocation, NavLink, useNavigate } from 'react-router-dom';
import {
    getCourse,
    getCourseDocuments,
    getFileUrl,
    getCourseCatalogId,
    uploadSyllabus,
    uploadSchedule,
} from '../../lib/api';
import type { Course, CourseDocuments } from '../../lib/api';
import { BookOpen, BarChart2, FileText, CalendarDays, Users, Plus, ChevronDown, Upload, UserPlus, Key, Archive, Trash2 } from 'lucide-react';
import { showDialog } from '../ui/Dialog';
import './Layout.css';

interface CourseSidebarProps {
    courseId: string;
}

type NavItem =
    | { label: string; to: string; end?: boolean; icon: React.ReactNode; external?: false; disabled?: false }
    | { label: string; to: string; icon: React.ReactNode; external: true; disabled?: boolean };

const CourseSidebar: React.FC<CourseSidebarProps> = ({ courseId }) => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const basePath = pathname.startsWith('/faculty/courses/')
        ? `/faculty/courses/${courseId}`
        : pathname.startsWith('/ta/courses/')
          ? `/ta/courses/${courseId}`
          : `/student/courses/${courseId}`;
    const isFacultyCourse = pathname.startsWith('/faculty/courses/');
    const isTaCourse = pathname.startsWith('/ta/courses/');

    const [course, setCourse] = useState<Course | null>(null);
    const [documents, setDocuments] = useState<CourseDocuments | null>(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    const [showFacultyManage, setShowFacultyManage] = useState(false);
    const facultyManageWrapRef = useRef<HTMLDivElement>(null);
    const syllabusInputRef = useRef<HTMLInputElement>(null);
    const scheduleInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (courseId) {
            getCourse(courseId)
                .then(setCourse)
                .catch((err) => console.error('Failed to load course in sidebar:', err));

            getCourseDocuments(courseId)
                .then(setDocuments)
                .catch(() => setDocuments(null));
        }
    }, [courseId]);

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (!showFacultyManage) return;
        const onDoc = (e: MouseEvent) => {
            if (facultyManageWrapRef.current && !facultyManageWrapRef.current.contains(e.target as Node)) {
                setShowFacultyManage(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [showFacultyManage]);

    const docSyllabus: NavItem = {
        label: 'Syllabus',
        to: documents?.syllabus_path ? getFileUrl(documents.syllabus_path) : '#',
        icon: <FileText size={18} />,
        external: true,
        disabled: !documents?.syllabus_path,
    };
    const docSchedule: NavItem = {
        label: 'Schedule',
        to: documents?.schedule_path ? getFileUrl(documents.schedule_path) : '#',
        icon: <CalendarDays size={18} />,
        external: true,
        disabled: !documents?.schedule_path,
    };

    const studentNavItems: NavItem[] = [
        { label: 'Assignments', to: `${basePath}/assignments`, end: false, icon: <BookOpen size={18} /> },
        { label: 'Grades', to: `${basePath}/grades`, end: true, icon: <BarChart2 size={18} /> },
        docSyllabus,
        docSchedule,
    ];

    const facultyNavItems: NavItem[] = [
        { label: 'Students', to: `${basePath}/students`, end: true, icon: <Users size={18} /> },
        { label: 'View Gradebook', to: `${basePath}/gradebook`, end: true, icon: <FileText size={18} /> },
        docSyllabus,
        docSchedule,
    ];

    const taNavItems: NavItem[] = [
        { label: 'Assignments', to: `${basePath}/assignments`, end: false, icon: <BookOpen size={18} /> },
        { label: 'Grades', to: `${basePath}/gradebook`, end: true, icon: <BarChart2 size={18} /> },
        docSyllabus,
        docSchedule,
    ];

    const navItems: NavItem[] = isFacultyCourse ? facultyNavItems : isTaCourse ? taNavItems : studentNavItems;

    const openFacultyModal = (modal: 'enroll' | 'inviteTa' | 'archive' | 'delete') => {
        setShowFacultyManage(false);
        navigate(`/faculty/courses/${courseId}`, { state: { openFacultyModal: modal } });
    };

    const handleFacultyFileUpload = async (type: 'syllabus' | 'schedule', file: File) => {
        try {
            if (type === 'syllabus') await uploadSyllabus(courseId, file);
            else await uploadSchedule(courseId, file);
            const docs = await getCourseDocuments(courseId);
            setDocuments(docs);
            setShowFacultyManage(false);
        } catch (err) {
            console.error('Upload failed', err);
            await showDialog({ title: 'Error', message: 'Upload failed', confirmText: 'OK' });
        }
    };

    const renderNavItem = (item: NavItem) =>
        item.external ? (
            item.disabled ? (
                <span key={item.label} className="course-nav-link disabled" aria-disabled="true">
                    {isMobile ? (
                        item.label
                    ) : (
                        <>
                            <span className="course-nav-icon">{item.icon}</span>
                            <span className="course-label">{item.label}</span>
                        </>
                    )}
                </span>
            ) : (
                <a
                    key={item.label}
                    href={item.to}
                    target="_blank"
                    rel="noreferrer"
                    className="course-nav-link"
                >
                    {isMobile ? (
                        item.label
                    ) : (
                        <>
                            <span className="course-nav-icon">{item.icon}</span>
                            <span className="course-label">{item.label}</span>
                        </>
                    )}
                </a>
            )
        ) : (
            <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `course-nav-link ${isActive ? 'active' : ''}`}
            >
                {isMobile ? (
                    item.label
                ) : (
                    <>
                        <span className="course-nav-icon">{item.icon}</span>
                        <span className="course-label">{item.label}</span>
                    </>
                )}
            </NavLink>
        );

    const renderFacultyManage = () => {
        if (!isFacultyCourse) return null;
        return (
            <>
                <input
                    type="file"
                    ref={syllabusInputRef}
                    style={{ display: 'none' }}
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => e.target.files?.[0] && handleFacultyFileUpload('syllabus', e.target.files[0])}
                />
                <input
                    type="file"
                    ref={scheduleInputRef}
                    style={{ display: 'none' }}
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => e.target.files?.[0] && handleFacultyFileUpload('schedule', e.target.files[0])}
                />
                <div className="course-nav-faculty-manage" ref={facultyManageWrapRef}>
                    <button
                        type="button"
                        className={`course-nav-link course-nav-manage-trigger ${showFacultyManage ? 'is-open' : ''}`}
                        onClick={() => setShowFacultyManage((v) => !v)}
                        aria-expanded={showFacultyManage}
                    >
                        {isMobile ? (
                            'Manage Course'
                        ) : (
                            <>
                                <span className="course-nav-icon">
                                    <Plus size={18} />
                                </span>
                                <span className="course-label">Manage Course</span>
                                <ChevronDown size={18} className="course-nav-manage-chevron" />
                            </>
                        )}
                    </button>
                    {showFacultyManage && (
                        <div className="course-nav-faculty-manage-menu" role="menu">
                            <button
                                type="button"
                                className="course-nav-faculty-manage-item"
                                onClick={() => {
                                    setShowFacultyManage(false);
                                    navigate(`${basePath}/assignments/new`);
                                }}
                            >
                                <Plus size={16} /> Manual Assignment
                            </button>
                            <div className="course-nav-faculty-manage-divider" />
                            <button
                                type="button"
                                className="course-nav-faculty-manage-item"
                                onClick={() => syllabusInputRef.current?.click()}
                            >
                                <Upload size={16} /> Upload Syllabus
                            </button>
                            <button
                                type="button"
                                className="course-nav-faculty-manage-item"
                                onClick={() => scheduleInputRef.current?.click()}
                            >
                                <Upload size={16} /> Upload Assignment Schedule
                            </button>
                            <div className="course-nav-faculty-manage-divider" />
                            <button type="button" className="course-nav-faculty-manage-item" onClick={() => openFacultyModal('enroll')}>
                                <UserPlus size={16} /> Enroll Student
                            </button>
                            <button type="button" className="course-nav-faculty-manage-item" onClick={() => openFacultyModal('inviteTa')}>
                                <Key size={16} /> Invite Assistant
                            </button>
                            <div className="course-nav-faculty-manage-divider" />
                            <button
                                type="button"
                                className="course-nav-faculty-manage-item"
                                onClick={() => openFacultyModal('archive')}
                            >
                                <Archive size={16} /> Archive / Unarchive
                            </button>
                            <button
                                type="button"
                                className="course-nav-faculty-manage-item course-nav-faculty-manage-item--danger"
                                onClick={() => openFacultyModal('delete')}
                            >
                                <Trash2 size={16} /> Delete Course
                            </button>
                        </div>
                    )}
                </div>
            </>
        );
    };

    if (isMobile) {
        return (
            <aside className="course-sidebar">
                <nav className="course-nav">
                    {navItems.map((item) => renderNavItem(item))}
                    {renderFacultyManage()}
                </nav>
            </aside>
        );
    }

    return (
        <aside className="course-sidebar">
            <div className="course-context">
                <div className="course-context-info">
                    <div className="course-context-name">{course?.name ?? 'Course'}</div>
                    <div className="course-context-id">
                        {course ? [getCourseCatalogId(course), course.term].filter(Boolean).join('::') : ''}
                    </div>
                </div>
            </div>

            <nav className="course-nav">
                {navItems.map((item) => renderNavItem(item))}
                {renderFacultyManage()}
            </nav>
        </aside>
    );
};

export default CourseSidebar;
