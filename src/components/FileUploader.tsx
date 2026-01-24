import React, { useCallback, useState } from 'react';
import { Upload, FileCode, X } from 'lucide-react';
import './FileUploader.css';

interface FileUploaderProps {
    onFilesSelected: (files: File[]) => void;
    acceptedFileTypes?: string[]; // e.g., ['.py', '.java', '.cpp']
    maxFiles?: number;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
    onFilesSelected,
    acceptedFileTypes = ['.py', '.java', '.cpp', '.c', '.h', '.js', '.ts'],
    maxFiles = 5
}) => {
    const [isDragActive, setIsDragActive] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragActive(true);
        } else if (e.type === 'dragleave') {
            setIsDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    };

    const handleFiles = (files: File[]) => {
        // Filter valid types if needed, check duplicates
        const newFiles = [...selectedFiles, ...files].slice(0, maxFiles);
        setSelectedFiles(newFiles);
        onFilesSelected(newFiles);
    };

    const removeFile = (index: number) => {
        const newFiles = [...selectedFiles];
        newFiles.splice(index, 1);
        setSelectedFiles(newFiles);
        onFilesSelected(newFiles);
    };

    return (
        <div>
            <div
                className={`file-uploader ${isDragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input')?.click()}
            >
                <input
                    id="file-input"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleChange}
                    accept={acceptedFileTypes.join(',')}
                    style={{ display: 'none' }}
                />

                <div className="uploader-content">
                    <Upload className="upload-icon" />
                    <div>
                        <p className="upload-text">
                            Drag & drop files here, or click to select
                        </p>
                        <p className="upload-hint">
                            Accepted formats: {acceptedFileTypes.join(', ')}
                        </p>
                    </div>
                </div>
            </div>

            {selectedFiles.length > 0 && (
                <div className="file-list">
                    {selectedFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="file-item">
                            <div className="file-info">
                                <FileCode className="w-4 h-4 text-gray-500" />
                                <span>{file.name}</span>
                                <span className="text-gray-400 text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <button
                                className="file-remove-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeFile(index);
                                }}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
