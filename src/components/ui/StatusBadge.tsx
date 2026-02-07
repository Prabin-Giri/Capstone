import React from 'react';
import { SUBMISSION_STATUS, VISIBILITY_STATUS, ASSIGNMENT_STATUS } from '../../lib/constants';

type BadgeStatus = string;

interface StatusBadgeProps {
    status: BadgeStatus;
    className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
    // Simple style mapping based on status text content for now (foundation step)
    let colorClass = 'bg-gray-100 text-gray-800';

    switch (status) {
        case SUBMISSION_STATUS.COMPLETED:
        case ASSIGNMENT_STATUS.OPEN:
        case VISIBILITY_STATUS.RELEASED:
            colorClass = 'bg-green-100 text-green-800';
            break;
        case SUBMISSION_STATUS.FAILED:
        case ASSIGNMENT_STATUS.CLOSED:
            colorClass = 'bg-red-100 text-red-800';
            break;
        case SUBMISSION_STATUS.QUEUED:
        case ASSIGNMENT_STATUS.LATE:
            colorClass = 'bg-yellow-100 text-yellow-800';
            break;
        case SUBMISSION_STATUS.RUNNING:
            colorClass = 'bg-blue-100 text-blue-800';
            break;
        default:
            break;
    }

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colorClass} ${className}`}>
            {status}
        </span>
    );
};
