import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    title?: string;
    action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, action, ...props }) => {
    return (
        <div className={`bg-white shadow rounded-lg border border-gray-200 ${className}`} {...props}>
            {(title || action) && (
                <div className="px-4 py-5 border-b border-gray-200 sm:px-6 flex justify-between items-center">
                    {title && <h3 className="text-lg leading-6 font-medium text-gray-900">{title}</h3>}
                    {action && <div>{action}</div>}
                </div>
            )}
            <div className="px-4 py-5 sm:p-6">
                {children}
            </div>
        </div>
    );
};
