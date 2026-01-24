import React from 'react';
import './Badge.css';

export type BadgeStatus =
    | 'queued' | 'running' | 'completed' | 'failed' | 'timed out'
    | 'hidden' | 'released'
    | 'open' | 'closed' | 'late'
    | 'default';

interface BadgeProps {
    status?: BadgeStatus;
    children?: React.ReactNode;
    className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status = 'default', children, className = '' }) => {
    // Normalize status string for class parsing (e.g., "timed out" -> "timed-out")
    const statusClass = `badge-${status.replace(/\s+/g, '-')}`;

    return (
        <span className={`badge ${statusClass} ${className}`}>
            {children || status}
        </span>
    );
};
