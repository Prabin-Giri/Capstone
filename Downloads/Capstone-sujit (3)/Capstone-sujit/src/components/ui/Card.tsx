import React from 'react';
import './components.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    title?: string;
    action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, action, ...props }) => {
    return (
        <div className={`card ${className}`} {...props}>
            {(title || action) && (
                <div className="card-header">
                    {title && <h3 className="card-title">{title}</h3>}
                    {action && <div>{action}</div>}
                </div>
            )}
            <div className="card-body">
                {children}
            </div>
        </div>
    );
};
