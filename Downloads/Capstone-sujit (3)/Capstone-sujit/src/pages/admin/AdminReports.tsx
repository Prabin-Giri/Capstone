import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { adminGetReportSummary, type AdminReportSummary } from '../../lib/api';
import { ArrowLeft, RefreshCw, Users, BookOpen, FileQuestion, Send } from 'lucide-react';
import './DatabaseExplorer.css';

const AdminReports: React.FC = () => {
    const navigate = useNavigate();
    const [data, setData] = useState<AdminReportSummary | null>(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const summary = await adminGetReportSummary();
            setData(summary);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    if (loading && !data) return <div className="db-content"><p className="admin-muted">Loading reports...</p></div>;

    return (
        <div className="db-content">
            <div className="table-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}><ArrowLeft size={18} /> Back</Button>
                <div style={{ flex: 1 }}>
                    <h1>Reports & Analytics</h1>
                    <p className="row-count">User counts, course stats, recent signups and submissions.</p>
                </div>
                <Button size="sm" variant="ghost" onClick={load}><RefreshCw size={14} /> Refresh</Button>
            </div>

            {!data ? (
                <p className="admin-muted">Failed to load report.</p>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <Card className="admin-card" style={{ padding: '1rem', textAlign: 'center' }}>
                            <Users size={28} style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }} />
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{data.totalUsers}</div>
                            <div className="admin-muted">Total users</div>
                        </Card>
                        <Card className="admin-card" style={{ padding: '1rem', textAlign: 'center' }}>
                            <BookOpen size={28} style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }} />
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{data.courses.total}</div>
                            <div className="admin-muted">Courses ({data.courses.archived} archived)</div>
                        </Card>
                        <Card className="admin-card" style={{ padding: '1rem', textAlign: 'center' }}>
                            <FileQuestion size={28} style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }} />
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{data.assignments}</div>
                            <div className="admin-muted">Assignments</div>
                        </Card>
                        <Card className="admin-card" style={{ padding: '1rem', textAlign: 'center' }}>
                            <Send size={28} style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }} />
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{data.submissions}</div>
                            <div className="admin-muted">Submissions</div>
                        </Card>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1.5rem' }}>
                        <Card className="admin-card" style={{ padding: '1rem' }}>
                            <h4 className="admin-card-title">Users by role</h4>
                            <ul className="admin-list">
                                {Object.entries(data.usersByRole || {}).map(([role, count]) => (
                                    <li key={role} className="admin-list-item" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <span className="admin-list-name">{role || '(no role)'}</span>
                                        <span>{count}</span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                        <Card className="admin-card" style={{ padding: '1rem' }}>
                            <h4 className="admin-card-title">Recent signups (last 10)</h4>
                            <ul className="admin-list">
                                {(data.recentSignups || []).slice(0, 10).map((u: any) => (
                                    <li key={u.id} className="admin-list-item">
                                        <span className="admin-list-name">{u.name}</span>
                                        <span className="admin-list-email">{u.email} · {u.role || '—'}</span>
                                    </li>
                                ))}
                            </ul>
                            {(!data.recentSignups || data.recentSignups.length === 0) && <p className="admin-muted">No users yet.</p>}
                        </Card>
                    </div>

                    <Card className="admin-card" style={{ marginTop: '1.5rem', padding: '1rem' }}>
                        <h4 className="admin-card-title">Recent submissions (last 15)</h4>
                        <table className="data-table" style={{ width: '100%', fontSize: '0.9rem' }}>
                            <thead>
                                <tr><th>Assignment</th><th>Student ID</th><th>Submitted</th></tr>
                            </thead>
                            <tbody>
                                {(data.recentSubmissions || []).map((s: any) => (
                                    <tr key={s.id}>
                                        <td>{s.assignment_title}</td>
                                        <td><code>{s.student_id}</code></td>
                                        <td>{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {(!data.recentSubmissions || data.recentSubmissions.length === 0) && <p className="admin-muted">No submissions yet.</p>}
                    </Card>
                </>
            )}
        </div>
    );
};

export default AdminReports;
