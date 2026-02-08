import React from 'react';
import { SUBMISSION_STATUS, VISIBILITY_STATUS, ASSIGNMENT_STATUS } from '../../lib/constants';
import './components.css';

type BadgeStatus = string;

interface StatusBadgeProps {
    status: BadgeStatus;
    className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
    let colorClass = 'status-neutral';

    switch (status) {
        case SUBMISSION_STATUS.COMPLETED:
        case ASSIGNMENT_STATUS.OPEN:
        case VISIBILITY_STATUS.RELEASED:
            colorClass = 'status-success';
            break;
        case SUBMISSION_STATUS.FAILED:
        case ASSIGNMENT_STATUS.CLOSED:
            colorClass = 'status-error';
            break;
        case SUBMISSION_STATUS.QUEUED:
        case ASSIGNMENT_STATUS.LATE:
            colorClass = 'status-warning';
            break;
        case SUBMISSION_STATUS.RUNNING:
            colorClass = 'status-info';
            break;
        default:
            break;
    }

    return (
        <span className={`status-badge ${colorClass} ${className}`}>
            {status}
        </span>
    );
};
