import { getUser } from '../../lib/auth';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { UserCircle, Calendar, Info } from 'lucide-react';
import './UserDashboard.css';

const UserDashboard: React.FC = () => {
    const user = getUser();
    const navigate = useNavigate();

    return (
        <div className="user-dashboard">
            <div className="user-dashboard-header">
                <div className="user-dashboard-avatar">
                    <UserCircle size={48} strokeWidth={1.5} />
                </div>
                <h1 className="user-dashboard-title">Dashboard</h1>
                <p className="user-dashboard-subtitle">Your account and courses.</p>
            </div>

            <div className="user-dashboard-card info-card">
                <Info size={24} className="user-dashboard-card-icon" />
                <h2 className="user-dashboard-card-title">No role assigned</h2>
                <p className="user-dashboard-card-text">
                    Your account doesn’t have a role (student, faculty, TA, or admin) yet. 
                    An administrator or instructor can assign you a role so you can access courses, assignments, or grading.
                </p>
                <p className="user-dashboard-card-text muted">
                    You can still use the calendar and your account settings. Once you’re enrolled or assigned a role, you’ll see the right dashboard here.
                </p>
            </div>

            <div className="user-dashboard-actions">
                <Button
                    variant="outline"
                    onClick={() => navigate('/calendar')}
                    className="user-dashboard-btn"
                >
                    <Calendar size={20} />
                    View Calendar
                </Button>
            </div>
        </div>
    );
};

export default UserDashboard;
