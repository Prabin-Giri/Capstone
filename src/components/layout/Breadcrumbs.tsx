import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { assignments, courses } from '../../lib/mockData';
import './Layout.css';

interface BreadcrumbsProps {
    courseId: string;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ courseId }) => {
    const location = useLocation();
    const course = courses.find((item) => item.id === courseId);

    if (!course) {
        return null;
    }

    const basePath = `/student/courses/${courseId}`;
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const crumbs: { label: string; to: string }[] = [];

    const assignmentsIndex = pathSegments.indexOf('assignments');
    if (assignmentsIndex !== -1) {
        const assignmentId = pathSegments[assignmentsIndex + 1];
        if (assignmentId) {
            crumbs.push({ label: 'Assignments', to: `${basePath}/assignments` });
            const assignment = assignments.find(
                (item) => item.courseId === courseId && item.id === assignmentId
            );
            crumbs.push({
                label: assignment?.title ?? 'Assignment',
                to: `${basePath}/assignments/${assignmentId}`,
            });
        }
    }

    const gradesIndex = pathSegments.indexOf('grades');
    if (gradesIndex !== -1) {
        crumbs.push({ label: 'Grades', to: `${basePath}/grades` });
    }

    if (crumbs.length === 0) {
        return null;
    }

    /* Avoid a redundant strip when the only crumb repeats the page title (course nav is enough). */
    if (crumbs.length === 1 && crumbs[0].label === 'Grades') {
        return null;
    }

    return (
        <div className="breadcrumbs">
            {crumbs.map((crumb, index) => (
                <React.Fragment key={`${crumb.label}-${crumb.to}`}>
                    <Link className="breadcrumb-link" to={crumb.to}>
                        {crumb.label}
                    </Link>
                    {index < crumbs.length - 1 && (
                        <span className="breadcrumb-separator">&gt;</span>
                    )}
                </React.Fragment>
            ))}
        </div>
    );
};

export default Breadcrumbs;
