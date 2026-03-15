import React from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface AlertModalProps {
    title: string;
    message: string;
    type?: 'success' | 'error' | 'info';
    onClose: () => void;
}

const AlertModal: React.FC<AlertModalProps> = ({ title, message, type = 'info', onClose }) => {
    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {type === 'success' && <CheckCircle size={20} style={{ color: '#16a34a' }} />}
                        {type === 'error' && <AlertTriangle size={20} style={{ color: '#dc2626' }} />}
                        {type === 'info' && <Info size={20} style={{ color: '#2563eb' }} />}
                        {title}
                    </h3>
                    <button className="modal-close" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{message}</p>
                </div>
                <div className="modal-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: 'var(--primary-color)',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500
                        }}
                        onClick={onClose}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertModal;
