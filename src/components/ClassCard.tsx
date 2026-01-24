import React from 'react';
import { Card, CardContent, CardHeader } from './ui/Card';
import './ClassCard.css';

interface ClassCardProps {
    id: string;
    name: string;
    code: string;
    term: string;
    activeAssignments: number;
    nextDeadline?: string;
    onClick: (id: string) => void;
}

export const ClassCard: React.FC<ClassCardProps> = ({
    id,
    name,
    code,
    term,
    activeAssignments,
    nextDeadline,
    onClick,
}) => {
    return (
        <Card className="class-card" onClick={() => onClick(id)}>
            <CardHeader
                title={name}
                description={
                    <div className="class-meta">
                        <span className="meta-tag">{code}</span>
                        <span>{term}</span>
                    </div>
                }
            />
            <CardContent>
                <div className="stat-row">
                    <div className="stat-item">
                        <span className="stat-value">{activeAssignments}</span>
                        <span className="stat-label">Active Assignments</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{nextDeadline || 'None'}</span>
                        <span className="stat-label">Next Deadline</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
