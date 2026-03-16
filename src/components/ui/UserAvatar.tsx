import React from 'react';
import './UserAvatar.css';

interface UserAvatarProps {
    user: {
        name?: string;
        profile_picture?: string;
        profilePicture?: string; // Support both snake_case and camelCase
    };
    size?: number;
    className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ user, size = 40, className = '' }) => {
    const [imgError, setImgError] = React.useState(false);
    
    const profilePic = user.profilePicture || user.profile_picture;
    const initial = user.name ? user.name.charAt(0).toUpperCase() : '?';
    
    const avatarStyle = {
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${size * 0.4}px`
    };

    if (profilePic && !imgError) {
        const imageUrl = profilePic.startsWith('http') 
            ? profilePic 
            : `http://localhost:3001/uploads/${profilePic}`;
            
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
