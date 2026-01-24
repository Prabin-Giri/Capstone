import React from 'react';
import './Card.css';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
}

interface CardHeaderProps {
    title: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
    return (
        <div className={`card ${className}`} onClick={onClick}>
            {children}
        </div>
    );
};

export const CardHeader: React.FC<CardHeaderProps> = ({ title, description, action }) => {
    return (
        <div className="card-header">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="card-title">{title}</h3>
                    {description && <div className="card-description">{description}</div>}
                </div>
                {action && <div>{action}</div>}
            </div>
        </div>
    );
};

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className = ''
}) => {
    return <div className={`card-content ${className}`}>{children}</div>;
};

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className = ''
}) => {
    return <div className={`card-footer ${className}`}>{children}</div>;
};
