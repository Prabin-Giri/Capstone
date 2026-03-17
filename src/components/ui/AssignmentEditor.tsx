import React, { useState, useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { Play, FileText, Folder, Plus, Upload, CheckCircle, XCircle, Terminal, X } from 'lucide-react';
import './AssignmentEditor.css';
import { showDialog } from './Dialog';
import type { TestResult } from '../../lib/api';

export interface EditorFile {
    id: string;
    name: string;
    content: string;
    language: string;
    isStarter?: boolean;
}

interface AssignmentEditorProps {
    initialFiles: EditorFile[];
    language: string;
    theme: 'dark' | 'light' | 'system';
    onRunTests: (files: EditorFile[]) => Promise<{ results: TestResult[], log?: string }>;
    isRunning: boolean;
    points: number;
    onChange?: (files: EditorFile[]) => void;
}

const getLanguageFromFilename = (filename: string, defaultLang: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'js':
        case 'jsx': return 'javascript';
        case 'ts':
        case 'tsx': return 'typescript';
        case 'py': return 'python';
        case 'java': return 'java';
        case 'c': return 'c';
        case 'cpp': return 'cpp';
        case 'html': return 'html';
        case 'css': return 'css';
        default: return defaultLang;
    }
};

export const AssignmentEditor: React.FC<AssignmentEditorProps> = ({
    initialFiles,
    language,
    theme,
    onRunTests,
    isRunning,
    points,
    onChange
}) => {
    const [files, setFiles] = useState<EditorFile[]>(initialFiles.length ? initialFiles : [
        { id: '1', name: `main.${language === 'python' ? 'py' : language === 'java' ? 'java' : 'js'}`, content: '// Write your code here\n', language: language }
    ]);
    const [activeFileId, setActiveFileId] = useState<string>(files[0].id);
    const [openFileIds, setOpenFileIds] = useState<string[]>([files[0].id]);
    const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 768;
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isMobile());
    const [sidebarWidth, setSidebarWidth] = useState(180);
    const [isResizing, setIsResizing] = useState(false);
    const [testResults, setTestResults] = useState<TestResult[] | null>(null);
    const [testLog, setTestLog] = useState<string | null>(null);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);

    // Inline file creation state
    const [isCreatingFile, setIsCreatingFile] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const newFileInputRef = useRef<HTMLInputElement>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const monaco = useMonaco();

    // Re-sync files if initialFiles change (e.g. starter code loaded)
    useEffect(() => {
        if (initialFiles && initialFiles.length > 0) {
            setFiles(initialFiles);
            setActiveFileId(initialFiles[0].id);
            setOpenFileIds([initialFiles[0].id]);
        }
    }, [initialFiles]);

    // Send files back to parent whenever they change
    useEffect(() => {
        if (onChange) {
            onChange(files);
        }
    }, [files, onChange]);

    // Reactively detect dark mode from body class (AccountDrawer adds 'dark-theme' to document.body)
    const getIsDark = () =>
        theme === 'dark' ||
        document.body.classList.contains('dark-theme') ||
        document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark' ||
        localStorage.getItem('app-theme') === 'dark' ||
        (localStorage.getItem('app-theme') === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ||
        (!localStorage.getItem('app-theme') && theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const [isDark, setIsDark] = useState(getIsDark);

    useEffect(() => {
        setIsDark(getIsDark());

        // Watch body and html for class changes (covers CSS-class-based theming)
        const observer = new MutationObserver(() => setIsDark(getIsDark()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        // Watch localStorage changes (fired when AccountDrawer calls localStorage.setItem)
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'app-theme' || e.key === null) setIsDark(getIsDark());
        };
        window.addEventListener('storage', handleStorage);

        // Also listen for a custom 'theme-change' event dispatched by AccountDrawer
        const handleThemeEvent = () => setIsDark(getIsDark());
        window.addEventListener('theme-change', handleThemeEvent);

        return () => {
            observer.disconnect();
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('theme-change', handleThemeEvent);
        };
    }, [theme]);

    const editorTheme = isDark ? 'vs-dark' : 'vs-light';

    useEffect(() => {
        if (monaco) {
            monaco.editor.setTheme(editorTheme);
        }
    }, [monaco, editorTheme]);

    const activeFile = files.find(f => f.id === activeFileId) || files[0];

    const handleEditorChange = (value: string | undefined) => {
        setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: value || '' } : f));
    };

    const handleAddFileClick = () => {
        setIsCreatingFile(true);
        setNewFileName('');
        setTimeout(() => newFileInputRef.current?.focus(), 50);
    };

    const confirmNewFile = () => {
        if (!newFileName.trim()) {
            setIsCreatingFile(false);
            return;
        }

        const newFile: EditorFile = {
            id: Date.now().toString(),
            name: newFileName.trim(),
            content: '',
            language: getLanguageFromFilename(newFileName.trim(), language)
        };
        setFiles([...files, newFile]);
        setOpenFileIds(prev => [...prev, newFile.id]);
        setActiveFileId(newFile.id);
        setIsCreatingFile(false);
        setNewFileName('');
    };

    const handleNewFileKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            confirmNewFile();
        } else if (e.key === 'Escape') {
            setIsCreatingFile(false);
            setNewFileName('');
        }
    };

    const handleFileUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFiles = e.target.files;
        if (!uploadedFiles) return;

        Array.from(uploadedFiles).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target?.result as string;
                const newFile: EditorFile = {
                    id: Date.now().toString() + Math.random(),
                    name: file.name,
                    content,
                    language: getLanguageFromFilename(file.name, language)
                };
                setFiles(prev => [...prev, newFile]);
                setOpenFileIds(prev => [...prev, newFile.id]);
                setActiveFileId(newFile.id);
            };
            reader.readAsText(file);
        });

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDeleteFile = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (files.length === 1) {
            await showDialog({ message: 'You must have at least one file.', type: 'alert', title: 'Cannot Delete', confirmText: 'OK' });
            return;
        }
        const confirmed = await showDialog({
            title: 'Delete File',
            message: 'Are you sure you want to delete this file?',
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel',
        });
        if (!confirmed) return;

        const updatedFiles = files.filter(f => f.id !== id);
        setFiles(updatedFiles);
        setOpenFileIds(prev => prev.filter(fid => fid !== id));
        if (activeFileId === id) {
            const remainingOpen = openFileIds.filter(fid => fid !== id);
            if (remainingOpen.length > 0) {
                setActiveFileId(remainingOpen[0]);
            } else {
                setActiveFileId(updatedFiles[0]?.id || '');
                if (updatedFiles[0]) {
                    setOpenFileIds([updatedFiles[0].id]);
                }
            }
        }
    };

    const handleTabClose = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const nextOpenIds = openFileIds.filter(fid => fid !== id);
        setOpenFileIds(nextOpenIds);
        if (activeFileId === id && nextOpenIds.length > 0) {
            setActiveFileId(nextOpenIds[0]);
        } else if (nextOpenIds.length === 0) {
            // Unset active file if no tabs open
            setActiveFileId('');
        }
    };

    const handleFileClick = (id: string) => {
        if (!openFileIds.includes(id)) {
            setOpenFileIds(prev => [...prev, id]);
        }
        setActiveFileId(id);
    };

    // Resizing logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            if (!containerRef.current) return;
            const containerLeft = containerRef.current.getBoundingClientRect().left;
            const newWidth = Math.max(150, Math.min(e.clientX - containerLeft, 600));
            setSidebarWidth(newWidth);
        };
        const handleMouseUp = () => {
            setIsResizing(false);
        };
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    const handleRunClick = async () => {
        try {
            setIsTerminalOpen(true);
            setTestLog('Running tests...\n');
            const response = await onRunTests(files);
            setTestResults(response.results);
            if (response.log) setTestLog(prev => prev + '\n' + response.log);
            else setTestLog(prev => prev + '\nExecution finished.');
        } catch (err) {
            setTestLog(prev => prev + '\nError: Failed to run tests.');
            console.error(err);
        }
    };

    return (
        <div className="assignment-editor-container">
            {/* Top Toolbar */}
            <div className="editor-toolbar">
                <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                    <span className="editor-title" style={{ fontSize: '1rem', fontWeight: 600 }}>Project Workspace</span>
                </div>
                <div className="toolbar-right">
                    <button
                        className="btn-run-tests"
                        onClick={handleRunClick}
                        disabled={isRunning}
                    >
                        <Play size={16} className={isRunning ? 'spin-icon' : ''} />
                        {isRunning ? 'Running...' : 'Run Tests'}
                    </button>
                </div>
            </div>

            <div ref={containerRef} className="editor-main-area" style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
                {/* Mobile backdrop: tap outside sidebar to close */}
                {isSidebarOpen && isMobile() && (
                    <div
                        onClick={() => setIsSidebarOpen(false)}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 20 }}
                    />
                )}

                {/* Sidebar File Explorer */}
                {isSidebarOpen && (
                    <div
                        className="editor-sidebar"
                        style={{
                            ...(isMobile()
                                ? { position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 30, width: '220px', boxShadow: '4px 0 20px rgba(0,0,0,0.18)' }
                                : { width: `${sidebarWidth}px`, flexShrink: 0 }
                            ),
                            borderRight: '1px solid var(--border-color)',
                            display: 'flex',
                            minWidth: 200,
                            background: '#1e1e1e',
                        }}
                    >
                        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #333', cursor: 'default' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button onClick={() => setIsSidebarOpen(false)} title="Collapse" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex', alignItems: 'center' }}><Folder size={16} /></button>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em' }}>FILES</span>
                            </div>
                            <div className="sidebar-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button onClick={handleAddFileClick} title="New File" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><Plus size={16} /></button>
                                <button onClick={handleFileUploadClick} title="Upload File" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><Upload size={16} /></button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={handleFileUpload}
                                    multiple
                                />
                            </div>
                        </div>
                        <div className="file-list">
                            {isCreatingFile && (
                                <div className="file-item new-file-input-wrapper">
                                    <FileText size={16} className="file-icon" />
                                    <input
                                        ref={newFileInputRef}
                                        type="text"
                                        className="new-file-input"
                                        value={newFileName}
                                        onChange={e => setNewFileName(e.target.value)}
                                        onBlur={confirmNewFile}
                                        onKeyDown={handleNewFileKeyDown}
                                        placeholder="filename.ext"
                                    />
                                </div>
                            )}
                            {files.map(f => (
                                <div
                                    key={f.id}
                                    className={`file-item ${f.id === activeFileId ? 'active' : ''}`}
                                    onClick={() => handleFileClick(f.id)}
                                >
                                    <FileText size={16} className="file-icon" />
                                    <span className="file-name">{f.name}</span>
                                    {!f.isStarter && (
                                        <button
                                            className="file-delete-btn"
                                            onClick={(e) => handleDeleteFile(e, f.id)}
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Resizer Handle — desktop only */}
                {isSidebarOpen && !isMobile() && (
                    <div
                        onMouseDown={() => setIsResizing(true)}
                        style={{
                            width: '4px',
                            cursor: 'col-resize',
                            background: isResizing ? 'var(--primary-color)' : 'transparent',
                            zIndex: 10,
                            transition: 'background 0.2s',
                            flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--primary-light)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = isResizing ? 'var(--primary-color)' : 'transparent')}
                    />
                )}

                {/* Main Editor Pane */}
                <div className="editor-pane" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    {/* Tab Bar Container */}
                    <div className="editor-tabs" style={{ display: 'flex', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', overflowX: 'auto', alignItems: 'center' }}>
                        {!isSidebarOpen && (
                            <button
                                className="btn-icon"
                                onClick={() => setIsSidebarOpen(true)}
                                title="Expand Explorer"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '0 12px', color: 'var(--text-secondary)' }}
                            >
                                <Folder size={18} />
                            </button>
                        )}
                        {openFileIds.map(fid => {
                            const tabFile = files.find(f => f.id === fid);
                            if (!tabFile) return null;
                            const isActive = fid === activeFileId;
                            return (
                                <div
                                    key={fid}
                                    onClick={() => setActiveFileId(fid)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                                        cursor: 'pointer',
                                        borderBottom: isActive ? '2px solid var(--primary-color)' : '2px solid transparent',
                                        background: isActive ? 'var(--light-grey)' : 'transparent',
                                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        userSelect: 'none',
                                        fontSize: '13px'
                                    }}
                                >
                                    <span>{tabFile.name}</span>
                                    <button
                                        onClick={(e) => handleTabClose(e, fid)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', opacity: 0.6 }}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    {activeFile ? (
                        <Editor
                            height="400px"
                            language={activeFile.language}
                            theme={editorTheme}
                            value={activeFile.content}
                            onChange={handleEditorChange}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                lineHeight: 24,
                                padding: { top: 16 },
                                scrollBeyondLastLine: false,
                                smoothScrolling: true,
                                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace"
                            }}
                        />
                    ) : (
                        <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                            No file open. Select a file from the explorer.
                        </div>
                    )}
                </div>
            </div>

            {/* Terminal View */}
            {isTerminalOpen && (
                <div className="editor-terminal">
                    <div className="terminal-header">
                        <div className="terminal-title">
                            <Terminal size={16} />
                            <span>Test Results</span>
                        </div>
                        <button className="terminal-close" onClick={() => setIsTerminalOpen(false)}>
                            <X size={16} />
                        </button>
                    </div>

                    <div className="terminal-content">
                        {testResults ? (
                            <div className="terminal-results-grid">
                                {(() => {
                                    const totalPoints = testResults.reduce((s, r) => s + (r.points ?? 0), 0) || points;
                                    const earnedPoints = testResults.reduce((s, r) => s + (r.passed ? (r.points ?? 0) : 0), 0);

                                    return (
                                        <div className="terminal-summary">
                                            <h3>Execution Summary</h3>
                                            <p>Passed: {testResults.filter(r => r.passed).length} / {testResults.length}</p>
                                            {totalPoints > 0 && <p>Points: {earnedPoints} / {totalPoints}</p>}
                                        </div>
                                    )
                                })()}

                                <div className="terminal-test-cases">
                                    {testResults.map((result, idx) => (
                                        <div key={idx} className={`terminal-test-case ${result.passed ? 'passed' : 'failed'}`}>
                                            <div className="test-case-header">
                                                {result.passed ? <CheckCircle size={16} /> : <XCircle size={16} />}
                                                <span>Test Case {idx + 1} {result.is_public === 0 ? '(Hidden)' : ''}</span>
                                            </div>
                                            {result.is_public === 1 && !result.passed && (
                                                <div className="test-case-details">
                                                    <div><strong>Expected:</strong> <code>{result.expected}</code></div>
                                                    <div><strong>Actual:</strong> <code>{result.actual}</code></div>
                                                    {result.error && <div className="test-error">{result.error}</div>}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {testLog && (
                                    <div className="terminal-log-output">
                                        <h4>Console Log</h4>
                                        <pre>{testLog}</pre>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="terminal-loading">
                                <span className={isRunning ? 'blinking-cursor' : ''}>
                                    {testLog || 'Ready.'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
