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
    const crumbs: { label: string; to: string }[] = [
        { label: course.name, to: basePath },
    ];

    const assignmentsIndex = pathSegments.indexOf('assignments');
    if (assignmentsIndex !== -1) {
        crumbs.push({ label: 'Assignments', to: `${basePath}/assignments` });
        const assignmentId = pathSegments[assignmentsIndex + 1];
        if (assignmentId) {
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
