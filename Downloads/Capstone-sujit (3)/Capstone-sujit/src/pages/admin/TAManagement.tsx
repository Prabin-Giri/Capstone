import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { adminGetTAs, adminGetCourses, type AdminTA, type AdminCourse } from '../../lib/api';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import './DatabaseExplorer.css';

const TAManagement: React.FC = () => {
    const navigate = useNavigate();
    const [tas, setTas] = useState<AdminTA[]>([]);
    const [courses, setCourses] = useState<AdminCourse[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const [taList, courseList] = await Promise.all([adminGetTAs(), adminGetCourses()]);
            setTas(taList);
            setCourses(courseList);
        } catch (err) {
            console.error(err);
            setMessage('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    return (
        <div className="db-content">
            <div className="table-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}><ArrowLeft size={18} /> Back</Button>
                <div>
                    <h1>TA Management</h1>
                    <p className="row-count">
                        View TA details and which courses they assist. Adding or removing TAs is done by faculty for their courses.
                    </p>
                </div>
            </div>

            {message && <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-surface)', borderRadius: '8px' }}>{message}</div>}

            <Card className="admin-card" style={{ marginTop: '0.5rem', overflow: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 className="admin-card-title" style={{ margin: 0 }}>TA list & courses</h4>
                    <Button size="sm" variant="ghost" onClick={load}><RefreshCw size={14} /> Refresh</Button>
                </div>
                {loading ? (
                    <p className="admin-muted">Loading...</p>
                ) : tas.length === 0 ? (
                    <p className="admin-muted">No TAs yet. Faculty can add TAs to their courses from the course page.</p>
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
                            {tas.map(ta => (
                                <tr key={ta.id}>
                                    <td><span className="admin-list-name">{ta.name}</span></td>
                                    <td><span className="admin-list-email">{ta.email}</span></td>
                                    <td><code style={{ fontSize: '0.8rem' }}>{ta.id}</code></td>
                                    <td>
                                        {ta.course_ids.length === 0 ? (
                                            <span className="admin-muted">—</span>
                                        ) : (
                                            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                {ta.course_ids.map(cid => {
                                                    const course = courses.find(c => c.id === cid);
                                                    return (
                                                        <span key={cid} style={{ background: 'var(--bg-body)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                                                            {course ? `${course.id} — ${course.name}${course.is_archived ? ' (archived)' : ''}` : cid}
                                                        </span>
                                                    );
                                                })}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Card>
        </div>
    );
};

export default TAManagement;
