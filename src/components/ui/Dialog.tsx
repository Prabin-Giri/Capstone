import React, { useState, useCallback, useEffect } from 'react';
import { AlertCircle, CheckCircle, Trash2, X } from 'lucide-react';
import './Dialog.css';

export type DialogType = 'alert' | 'confirm' | 'success' | 'danger';

interface DialogOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: DialogType;
}

interface DialogState extends DialogOptions {
    isOpen: boolean;
    resolve: ((value: boolean) => void) | null;
}

// Global dialog controller (singleton)
let _showDialog: ((opts: DialogOptions) => Promise<boolean>) | null = null;
let _cancelDialog: (() => void) | null = null;

export function showDialog(opts: DialogOptions): Promise<boolean> {
    if (_showDialog) return _showDialog(opts);
    // Fallback to native if component not mounted
    if (opts.confirmText && opts.cancelText !== undefined) return Promise.resolve(window.confirm(opts.message));
    window.alert(opts.message);
    return Promise.resolve(true);
}

export function cancelDialog(): void {
    _cancelDialog?.();
}

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<DialogState>({
        isOpen: false,
        message: '',
        resolve: null,
    });

    const openDialog = useCallback((opts: DialogOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setState({ ...opts, isOpen: true, resolve });
        });
    }, []);

    const cancelRef = React.useRef<() => void>(() => { });

    useEffect(() => {
        _showDialog = openDialog;
        _cancelDialog = () => cancelRef.current();
        return () => { _showDialog = null; _cancelDialog = null; };
    }, [openDialog]);

    useEffect(() => {
        if (state.isOpen) {
            document.body.classList.add('dialog-open');
        } else {
            document.body.classList.remove('dialog-open');
        }
        return () => document.body.classList.remove('dialog-open');
    }, [state.isOpen]);

    const handleConfirm = () => {
        state.resolve?.(true);
        setState(s => ({ ...s, isOpen: false, resolve: null }));
    };

    const handleCancel = () => {
        state.resolve?.(false);
        setState(s => ({ ...s, isOpen: false, resolve: null }));
    };

    cancelRef.current = handleCancel;

    const isConfirm = state.cancelText !== undefined || state.type === 'danger' || state.type === 'confirm';

    const iconMap: Record<DialogType, React.ReactNode> = {
        alert: <AlertCircle size={24} style={{ color: 'var(--primary-color)' }} />,
        confirm: <AlertCircle size={24} style={{ color: 'var(--primary-color)' }} />,
        success: <CheckCircle size={24} style={{ color: '#22c55e' }} />,
        danger: <Trash2 size={24} style={{ color: 'var(--primary-color)' }} />,
    };

    const icon = iconMap[state.type ?? (isConfirm ? 'confirm' : 'alert')];

    return (
        <>
            {children}
            {state.isOpen && (
                <div className="dialog-backdrop" onClick={isConfirm ? handleCancel : handleConfirm}>
                    <div className="dialog-box" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                        <div className="dialog-header">
                            <div className="dialog-icon">{icon}</div>
                            {state.title && <h3 className="dialog-title">{state.title}</h3>}
                            <button className="dialog-close" onClick={isConfirm ? handleCancel : handleConfirm} aria-label="Close">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="dialog-message">{state.message}</p>
                        <div className="dialog-actions">
                            {isConfirm && (
                                <button className="dialog-btn dialog-btn-cancel" onClick={handleCancel}>
                                    {state.cancelText ?? 'Cancel'}
                                </button>
                            )}
                            <button
                                className={`dialog-btn ${state.type === 'danger' ? 'dialog-btn-danger' : 'dialog-btn-confirm'}`}
                                onClick={handleConfirm}
                                autoFocus
                            >
                                {state.confirmText ?? (isConfirm ? 'Confirm' : 'OK')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
