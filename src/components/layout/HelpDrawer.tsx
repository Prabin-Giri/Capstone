import React, { useState, useEffect } from 'react';
import { Send, Loader2, HelpCircle, ChevronLeft } from 'lucide-react';
import { getSupportAdmin, createConversation } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { showDialog } from '../ui/Dialog';
import './HelpDrawer.css';

interface HelpDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

const HelpDrawer: React.FC<HelpDrawerProps> = ({ isOpen, onClose }) => {
    const [admin, setAdmin] = useState<{ id: string, name: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    
    const user = getUser();

    useEffect(() => {
        if (isOpen) {
            getSupportAdmin()
                .then(setAdmin)
                .catch(err => {
                    console.error('Failed to load support admin', err);
                    showDialog({ title: 'Error', message: 'Could not connect to support at this time.', confirmText: 'OK' });
                    onClose();
                })
                .finally(() => setLoading(false));
        }
    }, [isOpen, onClose]);

    const handleSend = async () => {
        if (!user || !admin || !subject.trim() || !message.trim()) return;
        setSending(true);
        try {
            await createConversation({
                subject: `[SUPPORT] ${subject.trim()}`,
                createdBy: user.id,
                recipientIds: [admin.id],
                body: message.trim(),
            });
            await showDialog({ 
                title: 'Message Sent', 
                message: 'Your help request has been sent to support. You will receive a reply in your Inbox.', 
                confirmText: 'OK' 
            });
            setSubject('');
            setMessage('');
            onClose();
        } catch (err) {
            console.error('Failed to send support message', err);
            await showDialog({ title: 'Error', message: 'Failed to send message. Please try again later.', confirmText: 'OK' });
        } finally {
            setSending(false);
        }
    };

    // Only start drag when touch originates from the swipe handle area
    const handleSwipeAreaTouchStart = (e: React.TouchEvent) => {
        if (window.innerWidth <= 768) {
            setTouchStart(e.targetTouches[0].clientY);
            setDragOffset(0);
            setIsDragging(true);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        // Only move if drag was initiated from the handle
        if (touchStart === null || !isDragging || window.innerWidth > 768) return;
        const currentTouch = e.targetTouches[0].clientY;
        const diff = currentTouch - touchStart;
        if (diff > 0) {
            setDragOffset(diff);
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging) return;
        setIsDragging(false);
        if (dragOffset > 100) {
            onClose();
        } else {
            setDragOffset(0);
        }
        setTouchStart(null);
    };

    const drawerStyle = isOpen && window.innerWidth <= 768 && dragOffset > 0 ? {
        transform: `translateY(${dragOffset}px)`,
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    } : {};

    return (
        <>
            {isOpen && <div className="help-drawer-backdrop" onClick={onClose} />}
            
            <aside 
                className={`help-drawer ${isOpen ? 'open' : ''}`}
                style={drawerStyle}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className="help-drawer-content">
                    <div className="mobile-swipe-area" onTouchStart={handleSwipeAreaTouchStart} />
                    <div className="mobile-drag-handle" />
                    
                    <header className="help-drawer-header">
                        <div className="help-header-left">
                            <button className="help-back-btn" onClick={onClose}>
                                <ChevronLeft size={20} />
                            </button>
                            <h3>Help & Support</h3>
                        </div>
                    </header>

                    <div className="help-drawer-body">
                        <div className="help-hero">
                            <div className="help-icon-wrapper">
                                <HelpCircle size={40} />
                            </div>
                            <h2>How can we help?</h2>
                            <p>Send a message to our support team and someone will get back to you shortly.</p>
                        </div>

                        {loading ? (
                            <div className="help-loading">
                                <Loader2 className="animate-spin" size={32} />
                                <p>Connecting to support...</p>
                            </div>
                        ) : (
                            <div className="help-form">
                                <div className="help-field">
                                    <label>To</label>
                                    <div className="help-static-value">
                                        System Administrator ({admin?.name})
                                    </div>
                                </div>

                                <div className="help-field">
                                    <label>Subject</label>
                                    <input 
                                        value={subject} 
                                        onChange={e => setSubject(e.target.value)} 
                                        placeholder="Brief summary of your issue" 
                                        className="help-input"
                                    />
                                </div>

                                <div className="help-field">
                                    <label>Message</label>
                                    <textarea 
                                        className="help-textarea" 
                                        value={message} 
                                        onChange={e => setMessage(e.target.value)} 
                                        placeholder="Please describe your issue in detail..." 
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="help-drawer-footer">
                        <button 
                            className="help-send-btn" 
                            disabled={sending || loading || !subject.trim() || !message.trim()}
                            onClick={handleSend}
                        >
                            {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                            <span>{sending ? 'Sending...' : 'Send Message'}</span>
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default HelpDrawer;
