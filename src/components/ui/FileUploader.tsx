import React, { useRef } from 'react';
import { Button } from './Button';

interface FileUploaderProps {
    onFileSelect: (file: File) => void;
    selectedFile: File | null;
    accept?: string;
    disabled?: boolean;
    label?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
    onFileSelect,
    selectedFile,
    accept = '.zip,.tar.gz,.py,.java,.cpp,.h,.c',
    disabled = false,
    label = "Upload File"
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFileSelect(e.target.files[0]);
        }
    };

    const handleButtonClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 hover:bg-gray-50 transition-colors">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept={accept}
                onChange={handleFileChange}
                disabled={disabled}
            />

            <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>

                <h3 className="mt-2 text-sm font-medium text-gray-900">
                    {selectedFile ? selectedFile.name : label}
                </h3>

                <p className="mt-1 text-xs text-gray-500">
                    {selectedFile ? `${(selectedFile.size / 1024).toFixed(2)} KB` : accept.replace(/,/g, ', ')}
                </p>

                <div className="mt-4">
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleButtonClick}
                        disabled={disabled}
                    >
                        {selectedFile ? 'Change File' : 'Select File'}
                    </Button>
                </div>
            </div>
        </div>
    );
};
