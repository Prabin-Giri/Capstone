import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    getCourseAssignments,
    getCourse,
    deleteAssignment,
    type Assignment,
    type Course
} from '../../lib/api';
import { ChevronLeft, Plus, Search, Edit, Trash2, Download, BarChart2, ArrowUpDown } from 'lucide-react';
import { showDialog } from '../../components/ui/Dialog';
import { StatusBadge } from '../../components/ui/StatusBadge';
import './FacultyAssignmentList.css';

const FacultyAssignmentList: React.FC = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState<Course | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [sortField, setSortField] = useState<'due_date' | 'title' | 'points'>('due_date');
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (courseId) loadData();
    }, [courseId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowSortDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    async function loadData() {
        if (!courseId) return;
        try {
            const [courseData, assignmentsData] = await Promise.all([
                getCourse(courseId),
                getCourseAssignments(courseId)
            ]);
            setCourse(courseData);
            setAssignments(assignmentsData);
        } catch (err) {
            console.error('Failed to load data', err);
        } finally {
            setLoading(false);
        }
    }

    const handleDelete = async (id: string, title: string) => {
        const confirmed = await showDialog({
            title: 'Delete Assignment',
            message: `Are you sure you want to delete "${title}"? This will also delete all submissions.`,
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel',
        });
        if (!confirmed) return;
        try {
            await deleteAssignment(id);
            setAssignments(prev => prev.filter(a => a.id !== id));
        } catch (err) {
            console.error('Failed to delete', err);
            await showDialog({ title: 'Error', message: 'Failed to delete assignment', confirmText: 'OK' });
        }
    };

    if (loading) return <div className="faculty-assignment-list-container">Loading assignments...</div>;
    if (!course) return <div className="faculty-assignment-list-container">Course not found</div>;

    const q = searchQuery.trim().toLowerCase();
    const filtered = q
        ? assignments.filter(a => a.title.toLowerCase().includes(q))
        : assignments;
    const sortedAssignments = [...filtered].sort((a, b) => {
        let comparison = 0;
        if (sortField === 'title') {
            comparison = a.title.localeCompare(b.title);
        } else if (sortField === 'points') {
            comparison = (a.points || 0) - (b.points || 0);
        } else {
            const aTime = new Date(a.due_date).getTime();
            const bTime = new Date(b.due_date).getTime();
            comparison = aTime - bTime;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
    });

    const handleSortChange = (field: 'due_date' | 'title' | 'points') => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
        setShowSortDropdown(false);
    };

    return (
        <div className="faculty-assignment-list-container">
            <div className="fal-header">
                <div>
                    <div className="breadcrumb">
                        <Link to={`/faculty/courses/${courseId}`}>
                            <ChevronLeft size={14} />
                            Back to Course
                        </Link>
                        <span>/</span>
                        <span>Assignments</span>
                    </div>
                    <h1 className="page-title">{course.name} — Assignments</h1>
                    <p className="page-subtitle">{filtered.length} Assignment{filtered.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    className="fal-create-btn"
                    onClick={() => navigate(`/faculty/courses/${courseId}/assignments/new`)}
                >
                    <Plus size={18} />
                    Create Assignment
                </button>
            </div>

            {/* Search + Sort */}
            <div className="fal-controls">
                <div className="fal-search-bar">
                    <Search size={16} className="fal-search-icon" />
                    <input
                        type="text"
                        placeholder="Search assignments..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="fal-search-input"
                    />
                </div>
                <div className="fal-sort-wrap" ref={dropdownRef}>
                    <button
                        type="button"
                        className={`fal-sort-btn ${showSortDropdown ? 'is-active' : ''}`}
                        onClick={() => setShowSortDropdown(!showSortDropdown)}
                        title="Sort assignments"
                        aria-label="Sort assignments"
                    >
                        <ArrowUpDown size={16} />
                    </button>

                    {showSortDropdown && (
                        <div className="fal-sort-dropdown">
                            <div className="fal-sort-dropdown-header">Sort By</div>
                            <button 
                                className={`fal-sort-item ${sortField === 'title' ? 'is-selected' : ''}`}
                                onClick={() => handleSortChange('title')}
                            >
                                Title {sortField === 'title' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </button>
                            <button 
                                className={`fal-sort-item ${sortField === 'due_date' ? 'is-selected' : ''}`}
                                onClick={() => handleSortChange('due_date')}
                            >
                                Deadline {sortField === 'due_date' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </button>
                            <button 
                                className={`fal-sort-item ${sortField === 'points' ? 'is-selected' : ''}`}
                                onClick={() => handleSortChange('points')}
                            >
                                Points {sortField === 'points' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Assignments Table */}
            <div className="fal-table-container">
                <table className="fal-table">
                    <thead>
                        <tr>
                            <th>Assignment</th>
                            <th>Deadline</th>
                            <th>Points</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                                    {q ? 'No assignments match your search.' : 'No assignments yet. Create one to get started!'}
                                </td>
                            </tr>
                        ) : sortedAssignments.map(a => (
                            <tr key={a.id}>
                                <td>
                                    <span
                                        className="fal-assignment-title"
                                        onClick={() => navigate(`/faculty/courses/${courseId}/assignments/${a.id}`)}
                                    >
                                        {a.title}
                                    </span>
                                </td>
                                <td style={{ color: 'var(--text-secondary)' }}>
                                    {new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td style={{ color: 'var(--text-secondary)' }}>
                                    {a.points || 100} pts
                                </td>
                                <td>
                                    <StatusBadge status={a.status} />
                                </td>
                                <td>
                                    <div className="fal-actions">
                                        <button
                                            className="fal-action-btn"
                                            onClick={() => navigate(`/faculty/courses/${courseId}/gradebook`)}
                                            title="View Grades"
                                        >
                                            <Download size={14} />
                                            Grades
                                        </button>
                                        <button
                                            className="fal-action-btn fal-action-primary"
                                            onClick={() => navigate(`/faculty/courses/${courseId}/assignments/${a.id}/grading`)}
                                            title="Grade Submissions"
                                        >
                                            <BarChart2 size={14} />
                                            Grade
                                        </button>
                                        <button
                                            className="fal-action-btn"
                                            onClick={() => navigate(`/faculty/courses/${courseId}/assignments/${a.id}/edit`)}
                                            title="Edit Assignment"
                                        >
                                            <Edit size={14} />
                                            Edit
                                        </button>
                                        <button
                                            className="fal-action-btn fal-action-danger"
                                            onClick={() => handleDelete(a.id, a.title)}
                                            title="Delete Assignment"
                                        >
                                            <Trash2 size={14} />
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FacultyAssignmentList;
