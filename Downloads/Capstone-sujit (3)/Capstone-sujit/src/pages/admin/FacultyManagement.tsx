import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { adminCreateFaculty, adminGetUsers, adminPromoteToFaculty, adminGetCourses } from '../../lib/api';
import type { User, AdminCourse } from '../../lib/api';
import { ArrowLeft } from 'lucide-react';
import './DatabaseExplorer.css';

const FacultyManagement: React.FC = () => {
    const navigate = useNavigate();
    const [promoteEmailOrId, setPromoteEmailOrId] = useState('');
    const [promoteResult, setPromoteResult] = useState<string | null>(null);
    const [createName, setCreateName] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [createResult, setCreateResult] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [faculty, setFaculty] = useState<User[]>([]);
    const [courses, setCourses] = useState<AdminCourse[]>([]);
    const [facultyLoading, setFacultyLoading] = useState(false);

    useEffect(() => {
        loadFaculty();
        loadCourses();
    }, []);

    const loadFaculty = async () => {
        try {
            setFacultyLoading(true);
            const list = await adminGetUsers({ role: 'faculty' });
            setFaculty(list);
        } catch (err) {
            console.error('Failed to load faculty list', err);
        } finally {
            setFacultyLoading(false);
        }
    };

    const loadCourses = async () => {
        try {
            const list = await adminGetCourses();
            setCourses(list);
        } catch (err) {
            console.error('Failed to load courses', err);
        }
    };

    const getCoursesForFaculty = (instructorId: string) =>
        courses.filter(c => c.instructor_id === instructorId);

    const handlePromoteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPromoteResult(null);
        if (!promoteEmailOrId.trim()) {
            setPromoteResult('Please enter an email or ID.');
            return;
        }
        setBusy(true);
        try {
            const payload: { email?: string; id?: string } = {};
            const value = promoteEmailOrId.trim();
            if (value.includes('@')) {
                payload.email = value;
            } else {
                payload.id = value;
            }
            const res = await adminPromoteToFaculty(payload);
            const user: User = res.user;
            setPromoteResult(`Promoted ${user.email} to faculty.`);
            await loadFaculty();
        } catch (err: any) {
            setPromoteResult(err.message || 'Failed to promote user.');
        } finally {
            setBusy(false);
        }
    };

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateResult(null);
        if (!createName || !createEmail || !createPassword) {
            setCreateResult('Name, email, and password are required.');
            return;
        }
        setBusy(true);
        try {
            const res = await adminCreateFaculty({
                name: createName,
                email: createEmail,
                password: createPassword,
            });
            const user: User = res.user;
            setCreateResult(`Created faculty account for ${user.email}.`);
            setCreateName('');
            setCreateEmail('');
            setCreatePassword('');
            await loadFaculty();
        } catch (err: any) {
            setCreateResult(err.message || 'Failed to create faculty account.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="db-content">
            <div className="table-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}><ArrowLeft size={18} /> Back</Button>
                <div>
                    <h1>Faculty Management</h1>
                    <p className="row-count">
                        Promote existing users to faculty or create new faculty accounts.
                    </p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '1.5rem' }}>
                <Card className="admin-card">
                    <form onSubmit={handlePromoteSubmit} className="admin-form">
                        <div className="form-group">
                            <label className="form-label">
                                Promote existing user to Faculty
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Enter user email or ID"
                                value={promoteEmailOrId}
                                onChange={(e) => setPromoteEmailOrId(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="submit-btn" disabled={busy}>
                            Promote to Faculty
                        </button>
                        {promoteResult && (
                            <p className="admin-result">{promoteResult}</p>
                        )}
                    </form>
                </Card>

                <Card className="admin-card">
                    <form onSubmit={handleCreateSubmit} className="admin-form">
                        <div className="form-group">
                            <label className="form-label">Create new Faculty account</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Full name"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                            />
                            <input
                                type="email"
                                className="form-input"
                                placeholder="Email"
                                value={createEmail}
                                onChange={(e) => setCreateEmail(e.target.value)}
                            />
                            <input
                                type="password"
                                className="form-input"
                                placeholder="Temporary password"
                                value={createPassword}
                                onChange={(e) => setCreatePassword(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="submit-btn" disabled={busy}>
                            Create Faculty
                        </button>
                        {createResult && (
                            <p className="admin-result">{createResult}</p>
                        )}
                    </form>
                </Card>
            </div>

            <Card className="admin-card" style={{ marginTop: '1.5rem', overflow: 'auto' }}>
                <h4 className="admin-card-title">Faculty list & their courses</h4>
                {facultyLoading ? (
                    <p className="admin-muted">Loading faculty...</p>
                ) : faculty.length === 0 ? (
                    <p className="admin-muted">No faculty accounts yet.</p>
                ) : (
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>ID</th>
                                <th>Courses</th>
                            </tr>
                        </thead>
                        <tbody>
                            {faculty.map(f => {
                                const facultyCourses = getCoursesForFaculty(f.id);
                                return (
                                    <tr key={f.id}>
                                        <td><span className="admin-list-name">{f.name}</span></td>
                                        <td><span className="admin-list-email">{f.email}</span></td>
                                        <td><code style={{ fontSize: '0.8rem' }}>{f.id}</code></td>
                                        <td>
                                            {facultyCourses.length === 0 ? (
                                                <span className="admin-muted">—</span>
                                            ) : (
                                                <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                    {facultyCourses.map(c => (
                                                        <span key={c.id} style={{ background: 'var(--bg-body)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                                                            {c.id} — {c.name}
                                                            {c.is_archived ? ' (archived)' : ''}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </Card>
        </div>
    );
};

export default FacultyManagement;

