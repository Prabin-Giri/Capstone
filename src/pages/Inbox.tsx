import React, { useEffect, useState, useRef } from 'react';
import { Mail, Send, Star, Archive, Trash2, ArrowLeft, X, Pencil, Search } from 'lucide-react';
import { getUser } from '../lib/auth';
import {
    getCourses,
    getContacts,
    getConversations,
    createConversation,
    getConversationMessages,
    replyToConversation,
    toggleStar,
    toggleArchive,
    deleteConversation,
} from '../lib/api';
import type { Course, Conversation, ConversationMessage, MessageContact } from '../lib/api';
import './Inbox.css';

type InboxFilter = 'inbox' | 'unread' | 'starred' | 'sent' | 'archived';

const FILTERS: { value: InboxFilter; label: string }[] = [
    { value: 'inbox', label: 'Inbox' },
    { value: 'unread', label: 'Unread' },
    { value: 'starred', label: 'Starred' },
    { value: 'sent', label: 'Sent' },
    { value: 'archived', label: 'Archived' },
];

const Inbox: React.FC = () => {
    const user = getUser();
    const userId = user?.id || '';

    const [filter, setFilter] = useState<InboxFilter>('inbox');
    const [courseFilter, setCourseFilter] = useState('');
    const [search, setSearch] = useState('');
    const [courses, setCourses] = useState<Course[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConv, setActiveConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);
    const [showCompose, setShowCompose] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load courses
    useEffect(() => {
        if (!userId) return;
        (async () => {
            try {
                const role = user?.role;
                const c = role === 'faculty'
                    ? await getCourses({ instructorId: userId })
                    : await getCourses({ studentId: userId, taId: userId });
                setCourses(c);
            } catch { /* empty */ }
        })();
    }, [userId]);

    // Load conversations
    useEffect(() => {
        if (!userId) return;
        loadConversations();
    }, [userId, filter]);

    async function loadConversations() {
        setLoading(true);
        try {
            const data = await getConversations(userId, filter === 'inbox' ? undefined : filter);
            setConversations(data);
        } catch (e) {
            console.error('Failed to load conversations', e);
        } finally {
            setLoading(false);
        }
    }

    // Load messages when conversation selected
    useEffect(() => {
        if (!activeConv) return;
        (async () => {
            try {
                const msgs = await getConversationMessages(activeConv.id, userId);
                setMessages(msgs);
                // Update unread in list + notify topbar badge instantly
                setConversations(prev =>
                    prev.map(c => c.id === activeConv.id ? { ...c, unread_count: 0, last_read_at: new Date().toISOString() } : c)
                );
                window.dispatchEvent(new Event('inbox-read'));
            } catch (e) {
                console.error('Failed to load messages', e);
            }
        })();
    }, [activeConv?.id]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    function selectConversation(conv: Conversation) {
        setActiveConv(conv);
        setDetailOpen(true);
    }

    async function handleReply() {
        if (!activeConv || !replyText.trim() || sending) return;
        setSending(true);
        try {
            await replyToConversation(activeConv.id, userId, replyText.trim());
            setReplyText('');
            const msgs = await getConversationMessages(activeConv.id, userId);
            setMessages(msgs);
            loadConversations();
        } catch (e) {
            console.error('Reply failed', e);
        } finally {
            setSending(false);
        }
    }

    async function handleStar(conv: Conversation, e: React.MouseEvent) {
        e.stopPropagation();
        const newVal = !conv.is_starred;
        try {
            await toggleStar(conv.id, userId, newVal);
            setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, is_starred: newVal ? 1 : 0 } : c));
            if (activeConv?.id === conv.id) setActiveConv({ ...activeConv, is_starred: newVal ? 1 : 0 });
        } catch { /* empty */ }
    }

    async function handleArchive() {
        if (!activeConv) return;
        try {
            await toggleArchive(activeConv.id, userId, !activeConv.is_archived);
            setActiveConv(null);
            setDetailOpen(false);
            loadConversations();
        } catch { /* empty */ }
    }

    async function handleDelete() {
        if (!activeConv) return;
        try {
            await deleteConversation(activeConv.id, userId);
            setActiveConv(null);
            setDetailOpen(false);
            loadConversations();
        } catch { /* empty */ }
    }

    function formatTime(dateStr: string) {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function getOtherParticipants(conv: Conversation) {
        return conv.participants.filter(p => p.id !== userId);
    }

    function getInitial(name: string) {
        return name?.charAt(0)?.toUpperCase() || '?';
    }

    // Filter by course and search
    const filtered = conversations.filter(c => {
        if (courseFilter && c.course_id !== courseFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            const matches = c.subject.toLowerCase().includes(q)
                || c.participants.some(p => p.name.toLowerCase().includes(q))
                || c.course_name?.toLowerCase().includes(q);
            if (!matches) return false;
        }
        return true;
    });

    return (
        <div className="inbox-page">
            {/* Toolbar */}
            <div className="inbox-toolbar">
                <select className="inbox-filter-select" value={filter} onChange={e => { setFilter(e.target.value as InboxFilter); setActiveConv(null); setDetailOpen(false); }}>
                    {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select className="inbox-course-select" value={courseFilter} onChange={e => setCourseFilter(e.target.value)}>
                    <option value="">All Courses</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-tertiary)' }} />
                    <input
                        className="inbox-search-input"
                        style={{ paddingLeft: '30px' }}
                        placeholder="Search..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <button className="inbox-compose-btn" onClick={() => setShowCompose(true)}>
                    <Pencil size={14} /> Compose
                </button>
            </div>

            {/* Body */}
            <div className={`inbox-body ${detailOpen ? 'detail-open' : ''}`}>
                {/* Conversation List */}
                <div className="inbox-list">
                    {loading ? (
                        <div className="inbox-list-empty"><span>Loading...</span></div>
                    ) : filtered.length === 0 ? (
                        <div className="inbox-list-empty">
                            <Mail size={40} />
                            <span>No conversations</span>
                        </div>
                    ) : (
                        filtered.map(conv => {
                            const others = getOtherParticipants(conv);
                            const displayUser = others[0];
                            const isUnread = conv.unread_count > 0;
                            return (
                                <div
                                    key={conv.id}
                                    className={`inbox-conv-item ${activeConv?.id === conv.id ? 'active' : ''} ${isUnread ? 'unread' : ''}`}
                                    onClick={() => selectConversation(conv)}
                                >
                                    <div className="inbox-conv-avatar">
                                        {displayUser?.profile_picture
                                            ? <img src={displayUser.profile_picture.startsWith('http') ? displayUser.profile_picture : `${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001'}/uploads/${displayUser.profile_picture}`} alt="" />
                                            : getInitial(displayUser?.name || conv.created_by_name || '?')}
                                    </div>
                                    <div className="inbox-conv-body">
                                        <div className="inbox-conv-header">
                                            <span className="inbox-conv-participants">
                                                {others.length > 0 ? others.map(p => p.name).join(', ') : 'You'}
                                            </span>
                                            <span className="inbox-conv-time">{formatTime(conv.updated_at)}</span>
                                        </div>
                                        <div className="inbox-conv-subject">{conv.subject}</div>
                                        {conv.last_message && (
                                            <div className="inbox-conv-preview">
                                                {conv.last_message.sender_name}: {conv.last_message.body}
                                            </div>
                                        )}
                                        <div className="inbox-conv-meta">
                                            {conv.course_name && <span className="inbox-conv-course-badge">{conv.course_name}</span>}
                                            <span className={`inbox-conv-star ${conv.is_starred ? 'starred' : ''}`} onClick={e => handleStar(conv, e)}>
                                                <Star size={13} fill={conv.is_starred ? 'currentColor' : 'none'} />
                                            </span>
                                            {isUnread && <span className="inbox-unread-dot" />}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Detail / Thread */}
                <div className="inbox-detail">
                    {!activeConv ? (
                        <div className="inbox-detail-empty">
                            <Mail size={48} />
                            <span>Select a conversation to read</span>
                        </div>
                    ) : (
                        <>
                            <div className="inbox-detail-header">
                                <div>
                                    <button className="inbox-action-btn inbox-detail-back" onClick={() => { setDetailOpen(false); setActiveConv(null); }}>
                                        <ArrowLeft size={18} />
                                    </button>
                                    <div className="inbox-detail-subject">{activeConv.subject}</div>
                                    <div className="inbox-detail-course">
                                        {activeConv.course_name} &middot; {getOtherParticipants(activeConv).map(p => p.name).join(', ')}
                                    </div>
                                </div>
                                <div className="inbox-detail-actions">
                                    <button className={`inbox-action-btn ${activeConv.is_starred ? 'starred' : ''}`} title="Star" onClick={e => handleStar(activeConv, e)}>
                                        <Star size={16} fill={activeConv.is_starred ? 'currentColor' : 'none'} />
                                    </button>
                                    <button className="inbox-action-btn" title="Archive" onClick={handleArchive}>
                                        <Archive size={16} />
                                    </button>
                                    <button className="inbox-action-btn" title="Delete" onClick={handleDelete}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="inbox-messages">
                                {messages.map(msg => (
                                    <div key={msg.id} className={`inbox-msg ${msg.sender_id === userId ? 'own' : ''}`}>
                                        <div className="inbox-msg-avatar">
                                            {msg.sender_picture
                                                ? <img src={msg.sender_picture.startsWith('http') ? msg.sender_picture : `${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001'}/uploads/${msg.sender_picture}`} alt="" />
                                                : getInitial(msg.sender_name)}
                                        </div>
                                        <div className="inbox-msg-content">
                                            <div className="inbox-msg-sender">{msg.sender_name}</div>
                                            <div className="inbox-msg-body">{msg.body}</div>
                                            <div className="inbox-msg-time">{new Date(msg.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="inbox-reply">
                                <textarea
                                    className="inbox-reply-input"
                                    placeholder="Type a reply..."
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                                    rows={1}
                                />
                                <button className="inbox-reply-btn" disabled={!replyText.trim() || sending} onClick={handleReply}>
                                    <Send size={16} />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Compose Modal */}
            {showCompose && (
                <ComposeModal
                    userId={userId}
                    courses={courses}
                    onClose={() => setShowCompose(false)}
                    onSent={() => { setShowCompose(false); loadConversations(); }}
                />
            )}
        </div>
    );
};

/* ============ Compose Modal ============ */

interface ComposeModalProps {
    userId: string;
    courses: Course[];
    onClose: () => void;
    onSent: () => void;
}

const ComposeModal: React.FC<ComposeModalProps> = ({ userId, courses, onClose, onSent }) => {
    const [courseId, setCourseId] = useState(courses[0]?.id || '');
    const [contacts, setContacts] = useState<MessageContact[]>([]);
    const [recipients, setRecipients] = useState<MessageContact[]>([]);
    const [recipientSearch, setRecipientSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!courseId) return;
        (async () => {
            try {
                const c = await getContacts(userId, courseId);
                setContacts(c);
            } catch { /* empty */ }
        })();
    }, [courseId]);

    const filteredContacts = contacts.filter(c => {
        if (recipients.find(r => r.id === c.id)) return false;
        if (recipientSearch) {
            const q = recipientSearch.toLowerCase();
            return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
        }
        return true;
    });

    function addRecipient(contact: MessageContact) {
        setRecipients(prev => [...prev, contact]);
        setRecipientSearch('');
        setShowDropdown(false);
        inputRef.current?.focus();
    }

    function removeRecipient(id: string) {
        setRecipients(prev => prev.filter(r => r.id !== id));
    }

    function selectAll() {
        const remaining = contacts.filter(c => !recipients.find(r => r.id === c.id));
        setRecipients(prev => [...prev, ...remaining]);
        setShowDropdown(false);
    }

    async function handleSend() {
        if (!courseId || recipients.length === 0 || !subject.trim() || !body.trim()) return;
        setSending(true);
        try {
            await createConversation({
                courseId,
                subject: subject.trim(),
                createdBy: userId,
                recipientIds: recipients.map(r => r.id),
                body: body.trim(),
            });
            onSent();
        } catch (e) {
            console.error('Send failed', e);
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="inbox-compose-overlay" onClick={onClose}>
            <div className="inbox-compose-modal" onClick={e => e.stopPropagation()}>
                <div className="inbox-compose-header">
                    <h2>Compose Message</h2>
                    <button className="inbox-compose-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="inbox-compose-body">
                    <div className="inbox-compose-field">
                        <label>Course</label>
                        <select value={courseId} onChange={e => { setCourseId(e.target.value); setRecipients([]); }}>
                            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    <div className="inbox-compose-field" style={{ position: 'relative' }}>
                        <label>To</label>
                        <div className="inbox-recipient-area" onClick={() => inputRef.current?.focus()}>
                            {recipients.map(r => (
                                <span key={r.id} className="inbox-recipient-chip">
                                    {r.name}
                                    <button onClick={() => removeRecipient(r.id)}>&times;</button>
                                </span>
                            ))}
                            <input
                                ref={inputRef}
                                className="inbox-recipient-input"
                                placeholder={recipients.length === 0 ? 'Search recipients...' : ''}
                                value={recipientSearch}
                                onChange={e => { setRecipientSearch(e.target.value); setShowDropdown(true); }}
                                onFocus={() => setShowDropdown(true)}
                                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                            />
                        </div>
                        {showDropdown && (
                            <div className="inbox-recipient-dropdown">
                                {contacts.length > 0 && !recipients.length && (
                                    <button className="inbox-select-all-btn" onMouseDown={e => { e.preventDefault(); selectAll(); }}>
                                        Select all ({contacts.length})
                                    </button>
                                )}
                                {filteredContacts.length === 0 ? (
                                    <div style={{ padding: '10px 12px', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No contacts found</div>
                                ) : (
                                    filteredContacts.slice(0, 20).map(c => (
                                        <div key={c.id} className="inbox-recipient-option" onMouseDown={e => { e.preventDefault(); addRecipient(c); }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
                                                <span style={{ fontWeight: 600 }}>{c.name}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>
                                            </div>
                                            <span className="role-badge">{c.role}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    <div className="inbox-compose-field">
                        <label>Subject</label>
                        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Message subject" />
                    </div>

                    <div className="inbox-compose-field">
                        <label>Message</label>
                        <textarea className="inbox-compose-textarea" value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message..." />
                    </div>
                </div>

                <div className="inbox-compose-footer">
                    <button className="btn btn-outline" onClick={onClose}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        disabled={!courseId || recipients.length === 0 || !subject.trim() || !body.trim() || sending}
                        onClick={handleSend}
                    >
                        {sending ? 'Sending...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Inbox;
