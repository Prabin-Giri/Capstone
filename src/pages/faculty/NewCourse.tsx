import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createCourse } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { ChevronLeft } from 'lucide-react';
import './NewCourse.css';

const TERM_OPTIONS = ['Spring', 'Summer', 'Fall', 'Winter'];

const DEFAULT_YEAR = String(new Date().getFullYear());

const NewCourse: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        term: TERM_OPTIONS[0],
        year: DEFAULT_YEAR
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const user = getUser();
            const payload = {
                id: formData.id,
                name: formData.name,
                term: `${formData.term} ${formData.year}`,
                instructor_id: user?.id,
            };
            await createCourse(payload);
            navigate('/faculty');
        } catch (err: any) {
            setError(err.message || 'Failed to create course');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="new-course-container">
            <div className="breadcrumb">
                <Link to="/faculty">
                    <ChevronLeft size={14} />
                    Back to Courses
                </Link>
            </div>
            <div className="new-course-card">
                <h1 className="new-course-title">Create New Course</h1>
                <p className="new-course-subtitle">Fill in the details below to add a new course to your dashboard.</p>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Course ID</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="e.g., CSCI4060"
                            value={formData.id}
                            onChange={(e) => setFormData({ ...formData, id: e.target.value.toUpperCase() })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Course Name</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="e.g., Software Engineering"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Term</label>
                        <select
                            className="form-input"
                            value={formData.term}
                            onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                            required
                        >
                            {TERM_OPTIONS.map(term => (
                                <option key={term} value={term}>{term}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Year</label>
                        <input
                            type="number"
                            min="1900"
                            max="2999"
                            step="1"
                            className="form-input"
                            value={formData.year}
                            onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                            placeholder="e.g., 2026"
                            required
                        />
                    </div>

                    <div className="form-actions">
                        <button
                            type="button"
                            className="nc-btn-outline"
                            onClick={() => navigate('/faculty')}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button type="submit" className="nc-btn-primary" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Course'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NewCourse;
