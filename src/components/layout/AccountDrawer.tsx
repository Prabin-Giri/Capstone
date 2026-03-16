import React, { useState } from 'react';
import { User, Mail, Shield, ChevronRight, LogOut, ChevronLeft, Settings, Bell, Lock, Camera, Check, X, Moon, Sun } from 'lucide-react';
import { getUser, logout, updateUser, type UserSession } from '../../lib/auth';
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
type ThemeType = 'system' | 'light' | 'dark';
type PhotoStep = 'options' | 'camera' | 'crop';

const AccountDrawer: React.FC<AccountDrawerProps> = ({ isOpen, onClose }) => {
    const [userData, setUserData] = useState<UserSession | null>(getUser());
    const [currentView, setCurrentView] = useState<ViewType>('main');
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Editing States
    const [editingFields, setEditingFields] = useState<{ avatar: boolean }>({ avatar: false });
    const [pendingAvatar, setPendingAvatar] = useState<{ blob: Blob; url: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [theme, setTheme] = useState<ThemeType>(() => (localStorage.getItem('app-theme') as ThemeType) || 'system');
    const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);

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

        // Apply theme
        const applyTheme = (currentTheme: ThemeType) => {
            const isDark = currentTheme === 'dark' || (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            if (isDark) {
                document.body.classList.add('dark-theme');
            } else {
                document.body.classList.remove('dark-theme');
            }
        };

        applyTheme(theme);

        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (theme === 'system') applyTheme('system');
        };
        mediaQuery.addEventListener('change', handleChange);

        return () => {
            window.removeEventListener('user-profile-updated', handleUpdate);
            mediaQuery.removeEventListener('change', handleChange);
        };
    }, [theme]);

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
    };


    const handleThemeChange = (newTheme: ThemeType) => {
        setTheme(newTheme);
        localStorage.setItem('app-theme', newTheme);
        // Dispatch a custom event so same-tab components (e.g. Monaco editor) react immediately
        window.dispatchEvent(new CustomEvent('theme-change', { detail: newTheme }));
    };

    const handleSaveInfo = async () => {
        if (!userData || !editingFields.avatar) return;
        setIsSaving(true);
        try {
            const updates: Partial<UserSession> = {};

            // 1. Upload new avatar if pending
            if (editingFields.avatar && pendingAvatar) {
                const formData = new FormData();
                formData.append('file', pendingAvatar.blob, 'profile.jpg');

                const uploadResponse = await fetch(`http://localhost:3001/api/uploads/profile-picture/${userData.id}`, {
                    method: 'POST',
                    body: formData
                });

                if (!uploadResponse.ok) throw new Error('Avatar upload failed');
                const uploadResult = await uploadResponse.json();
                updates.profilePicture = uploadResult.filePath;

                // Cleanup local blob URL
                URL.revokeObjectURL(pendingAvatar.url);
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
                <button className="drawer-nav-btn disabled" title="Coming Soon">
                    <div className="nav-btn-left">
                        <Bell size={18} />
                        <span>Notifications</span>
                    </div>
                    <ChevronRight size={16} />
                </button>
                <button className="drawer-nav-btn disabled" title="Coming Soon">
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
                        <div className="settings-item-left">
                            <div className="settings-icon">
                                {theme === 'dark' ? <Moon size={18} /> : (theme === 'light' ? <Sun size={18} /> : <Settings size={18} />)}
                            </div>
                            <div className="settings-label">
                                <h4>Appearance</h4>
                                <p>Choose your preferred theme</p>
                            </div>
                        </div>
                        <div className="theme-dropdown-wrapper">
                            <button
                                className="theme-select-btn"
                                onClick={() => setIsThemeDropdownOpen(prev => !prev)}
                            >
                                <span>
                                    {theme === 'system' ? 'System Default' : theme === 'light' ? 'Light' : 'Dark'}
                                </span>
                                <ChevronRight size={14} style={{ transform: isThemeDropdownOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                            </button>
                            {isThemeDropdownOpen && (
                                <div className="theme-dropdown-menu">
                                    {(['system', 'light', 'dark'] as ThemeType[]).map(opt => (
                                        <button
                                            key={opt}
                                            className={`theme-dropdown-item ${theme === opt ? 'active' : ''}`}
                                            onClick={() => {
                                                handleThemeChange(opt);
                                                setIsThemeDropdownOpen(false);
                                            }}
                                        >
                                            {opt === 'system' ? 'System Default' : opt === 'light' ? 'Light' : 'Dark'}
                                        </button>
                                    ))}
                                </div>
                            )}
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

    const drawerStyle = isOpen && window.innerWidth <= 768 ? {
        transform: `translateY(${dragOffset}px)`,
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    } : {};

    const renderContent = () => {
        switch (currentView) {
            case 'edit': return renderEditProfile();
            case 'settings': return renderSettingsView();
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
