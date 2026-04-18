import React from 'react';
import './AgnosTitle.css';

export type AgnosTitleVariant = 'auth' | 'sidebar';

export interface AgnosTitleProps {
    variant?: AgnosTitleVariant;
    className?: string;
}

/** Wordmark: "Agno" maroon + "s" cream — use instead of logo image. */
export const AgnosTitle: React.FC<AgnosTitleProps> = ({ variant = 'auth', className = '' }) => {
    const v = `agnos-title--${variant}`;
    return (
        <h1 className={['agnos-title', v, className].filter(Boolean).join(' ')} aria-label="Agnos">
            <span className="agnos-title__maroon">Agno</span>
            <span className="agnos-title__cream">s</span>
        </h1>
    );
};

export default AgnosTitle;
