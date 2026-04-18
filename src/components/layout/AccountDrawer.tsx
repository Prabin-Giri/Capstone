import React, { useState } from 'react';
import { User, Mail, Shield, ChevronRight, LogOut, ChevronLeft, Settings, Lock, Camera, Check, X, ALargeSmall, Eye, EyeOff } from 'lucide-react';
import { getUser, logout, updateUser, type UserSession } from '../../lib/auth';
import { UPLOADS_BASE, changePassword } from '../../lib/api';
import Cropper, { type Area } from 'react-easy-crop';
import getCroppedImg from '../../lib/cropImage';
import UserAvatar from '../ui/UserAvatar';
import './AccountDrawer.css';
import { showDialog } from '../ui/Dialog';

interface AccountDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

type ViewType = 'main' | 'edit' | 'settings' | 'notifications' | 'security';
type PhotoStep = 'options' | 'camera' | 'crop';

const AccountDrawer: React.FC<AccountDrawerProps> = ({ isOpen, onClose }) => {
    const [userData, setUserData] = useState<UserSession | null>(getUser());
    const [currentView, setCurrentView] = useState<ViewType>('main');
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Editing States
    const [editingFields, setEditingFields] = useState<{ avatar: boolean }>({ avatar: false });
    const [pendingAvatar, setPendingAvatar] = useState<{ blob: Blob | null; url: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [fontSize, setFontSize] = useState<number>(() => parseInt(localStorage.getItem('app-font-size') || '100'));

    // Photo Overlay States
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [photoStep, setPhotoStep] = useState<PhotoStep>('options');
    const [image, setImage] = useState<string | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const videoRef = React.useRef<HTMLVideoElement>(null);

    // Keep local user data synced
    React.useEffect(() => {
        const handleUpdate = () => setUserData(getUser());
        window.addEventListener('user-profile-updated', handleUpdate);

        // Apply saved font size
        document.documentElement.style.fontSize = `${fontSize}%`;

        return () => {
            window.removeEventListener('user-profile-updated', handleUpdate);
        };
    }, []);

    React.useEffect(() => {
        if (isOpen) setUserData(getUser());
    }, [isOpen]);

    // Reset view when drawer closes
    React.useEffect(() => {
        if (!isOpen) {
            setTimeout(() => {
                setCurrentView('main');
                setDragOffset(0);
                setIsDragging(false);
                setEditingFields({ avatar: false });
                if (pendingAvatar) {
                    URL.revokeObjectURL(pendingAvatar.url);
                    setPendingAvatar(null);
                }
                closePhotoModal();
            }, 300);
        }
    }, [isOpen]);

    // Attach stream to video element when ready
    React.useEffect(() => {
        if (photoStep === 'camera' && stream && videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [photoStep, stream]);

    const closePhotoModal = () => {
        setIsPhotoModalOpen(false);
        setPhotoStep('options');
        setImage(null);
        stopCamera();
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1080 } }
            });
            setStream(mediaStream);
            setPhotoStep('camera');
        } catch (err) {
            console.error("Camera error:", err);
            await showDialog({ title: 'Camera Error', message: 'Could not access camera. Please check permissions.', confirmText: 'OK' });
        }
    };

    const capturePhoto = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Mirror the capture to match the video feed
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(videoRef.current, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg');
                setImage(dataUrl);
                stopCamera();
                setPhotoStep('crop');
            }
        }
    };

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const imageDataUrl = URL.createObjectURL(file);
            setImage(imageDataUrl);
            setPhotoStep('crop');
        }
    };

    const onCropComplete = (_: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };    const handleRemovePhoto = () => {
        if (pendingAvatar) URL.revokeObjectURL(pendingAvatar.url);
        setPendingAvatar({ blob: null, url: '' });
        setEditingFields(prev => ({ ...prev, avatar: true }));
        closePhotoModal();
    };


    const FONT_SIZE_OPTIONS = [
        { label: 'XS', value: 80 },
        { label: 'S',  value: 90 },
        { label: 'M',  value: 100 },
        { label: 'L',  value: 115 },
        { label: 'XL', value: 130 },
    ];

    const handleFontSizeChange = (value: number) => {
        setFontSize(value);
        localStorage.setItem('app-font-size', String(value));
        document.documentElement.style.fontSize = `${value}%`;
        window.dispatchEvent(new CustomEvent('font-size-change', { detail: value }));
    };

    const handleSaveInfo = async () => {
        if (!userData || !editingFields.avatar) return;
        setIsSaving(true);
        try {
            const updates: Partial<UserSession> = {};

            // 1. Handle avatar changes (Upload or Remove)
            if (editingFields.avatar && pendingAvatar) {
                if (pendingAvatar.blob) {
                    // UPLOAD
                    const formData = new FormData();
                    formData.append('file', pendingAvatar.blob, 'profile.jpg');

                    const uploadResponse = await fetch(`${UPLOADS_BASE}/api/uploads/profile-picture/${encodeURIComponent(userData.id)}`, {
                        method: 'POST',
                        body: formData
                    });

                    if (!uploadResponse.ok) throw new Error('Avatar upload failed');
                    const uploadResult = await uploadResponse.json();
                    updates.profilePicture = uploadResult.filePath;
                } else {
                    // REMOVE
                    const deleteResponse = await fetch(`${UPLOADS_BASE}/api/uploads/profile-picture/${encodeURIComponent(userData.id)}`, {
                        method: 'DELETE'
                    });

                    if (!deleteResponse.ok) throw new Error('Failed to remove avatar');
                    updates.profilePicture = undefined; // Clears it from UserSession
                }

                // Cleanup local blob URL
                if (pendingAvatar.url) {
                    URL.revokeObjectURL(pendingAvatar.url);
                }
                setPendingAvatar(null);
            }

            // Name and Email editing removed per requirement

            updateUser(updates);
            setEditingFields({ avatar: false });
        } catch (err: any) {
            await showDialog({ title: 'Error', message: err.message, confirmText: 'OK' });
        } finally {
            setIsSaving(false);
        }
    };

    const showCroppedImage = async () => {
        try {
            if (image && croppedAreaPixels && userData) {
                const croppedBlob = await getCroppedImg(image, croppedAreaPixels);
                if (!croppedBlob) throw new Error('Could not crop image');

                // Clear previous pending if any
                if (pendingAvatar) URL.revokeObjectURL(pendingAvatar.url);

                const localUrl = URL.createObjectURL(croppedBlob);
                setPendingAvatar({ blob: croppedBlob, url: localUrl });
                setEditingFields(prev => ({ ...prev, avatar: true }));
                closePhotoModal();
            }
        } catch (e: any) {
            console.error(e);
            await showDialog({ title: 'Error', message: 'Failed to create preview: ' + e.message, confirmText: 'OK' });
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (isPhotoModalOpen) return; // Disable drawer drag while modal is open
        if (window.innerWidth <= 768) {
            setTouchStart(e.targetTouches[0].clientY);
            setIsDragging(true);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStart === null || window.innerWidth > 768 || isPhotoModalOpen) return;

        const currentTouch = e.targetTouches[0].clientY;
        const diff = currentTouch - touchStart;

        if (diff > 0) {
            setDragOffset(diff);
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        if (dragOffset > 100) {
            onClose();
        } else {
            setDragOffset(0);
        }
        setTouchStart(null);
    };

    const renderMainView = () => (
        <div className="account-drawer-content">
            <div className="mobile-swipe-area" onTouchStart={handleTouchStart} />
            <div className="mobile-drag-handle" />
            <div className="profile-hero">
                <UserAvatar 
                    user={pendingAvatar ? { name: userData?.name, profilePicture: pendingAvatar.url } : (userData || { name: 'U' })} 
                    size={100} 
                    className="profile-avatar-large"
                />
                <div className="profile-info-hero">
                    <h2>{userData?.name}</h2>
                    <p>{userData?.email}</p>
                    <span className="role-badge-large">{userData?.role?.toUpperCase()}</span>
                </div>
            </div>

            <nav className="drawer-nav">
                <button className="drawer-nav-btn" onClick={() => setCurrentView('edit')}>
                    <div className="nav-btn-left">
                        <User size={18} />
                        <span>Profile</span>
                    </div>
                    <ChevronRight size={16} />
                </button>
                <button className="drawer-nav-btn" onClick={() => setCurrentView('settings')}>
                    <div className="nav-btn-left">
                        <Settings size={18} />
                        <span>Settings</span>
                    </div>
                    <ChevronRight size={16} />
                </button>
                <div className="drawer-divider-small" />
                <button className="drawer-nav-btn" onClick={() => setCurrentView('security')}>
                    <div className="nav-btn-left">
                        <Lock size={18} />
                        <span>Security</span>
                    </div>
                    <ChevronRight size={16} />
                </button>
            </nav>
        </div>
    );

    const renderEditProfile = () => (
        <div className="account-drawer-content">
            <div className="mobile-swipe-area" onTouchStart={handleTouchStart} />
            <div className="mobile-drag-handle" />
            <header className="subview-header">
                <div className="subview-header-left">
                    <button className="back-btn" onClick={() => setCurrentView('main')}>
                        <ChevronLeft size={20} />
                    </button>
                    <h3>Profile</h3>
                </div>
            </header>

            <div className="drawer-section edit-profile-section">
                <div className="edit-avatar-container">
                    <UserAvatar 
                        user={pendingAvatar ? { name: userData?.name, profilePicture: pendingAvatar.url } : (userData || { name: 'U' })} 
                        size={120} 
                        className="profile-avatar-large"
                    />
                    <button
                        className="edit-avatar-btn"
                        onClick={() => setIsPhotoModalOpen(true)}
                        title="Update Profile Picture"
                    >
                        <Camera size={18} />
                    </button>
                </div>

                <div className="info-grid">
                    <div className="info-item no-edit">
                        <div className="info-icon">
                            <User size={18} />
                        </div>
                        <div className="info-content">
                            <label>Full Name</label>
                            <span>{userData?.name}</span>
                        </div>
                    </div>

                    <div className="info-item no-edit">
                        <div className="info-icon">
                            <Mail size={18} />
                        </div>
                        <div className="info-content">
                            <label>Email Address</label>
                            <span>{userData?.email}</span>
                        </div>
                    </div>

                    <div className="info-item no-edit">
                        <div className="info-icon">
                            <Shield size={18} />
                        </div>
                        <div className="info-content">
                            <label>Account Role</label>
                            <span style={{ textTransform: 'capitalize' }}>{userData?.role}</span>
                        </div>
                    </div>
                </div>

                <div className="edit-actions" style={{ width: '100%', marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
                    <button
                        className={`save-btn ${!editingFields.avatar ? 'disabled' : ''}`}
                        onClick={handleSaveInfo}
                        disabled={isSaving || !editingFields.avatar}
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderSettingsView = () => (
        <div className="account-drawer-content">
            <div className="mobile-swipe-area" onTouchStart={handleTouchStart} />
            <div className="mobile-drag-handle" />
            <header className="subview-header">
                <div className="subview-header-left">
                    <button className="back-btn" onClick={() => setCurrentView('main')}>
                        <ChevronLeft size={20} />
                    </button>
                    <h3>Settings</h3>
                </div>
            </header>
            <div className="drawer-section">
                <div className="settings-list">
                    <div className="settings-item">
                        <div className="settings-icon">
                            <ALargeSmall size={18} />
                        </div>
                        <div className="settings-item-body">
                            <div className="settings-label">
                                <h4>Font Size</h4>
                                <p>Adjust the text size globally</p>
                            </div>
                            <div className="font-size-segmented">
                                {FONT_SIZE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.label}
                                        className={`font-size-seg-btn ${fontSize === opt.value ? 'active' : ''}`}
                                        onClick={() => handleFontSizeChange(opt.value)}
                                        aria-label={`Font size ${opt.label}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderPhotoOverlay = () => {
        if (!isPhotoModalOpen) return null;

        return (
            <div className="photo-overlay-backdrop">
                <div className="photo-modal">
                    <header className="photo-modal-header">
                        <button className="modal-close-btn" onClick={closePhotoModal}>
                            <X size={20} />
                        </button>
                        <h3>Update Photo</h3>
                        {photoStep === 'crop' && (
                            <button className="modal-apply-btn" onClick={showCroppedImage}>
                                <Check size={20} />
                            </button>
                        )}
                    </header>

                    <div className="photo-modal-body">
                        {photoStep === 'options' && (
                            <div className="photo-options">
                                <button className="photo-opt-btn" onClick={startCamera}>
                                    <div className="opt-icon"><Camera size={24} /></div>
                                    <div className="opt-label">
                                        <h4>Take a picture</h4>
                                        <p>Use your device camera</p>
                                    </div>
                                </button>
                                <button className="photo-opt-btn" onClick={() => fileInputRef.current?.click()}>
                                    <div className="opt-icon"><Mail size={24} /></div>
                                    <div className="opt-label">
                                        <h4>Upload an image</h4>
                                        <p>Choose from your gallery</p>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={onFileChange}
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                    />
                                </button>
                                {(userData?.profilePicture || (pendingAvatar && pendingAvatar.blob === null)) && (
                                    <button 
                                        className="photo-opt-btn danger-opt" 
                                        onClick={handleRemovePhoto}
                                    >
                                        <div className="opt-icon danger"><X size={24} /></div>
                                        <div className="opt-label">
                                            <h4>Remove current photo</h4>
                                            <p>Revert to default initials</p>
                                        </div>
                                    </button>
                                )}
                            </div>
                        )}

                        {photoStep === 'camera' && (
                            <div className="camera-view-container">
                                <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
                                <button className="capture-btn" onClick={capturePhoto}>
                                    <div className="capture-inner" />
                                </button>
                            </div>
                        )}

                        {photoStep === 'crop' && image && (
                            <div className="modal-cropper-container">
                                <div className="cropper-box">
                                    <Cropper
                                        image={image}
                                        crop={crop}
                                        zoom={zoom}
                                        aspect={1}
                                        onCropChange={setCrop}
                                        onCropComplete={onCropComplete}
                                        onZoomChange={setZoom}
                                        cropShape="round"
                                        showGrid={false}
                                    />
                                </div>
                                <div className="modal-crop-controls">
                                    <input
                                        type="range"
                                        value={zoom}
                                        min={1}
                                        max={3}
                                        step={0.1}
                                        onChange={(e) => setZoom(Number(e.target.value))}
                                        className="zoom-range"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwError, setPwError] = useState('');
    const [pwSuccess, setPwSuccess] = useState('');
    const [pwSaving, setPwSaving] = useState(false);
    const [showPasswords, setShowPasswords] = useState(false);

    const validatePassword = (pw: string): string | null => {
        if (pw.length < 8) return 'Password must be at least 8 characters';
        if (!/[a-zA-Z]/.test(pw)) return 'Password must contain at least one letter';
        if (!/[0-9]/.test(pw)) return 'Password must contain at least one number';
        if (!/[^a-zA-Z0-9]/.test(pw)) return 'Password must contain at least one special character';
        return null;
    };

    const handleChangePassword = async () => {
        setPwError('');
        setPwSuccess('');
        if (!currentPw || !newPw || !confirmPw) { setPwError('All fields are required'); return; }
        const validationErr = validatePassword(newPw);
        if (validationErr) { setPwError(validationErr); return; }
        if (newPw !== confirmPw) { setPwError('New password and confirm password do not match'); return; }
        if (!userData?.id) return;
        setPwSaving(true);
        try {
            await changePassword(userData.id, currentPw, newPw);
            setPwSuccess('Password changed successfully');
            setCurrentPw(''); setNewPw(''); setConfirmPw('');
            setShowPasswords(false);
        } catch (e: any) {
            setPwError(e.message || 'Failed to change password');
        } finally {
            setPwSaving(false);
        }
    };

    const renderSecurityView = () => (
        <div className="account-drawer-content">
            <div className="mobile-swipe-area" onTouchStart={handleTouchStart} />
            <div className="mobile-drag-handle" />
            <header className="subview-header">
                <div className="subview-header-left">
                    <button className="back-btn" onClick={() => { setCurrentView('main'); setPwError(''); setPwSuccess(''); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}>
                        <ChevronLeft size={20} />
                    </button>
                    <h3>Security</h3>
                </div>
            </header>

            <div className="drawer-section" style={{ padding: '1.25rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>Change Password</h4>

                {pwError && <div style={{ color: 'var(--danger-color)', fontSize: '0.82rem', marginBottom: '0.5rem', fontWeight: 500 }}>{pwError}</div>}
                {pwSuccess && <div style={{ color: 'var(--success-color)', fontSize: '0.82rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--success-bg)', borderRadius: '8px' }}>{pwSuccess}</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Current Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPasswords ? 'text' : 'password'}
                                value={currentPw}
                                onChange={e => setCurrentPw(e.target.value)}
                                placeholder="Enter current password"
                                style={{ width: '100%', padding: '0.5rem 2.5rem 0.5rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-body)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                            />
                            <button type="button" onClick={() => setShowPasswords(!showPasswords)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                                {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>New Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPasswords ? 'text' : 'password'}
                                value={newPw}
                                onChange={e => setNewPw(e.target.value)}
                                placeholder="Letters, numbers & special characters"
                                style={{ width: '100%', padding: '0.5rem 2.5rem 0.5rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-body)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                            />
                            <button type="button" onClick={() => setShowPasswords(!showPasswords)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                                {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {newPw && (() => {
                            const checks = [
                                { label: '8+ characters', pass: newPw.length >= 8 },
                                { label: 'A letter', pass: /[a-zA-Z]/.test(newPw) },
                                { label: 'A number', pass: /[0-9]/.test(newPw) },
                                { label: 'A special character', pass: /[^a-zA-Z0-9]/.test(newPw) },
                            ];
                            return (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: '4px' }}>
                                    {checks.map(c => (
                                        <span key={c.label} style={{ fontSize: '0.7rem', color: c.pass ? 'var(--success-color)' : 'var(--text-tertiary)' }}>
                                            {c.pass ? '\u2713' : '\u2022'} {c.label}
                                        </span>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Confirm New Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPasswords ? 'text' : 'password'}
                                value={confirmPw}
                                onChange={e => setConfirmPw(e.target.value)}
                                placeholder="Re-enter new password"
                                style={{ width: '100%', padding: '0.5rem 2.5rem 0.5rem 0.75rem', border: `1px solid ${confirmPw && confirmPw !== newPw ? 'var(--danger-color)' : 'var(--border-color)'}`, borderRadius: '8px', background: 'var(--bg-body)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                                onKeyDown={e => { if (e.key === 'Enter') handleChangePassword(); }}
                            />
                            <button type="button" onClick={() => setShowPasswords(!showPasswords)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                                {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {confirmPw && confirmPw !== newPw && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--danger-color)' }}>Passwords do not match</span>
                        )}
                    </div>
                    <button
                        className="btn btn-primary"
                        style={{ marginTop: '0.5rem', width: '100%' }}
                        onClick={handleChangePassword}
                        disabled={pwSaving}
                    >
                        {pwSaving ? 'Saving...' : 'Update Password'}
                    </button>
                </div>
            </div>
        </div>
    );

    const drawerStyle = isOpen && window.innerWidth <= 768 ? {
        transform: `translateY(${dragOffset}px)`,
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    } : {};

    const renderContent = () => {
        switch (currentView) {
            case 'edit': return renderEditProfile();
            case 'settings': return renderSettingsView();
            case 'security': return renderSecurityView();
            default: return renderMainView();
        }
    };

    return (
        <>
            {isOpen && <div className="account-drawer-backdrop" onClick={onClose} />}

            <aside
                className={`account-drawer ${isOpen ? 'open' : ''}`}
                style={drawerStyle}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {renderContent()}

                <div className="account-drawer-footer">
                    <button
                        className="drawer-logout-btn"
                        onClick={() => {
                            onClose();
                            logout();
                        }}
                    >
                        <LogOut size={18} />
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            {renderPhotoOverlay()}
        </>
    );
};

export default AccountDrawer;
