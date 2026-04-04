import React from 'react';
import { getFileUrl } from '../../lib/api';
import './UserAvatar.css';

interface UserAvatarProps {
    user?: {
        name?: string | null;
        profile_picture?: string | null;
        profilePicture?: string | null;
    };
    size?: 'sm' | 'md' | 'lg' | 'xl' | number;
    className?: string;
    style?: React.CSSProperties;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ user, size = 40, className = '', style }) => {
    const [imgError, setImgError] = React.useState(false);

    // Resolve numeric size
    const sizeMap: Record<string, number> = {
        sm: 32,
        md: 40,
        lg: 48,
        xl: 64
    };
    const numericSize = typeof size === 'number' ? size : sizeMap[size] || 40;
    
    // Safety check for user
    if (!user) {
        return (
            <div className={`user-avatar initial-avatar ${className}`} style={{ ...style, width: `${numericSize}px`, height: `${numericSize}px`, fontSize: `${numericSize * 0.4}px` }}>
                ?
            </div>
        );
    }

    const profilePic = user.profilePicture || user.profile_picture;
    const initial = user.name ? user.name.charAt(0).toUpperCase() : '?';
    
    const avatarStyle = {
        width: `${numericSize}px`,
        height: `${numericSize}px`,
        fontSize: `${numericSize * 0.4}px`,
        ...style
    };

    if (profilePic && !imgError) {
        const isDataOrBlob = profilePic.startsWith('data:') || profilePic.startsWith('blob:');
        const imageUrl = (profilePic.startsWith('http') || isDataOrBlob)
            ? profilePic 
            : getFileUrl(profilePic);
            
        return (
            <div className={`user-avatar ${className}`} style={avatarStyle}>
                <img 
                    src={imageUrl} 
                    alt={user.name || 'User'} 
                    className="avatar-img"
                    onError={() => setImgError(true)}
                />
            </div>
        );
    }

    return (
        <div className={`user-avatar initial-avatar ${className}`} style={avatarStyle}>
            {initial}
        </div>
    );
};

export default UserAvatar;
