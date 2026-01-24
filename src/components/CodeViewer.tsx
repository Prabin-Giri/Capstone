import React from 'react';
import { Download } from 'lucide-react';
import { Button } from './ui/Button';
import './CodeViewer.css';

interface CodeViewerProps {
    filename: string;
    code: string;
    onDownload?: () => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ filename, code, onDownload }) => {
    return (
        <div className="code-viewer">
            <div className="code-header">
                <span className="filename">{filename}</span>
                {onDownload && (
                    <Button size="sm" variant="ghost" onClick={onDownload} leftIcon={<Download className="w-3 h-3" />}>
                        Download
                    </Button>
                )}
            </div>
            <pre className="code-content">
                <code>{code}</code>
            </pre>
        </div>
    );
};
