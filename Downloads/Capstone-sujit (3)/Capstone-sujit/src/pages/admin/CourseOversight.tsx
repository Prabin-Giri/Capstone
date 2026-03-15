import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
    adminGetCourses,
    adminGetUsers,
    adminReassignInstructor,
    adminSetCourseArchived,
    type AdminCourse,
    type User,
} from '../../lib/api';
import { ArrowLeft, RefreshCw, Archive, RotateCcw } from 'lucide-react';
import './DatabaseExplorer.css';

const CourseOversight: React.FC = () => {
    const navigate = useNavigate();
    const [courses, setCourses] = useState<AdminCourse[]>([]);
    const [faculty, setFaculty] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [reassignCourseId, setReassignCourseId] = useState<string | null>(null);
    const [reassignInstructorId, setReassignInstructorId] = useState<string>('');

    const load = async () => {
        setLoading(true);
        try {
            const [courseList, facultyList] = await Promise.all([
                adminGetCourses(),
                adminGetUsers({ role: 'faculty' }),
            ]);
            setCourses(courseList);
            setFaculty(facultyList);
        } catch (err) {
            console.error(err);
            setMessage('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleReassign = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reassignCourseId) return;
        try {
            await adminReassignInstructor(reassignCourseId, reassignInstructorId || null);
            setMessage('Instructor updated');
            setReassignCourseId(null);
            setReassignInstructorId('');
            load();
        } catch (err: any) {
            setMessage(err.message || 'Update failed');
        }
    };

    const handleArchive = async (course: AdminCourse) => {
        const action = course.is_archived ? 'Unarchive' : 'Archive';
        if (!confirm(`${action} "${course.name}"?`)) return;
        try {
            await adminSetCourseArchived(course.id, !course.is_archived);
            setMessage(`${action}d successfully`);
            load();
        } catch (err: any) {
            setMessage(err.message || 'Failed');
        }
    };

    return (
        <div className="db-content">
            <div className="table-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}><ArrowLeft size={18} /> Back</Button>
                <div>
                    <h1>Course Oversight</h1>
                    <p className="row-count">View all courses, reassign instructor, archive or unarchive.</p>
                </div>
            </div>

            {message && <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-surface)', borderRadius: '8px' }}>{message}</div>}

            <Card className="admin-card" style={{ overflow: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 className="admin-card-title" style={{ margin: 0 }}>All courses</h4>
                    <Button size="sm" variant="ghost" onClick={load}><RefreshCw size={14} /> Refresh</Button>
                </div>
                {loading ? <p className="admin-muted">Loading...</p> : (
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Course</th>
                                <th>Term</th>
                                <th>Instructor</th>
                                <th>Enrolled</th>
                                <th>Assignments</th>
                                <th>Archived</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {courses.map(c => (
                                <tr key={c.id}>
                                    <td><strong>{c.id}</strong> — {c.name}</td>
                                    <td>{c.term}</td>
                                    <td>{c.instructor_name || c.instructor_email || '—'}</td>
                                    <td>{c.enrollment_count}</td>
                                    <td>{c.assignment_count}</td>
                                    <td>{c.is_archived ? 'Yes' : 'No'}</td>
                                    <td>
                                        <button type="button" className="icon-btn" onClick={() => { setReassignCourseId(c.id); setReassignInstructorId(c.instructor_id || ''); }} title="Reassign instructor">Edit</button>
                                        <button type="button" className="icon-btn" onClick={() => handleArchive(c)} title={c.is_archived ? 'Unarchive' : 'Archive'}>
                                            {c.is_archived ? <RotateCcw size={14} /> : <Archive size={14} />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Card>

            {reassignCourseId && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setReassignCourseId(null)}>
                    <Card style={{ padding: '1.5rem', minWidth: '320px' }} onClick={e => e.stopPropagation()}>
                        <h4>Reassign instructor</h4>
                        <form onSubmit={handleReassign}>
                            <label className="admin-card-title">Instructor</label>
                            <select value={reassignInstructorId} onChange={(e) => setReassignInstructorId(e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.35rem' }}>
                                <option value="">— None —</option>
                                {faculty.map(f => <option key={f.id} value={f.id}>{f.name} ({f.email})</option>)}
                            </select>
                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                                <Button type="submit" size="sm">Save</Button>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setReassignCourseId(null)}>Cancel</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default CourseOversight;
