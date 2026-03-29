import React, { useState, useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { Play, FileText, Folder, Plus, Upload, CheckCircle, XCircle, Terminal, X, GripHorizontal, PanelBottomOpen, Maximize2, Minimize2 } from 'lucide-react';
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
    onRunTests?: (files: EditorFile[]) => Promise<{ results: TestResult[], log?: string }>;
    onRunCustomInput?: (files: EditorFile[], stdin: string) => Promise<{ stdout: string, stderr: string | null, exitCode: number, timedOut: boolean }>;
    isRunning: boolean;
    points: number;
    onChange?: (files: EditorFile[]) => void;
    readOnly?: boolean;
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
    onRunCustomInput,
    isRunning,
    points,
    onChange,
    readOnly = false
}) => {
    const [files, setFiles] = useState<EditorFile[]>(initialFiles.length ? initialFiles : [
        { id: '1', name: `main.${language === 'python' ? 'py' : language === 'java' ? 'java' : 'js'}`, content: '// Write your code here\n', language: language }
    ]);
    const [activeFileId, setActiveFileId] = useState<string>(files[0].id);
    const [openFileIds, setOpenFileIds] = useState<string[]>([files[0].id]);
    const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 768;
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isMobile());
    const [sidebarWidth, setSidebarWidth] = useState(200);
    const [isResizing, setIsResizing] = useState(false);
    const [testResults, setTestResults] = useState<TestResult[] | null>(null);
    const [testLog, setTestLog] = useState<string | null>(null);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [terminalHeight, setTerminalHeight] = useState(240);
    const [isTerminalResizing, setIsTerminalResizing] = useState(false);
    const [terminalTab, setTerminalTab] = useState<'tests' | 'custom'>('tests');
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Custom Run State
    const [customStdin, setCustomStdin] = useState('');
    const [customRunResult, setCustomRunResult] = useState<{ stdout: string, stderr: string | null, exitCode: number, timedOut: boolean } | null>(null);

    // Inline file creation state
    const [isCreatingFile, setIsCreatingFile] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const newFileInputRef = useRef<HTMLInputElement>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalResizeStartY = useRef(0);
    const terminalResizeStartHeight = useRef(0);
    const monaco = useMonaco();

    const pctToEditorFont = (pct: number) => Math.round(14 * pct / 100);
    const [editorFontSize, setEditorFontSize] = useState<number>(() =>
        pctToEditorFont(parseInt(localStorage.getItem('app-font-size') || '100'))
    );

    // Sync editor font size with global app font size setting
    useEffect(() => {
        const handleFontSizeChange = (e: Event) => {
            setEditorFontSize(pctToEditorFont((e as CustomEvent<number>).detail));
        };
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'app-font-size' && e.newValue) {
                setEditorFontSize(pctToEditorFont(parseInt(e.newValue)));
            }
        };
        window.addEventListener('font-size-change', handleFontSizeChange);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('font-size-change', handleFontSizeChange);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

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

    // Reactively detect dark mode from body class
    const getIsDark = () =>
        localStorage.getItem('theme') === 'dark' ||
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
        const observer = new MutationObserver(() => setIsDark(getIsDark()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'app-theme' || e.key === 'theme' || e.key === null) setIsDark(getIsDark());
        };
        window.addEventListener('storage', handleStorage);
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

    const activeFile = activeFileId ? (files.find(f => f.id === activeFileId) ?? null) : null;

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
        if (e.key === 'Enter') confirmNewFile();
        else if (e.key === 'Escape') {
            setIsCreatingFile(false);
            setNewFileName('');
        }
    };

    const handleFileUploadClick = () => fileInputRef.current?.click();

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
                if (updatedFiles[0]) setOpenFileIds([updatedFiles[0].id]);
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
            setActiveFileId('');
        }
    };

    const handleFileClick = (id: string) => {
        if (!openFileIds.includes(id)) setOpenFileIds(prev => [...prev, id]);
        setActiveFileId(id);
    };

    // Sidebar resizing
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            if (!containerRef.current) return;
            const containerLeft = containerRef.current.getBoundingClientRect().left;
            const newWidth = Math.max(150, Math.min(e.clientX - containerLeft, 600));
            setSidebarWidth(newWidth);
        };
        const handleMouseUp = () => setIsResizing(false);
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    // Exit fullscreen on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isFullscreen]);

    // Terminal resizing (drag from top)
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isTerminalResizing) return;
            const delta = terminalResizeStartY.current - e.clientY;
            const newHeight = Math.max(80, Math.min(terminalResizeStartHeight.current + delta, 600));
            setTerminalHeight(newHeight);
        };
        const handleMouseUp = () => setIsTerminalResizing(false);
        if (isTerminalResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isTerminalResizing]);

    const handleRunClick = async () => {
        if (!onRunTests) return;
        try {
            setTerminalTab('tests');
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

    const handleCustomRunClick = async () => {
        if (!onRunCustomInput) return;
        try {
            setTerminalTab('custom');
            setIsTerminalOpen(true);
            setCustomRunResult(null);
            const response = await onRunCustomInput(files, customStdin);
            setCustomRunResult(response);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setCustomRunResult({ stdout: '', stderr: msg, exitCode: 1, timedOut: false });
        }
    };

    const langLabel = activeFile?.language
        ? activeFile.language.charAt(0).toUpperCase() + activeFile.language.slice(1)
        : language;

    return (
        <div className={`assignment-editor-container${isFullscreen ? ' editor-fullscreen' : ''}`} data-editor-theme={isDark ? 'dark' : 'light'}>
            {/* VSCode-like Title Bar */}
            <div className="editor-titlebar">
                <div className="titlebar-left">
                    <span className="editor-title">Project Workspace</span>
                </div>
                <div className="titlebar-right">
                    <button
                        className="btn-icon-titlebar"
                        onClick={() => setIsFullscreen(f => !f)}
                        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </button>
                    {onRunCustomInput && (
                        <button
                            className="btn-run-tests btn-secondary-run"
                            onClick={handleCustomRunClick}
                            disabled={isRunning}
                        >
                            <Terminal size={14} className={isRunning && terminalTab === 'custom' ? 'spin-icon' : ''} />
                            {isRunning && terminalTab === 'custom' ? 'Running...' : 'Run with Input'}
                        </button>
                    )}
                    {onRunTests && (
                        <button
                            className="btn-run-tests"
                            onClick={handleRunClick}
                            disabled={isRunning}
                        >
                            <Play size={14} className={isRunning && terminalTab === 'tests' ? 'spin-icon' : ''} fill={isRunning && terminalTab === 'tests' ? 'currentColor' : 'none'} />
                            {isRunning && terminalTab === 'tests' ? 'Running...' : 'Run Tests'}
                        </button>
                    )}
                </div>
            </div>

            {/* Body: sidebar + editor pane */}
            <div ref={containerRef} className="editor-body">
                {/* Mobile overlay backdrop */}
                {isSidebarOpen && isMobile() && (
                    <div
                        onClick={() => setIsSidebarOpen(false)}
                        className="sidebar-backdrop"
                    />
                )}

                {/* Sidebar File Explorer */}
                {isSidebarOpen && (
                    <div
                        className="editor-sidebar"
                        style={isMobile()
                            ? { position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 30, width: '220px', boxShadow: '4px 0 24px rgba(0,0,0,0.3)' }
                            : { width: `${sidebarWidth}px` }
                        }
                    >
                        <div className="sidebar-section-label">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                    className="sidebar-toggle-btn"
                                    onClick={() => setIsSidebarOpen(false)}
                                    title="Collapse Explorer"
                                >
                                    <Folder size={13} />
                                </button>
                                <span>EXPLORER</span>
                            </div>
                            <div className="sidebar-actions">
                                <button onClick={handleAddFileClick} title="New File"><Plus size={15} /></button>
                                <button onClick={handleFileUploadClick} title="Upload File"><Upload size={15} /></button>
                                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} multiple />
                            </div>
                        </div>
                        <div className="sidebar-files-label">PROJECT</div>
                        <div className="file-list">
                            {isCreatingFile && (
                                <div className="file-item new-file-input-wrapper">
                                    <FileText size={14} className="file-icon" />
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
                                    <FileText size={14} className="file-icon" />
                                    <span className="file-name">{f.name}</span>
                                    {!f.isStarter && (
                                        <button className="file-delete-btn" onClick={(e) => handleDeleteFile(e, f.id)}>
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Sidebar resize handle */}
                {isSidebarOpen && !isMobile() && (
                    <div
                        className={`sidebar-resize-handle ${isResizing ? 'active' : ''}`}
                        onMouseDown={() => setIsResizing(true)}
                    />
                )}

                {/* Main Editor Pane */}
                <div className="editor-pane">
                    {/* Tab Bar */}
                    <div className="editor-tabs">
                        {!isSidebarOpen && (
                            <button
                                className="tab-sidebar-toggle"
                                onClick={() => setIsSidebarOpen(true)}
                                title="Show Explorer"
                            >
                                <Folder size={16} />
                            </button>
                        )}
                        {openFileIds.map(fid => {
                            const tabFile = files.find(f => f.id === fid);
                            if (!tabFile) return null;
                            const isActive = fid === activeFileId;
                            return (
                                <div
                                    key={fid}
                                    className={`editor-tab ${isActive ? 'active' : ''}`}
                                    onClick={() => setActiveFileId(fid)}
                                >
                                    <FileText size={13} style={{ opacity: 0.7, flexShrink: 0 }} />
                                    <span>{tabFile.name}</span>
                                    <button
                                        className="tab-close-btn"
                                        onClick={(e) => handleTabClose(e, fid)}
                                    >
                                        <X size={11} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Monaco Editor fills remaining space */}
                    <div className="monaco-wrapper">
                        {activeFile ? (
                            <Editor
                                height="100%"
                                language={activeFile.language}
                                theme={editorTheme}
                                value={activeFile.content}
                                onChange={handleEditorChange}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: editorFontSize,
                                    lineHeight: Math.round(editorFontSize * 1.57),
                                    padding: { top: 12, bottom: 0 },
                                    scrollBeyondLastLine: false,
                                    scrollbar: { vertical: 'auto', handleMouseWheel: true, alwaysConsumeMouseWheel: false },
                                    smoothScrolling: true,
                                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                    readOnly: readOnly,
                                    renderLineHighlight: 'all',
                                    cursorBlinking: 'smooth',
                                    bracketPairColorization: { enabled: true },
                                    folding: true,
                                    lineNumbers: 'on',
                                    glyphMargin: false,
                                    overviewRulerBorder: false,
                                }}
                            />
                        ) : (
                            <div className="monaco-empty-state">
                                <Folder size={36} style={{ opacity: 0.25 }} />
                                <span style={{ fontSize: '0.9rem', opacity: 0.5 }}>Open a file from the Explorer to start editing</span>
                            </div>
                        )}
                    </div>

                    {/* Terminal Panel — drag from top handle */}
                    {isTerminalOpen && (
                        <div className="editor-terminal" style={{ height: `${terminalHeight}px` }}>
                            {/* Drag handle */}
                            <div
                                className={`terminal-resize-handle ${isTerminalResizing ? 'active' : ''}`}
                                onMouseDown={(e) => {
                                    terminalResizeStartY.current = e.clientY;
                                    terminalResizeStartHeight.current = terminalHeight;
                                    setIsTerminalResizing(true);
                                    e.preventDefault();
                                }}
                            >
                                <GripHorizontal size={14} />
                            </div>

                            {/* Terminal Header */}
                            <div className="terminal-header">
                                <div className="terminal-tabs">
                                    <div
                                        className={`terminal-tab ${terminalTab === 'tests' ? 'active' : ''}`}
                                        onClick={() => setTerminalTab('tests')}
                                    >
                                        <CheckCircle size={13} />
                                        <span>Test Results</span>
                                    </div>
                                    {onRunCustomInput && (
                                        <div
                                            className={`terminal-tab ${terminalTab === 'custom' ? 'active' : ''}`}
                                            onClick={() => setTerminalTab('custom')}
                                        >
                                            <Play size={13} />
                                            <span>Custom Run</span>
                                        </div>
                                    )}
                                </div>
                                <button className="terminal-close" onClick={() => setIsTerminalOpen(false)} title="Close Terminal">
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="terminal-content">
                                {terminalTab === 'tests' ? (
                                    testResults ? (
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
                                                );
                                            })()}
                                            <div className="terminal-test-cases">
                                                {testResults.map((result, idx) => (
                                                    <div key={idx} className={`terminal-test-case ${result.passed ? 'passed' : 'failed'}`}>
                                                        <div className="test-case-header">
                                                            {result.passed ? <CheckCircle size={14} /> : <XCircle size={14} />}
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
                                            <span className={isRunning && terminalTab === 'tests' ? 'blinking-cursor' : ''}>
                                                {isRunning && terminalTab === 'tests'
                                                    ? (testLog || 'Executing tests...')
                                                    : (testLog || '$ Ready. Click "Run Tests" to see results.')}
                                            </span>
                                        </div>
                                    )
                                ) : (
                                    <div className="terminal-custom-run">
                                        <div className="custom-run-input-area">
                                            <label className="terminal-label">STDIN</label>
                                            <textarea
                                                value={customStdin}
                                                onChange={e => setCustomStdin(e.target.value)}
                                                placeholder="Enter standard input here..."
                                                className="custom-stdin-textarea"
                                            />
                                            <button
                                                className="btn-run-tests"
                                                onClick={handleCustomRunClick}
                                                disabled={isRunning}
                                                style={{ alignSelf: 'flex-end', marginTop: '6px' }}
                                            >
                                                <Play size={13} />
                                                {isRunning && terminalTab === 'custom' ? 'Executing...' : 'Run Code'}
                                            </button>
                                        </div>
                                        <div className="custom-run-output-area">
                                            <label className="terminal-label">OUTPUT</label>
                                            <div className="custom-output-box">
                                                {isRunning && terminalTab === 'custom' ? (
                                                    <span className="blinking-cursor">Executing in sandbox...</span>
                                                ) : customRunResult ? (
                                                    <>
                                                        {customRunResult.stdout && <div>{customRunResult.stdout}</div>}
                                                        {customRunResult.stderr && <div style={{ color: '#f87171', marginTop: customRunResult.stdout ? '8px' : '0' }}>{customRunResult.stderr}</div>}
                                                        {customRunResult.timedOut && <div style={{ color: '#f87171', marginTop: '8px' }}>Process timed out after 10 seconds.</div>}
                                                        {customRunResult.exitCode !== 0 && !customRunResult.timedOut && (
                                                            <div style={{ color: '#f87171', marginTop: '8px' }}>Exit code: {customRunResult.exitCode}</div>
                                                        )}
                                                        {!customRunResult.stdout && !customRunResult.stderr && !customRunResult.timedOut && customRunResult.exitCode === 0 && (
                                                            <span style={{ opacity: 0.4 }}>(No output)</span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span style={{ opacity: 0.4 }}>$ Output will appear here.</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* VSCode-like Status Bar */}
            <div className="editor-status-bar">
                <div className="status-bar-left">
                    <span className="status-item">{langLabel}</span>
                    {activeFile && <span className="status-item status-filename">{activeFile.name}</span>}
                </div>
                <div className="status-bar-right">
                    {(onRunTests || onRunCustomInput) && (
                        <button
                            className="status-terminal-btn"
                            onClick={() => setIsTerminalOpen(v => !v)}
                            title={isTerminalOpen ? 'Hide Terminal' : 'Show Terminal'}
                        >
                            <PanelBottomOpen size={13} />
                            <span>Terminal</span>
                        </button>
                    )}
                    {readOnly && <span className="status-item status-readonly">READ ONLY</span>}
                </div>
            </div>
        </div>
    );
};
