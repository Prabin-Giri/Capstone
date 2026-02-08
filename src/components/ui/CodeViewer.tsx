import React from 'react';

interface CodeViewerProps {
    code: string;
    language?: string;
    filename?: string;
    className?: string;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
    code,
    language = 'text',
    filename,
    className = ''
}) => {
    return (
        <div className={`rounded-md overflow-hidden border border-gray-200 bg-gray-50 ${className}`} data-language={language}>
            {filename && (
                <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 text-sm font-mono text-gray-700">
                    {filename}
                </div>
            )}
            <div className="overflow-x-auto p-4">
                <pre className="text-sm font-mono text-gray-800 whitespace-pre">
                    {code}
                </pre>
            </div>
        </div>
    );
};
