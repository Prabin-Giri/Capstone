import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAssignment, createAssignment, createAssignmentWithRubric, updateAssignment, uploadStarterCode, getTestCases, createTestCaseForAssignment, updateTestCase, deleteTestCase, getAssignmentRubricCriteria, updateAssignmentRubricCriteria } from '../../lib/api';
import type { TestCase, RubricCriterionInput } from '../../lib/api';
import { getRole } from '../../lib/auth';

import { Button } from '../../components/ui/Button';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import './AssignmentWizard.css';

const AssignmentWizard: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const basePath = getRole() === 'ta' ? '/ta' : '/faculty';
    const isEditing = !!(assignmentId && assignmentId !== 'new');

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        due_date: '',
        due_time: '23:59',
        status: 'active' as 'active' | 'closed' | 'late',
        points: '100' as string | number,
        language: '',
        starter_code_path: '',
        test_case_file_path: '',
        type: 'individual' as 'individual' | 'group',
        late_penalty_enabled: false,
        late_penalty_type: 'per_day' as 'per_day' | 'per_hour' | 'fixed',
        late_penalty_value: '10' as string | number,
        late_penalty_cap: '50' as string | number
    });
    const [starterCodeFile, setStarterCodeFile] = useState<File | null>(null);
    const [testCaseFile, setTestCaseFile] = useState<File | null>(null);
    const [testCases, setTestCases] = useState<(Omit<Partial<TestCase>, 'points'> & { points?: number | string })[]>([]);
    const [rubricCriteria, setRubricCriteria] = useState<{ criterion_name: string; points: number | string; weight?: number | string; category?: string; description?: string }[]>([]);
    const [rubricWeighted, setRubricWeighted] = useState(false);
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isEditing && assignmentId) {
            Promise.all([
                getAssignment(assignmentId),
                getTestCases(assignmentId),
                getAssignmentRubricCriteria(assignmentId).catch(() => [])
            ]).then(([data, cases, criteria]) => {
                const dateObj = new Date(data.due_date);
                setFormData({
                    title: data.title,
                    description: data.description || '',
                    due_date: dateObj.toISOString().split('T')[0],
                    due_time: dateObj.toISOString().split('T')[1].substring(0, 5),
                    status: data.status,
                    points: data.points || 100,
                    language: data.language || '',
                    starter_code_path: data.starter_code_path || '',
                    test_case_file_path: data.test_case_file_path || '',
                    type: data.type || 'individual',
                    late_penalty_enabled: !!(data.late_penalty_enabled === true || data.late_penalty_enabled === 1),
                    late_penalty_type: (data.late_penalty_type as 'per_day' | 'per_hour' | 'fixed') || 'per_day',
                    late_penalty_value: data.late_penalty_value != null ? data.late_penalty_value : 10,
                    late_penalty_cap: data.late_penalty_cap != null ? data.late_penalty_cap : 50
                });
                setTestCases(cases.map(tc => ({ ...tc, points: tc.points })));
                setRubricCriteria(Array.isArray(criteria) && criteria.length > 0
                    ? criteria.map(c => ({ criterion_name: c.criterion_name, points: c.points, weight: c.weight ?? '', category: c.category ?? '', description: c.description ?? '' }))
                    : []);
                setRubricWeighted(Array.isArray(criteria) && criteria.some((c: { weight?: number | null }) => c.weight != null && Number(c.weight) > 0));
                setLoading(false);
            }).catch(err => {
                console.error(err);
                navigate(`${basePath}/courses/${courseId}`);
            });
        }
    }, [isEditing, assignmentId, courseId, navigate]);

    const handleAddTestCase = () => {
        setTestCases([...testCases, {
            input: '',
            expected_output: '',
            points: '',
            is_public: 1
        }]);
    };

    const handleRemoveTestCase = async (index: number) => {
        const tc = testCases[index];
        if (tc.id) {
            if (!confirm('Are you sure you want to delete this test case?')) return;
            try {
                await deleteTestCase(tc.id);
            } catch (err) {
                console.error('Failed to delete test case', err);
                return;
            }
        }
        setTestCases(testCases.filter((_, i) => i !== index));
    };

    const handleTestCaseChange = (index: number, field: keyof TestCase, value: any) => {
        const newCases = [...testCases];
        newCases[index] = { ...newCases[index], [field]: value };
        setTestCases(newCases);
    };

    const addRubricCriterion = () => {
        setRubricCriteria([...rubricCriteria, { criterion_name: '', points: 10, weight: rubricWeighted ? 0 : undefined, category: '', description: '' }]);
    };
    const removeRubricCriterion = (index: number) => {
        setRubricCriteria(rubricCriteria.filter((_, i) => i !== index));
    };
    const updateRubricCriterion = (index: number, field: 'criterion_name' | 'points' | 'weight' | 'category' | 'description', value: string | number) => {
        const next = [...rubricCriteria];
        if (field === 'points') next[index] = { ...next[index], points: typeof value === 'number' ? value : parseInt(String(value), 10) || 0 };
        else if (field === 'weight') next[index] = { ...next[index], weight: value === '' || value === undefined ? undefined : (typeof value === 'number' ? value : parseFloat(String(value)) || 0) };
        else if (field === 'category' || field === 'description') next[index] = { ...next[index], [field]: String(value) };
        else next[index] = { ...next[index], criterion_name: String(value) };
        setRubricCriteria(next);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            let starterCodePath = formData.starter_code_path;
            let testCaseFilePath = formData.test_case_file_path;

            if (starterCodeFile) {
                const uploadResult = await uploadStarterCode(starterCodeFile);
                starterCodePath = uploadResult.filePath;
            }

            if (testCaseFile) {
                const uploadResult = await uploadStarterCode(testCaseFile); // Reusing uploadStarterCode for general uploads
                testCaseFilePath = uploadResult.filePath;
            }

            const combinedDateTime = new Date(`${formData.due_date}T${formData.due_time}:00`).toISOString();

            const payload = {
                ...formData,
                points: formData.points === '' ? 0 : Number(formData.points),
                late_penalty_value: formData.late_penalty_value === '' ? 0 : Number(formData.late_penalty_value),
                late_penalty_cap: formData.late_penalty_cap === '' ? 0 : Number(formData.late_penalty_cap),
                due_date: combinedDateTime,
                starter_code_path: starterCodePath,
                test_case_file_path: testCaseFilePath,
            };
            const { due_time, ...finalPayload } = payload;

            let finalAssignmentId = assignmentId;
            const hasRubric = rubricCriteria.length > 0 && rubricCriteria.some(r => (r.criterion_name || '').trim() !== '');

            if (isEditing && assignmentId) {
                await updateAssignment(assignmentId, finalPayload);
                if (hasRubric) {
                    await updateAssignmentRubricCriteria(assignmentId, rubricCriteria.map(r => ({
                        criterion_name: (r.criterion_name || '').trim() || 'Criterion',
                        points: typeof r.points === 'number' ? r.points : parseInt(String(r.points), 10) || 0,
                        weight: rubricWeighted && r.weight !== undefined && r.weight !== '' ? (typeof r.weight === 'number' ? r.weight : parseFloat(String(r.weight)) || 0) : null,
                        category: (r.category || '').trim() || null,
                        description: (r.description || '').trim() || null
                    })));
                } else {
                    await updateAssignmentRubricCriteria(assignmentId, []);
                }
            } else {
                if (!courseId) throw new Error('Course ID is missing.');
                if (hasRubric) {
                    const criteriaPayload: RubricCriterionInput[] = rubricCriteria
                        .filter(r => (r.criterion_name || '').trim() !== '')
                        .map(r => ({
                            criterion_name: (r.criterion_name || '').trim() || 'Criterion',
                            points: typeof r.points === 'number' ? r.points : parseInt(String(r.points), 10) || 0,
                            weight: rubricWeighted && r.weight !== undefined && r.weight !== '' ? (typeof r.weight === 'number' ? r.weight : parseFloat(String(r.weight)) || 0) : null,
                            category: (r.category || '').trim() || null,
                            description: (r.description || '').trim() || null
                        }));
                    const newAssignment = await createAssignmentWithRubric({
                        ...finalPayload,
                        course_id: courseId,
                        rubric_criteria: criteriaPayload,
                    });
                    const createdId = newAssignment?.id;
                    if (createdId == null || String(createdId).trim() === '') {
                        throw new Error('Assignment was created but no ID was returned. Cannot save test cases.');
                    }
                    finalAssignmentId = createdId;
                } else {
                    const newAssignment = await createAssignment({
                        ...finalPayload,
                        course_id: courseId,
                    });
                    const createdId = newAssignment?.id;
                    if (createdId == null || String(createdId).trim() === '') {
                        throw new Error('Assignment was created but no ID was returned. Cannot save test cases.');
                    }
                    finalAssignmentId = createdId;
                }
            }

            // 3. Sync test cases (assignment id is always valid here)
            const assignmentIdForTests = (finalAssignmentId != null && finalAssignmentId !== 'new')
                ? String(finalAssignmentId).trim()
                : '';
            if (assignmentIdForTests) {
                for (const tc of testCases) {
                    const pointsVal = tc.points === '' || tc.points === undefined ? 0 : Number(tc.points);
                    if (tc.id) {
                        await updateTestCase(tc.id, { input: tc.input, expected_output: tc.expected_output, points: pointsVal, is_public: tc.is_public });
                    } else {
                        await createTestCaseForAssignment(assignmentIdForTests, {
                            input: tc.input ?? '',
                            expected_output: tc.expected_output ?? '',
                            points: pointsVal,
                            is_public: tc.is_public ?? 1,
                        });
                    }
                }
            }

            navigate(`${basePath}/courses/${courseId}`);
        } catch (err: any) {
            console.error('Failed to save', err);
            const message = err.message || 'Unknown error';
            alert(`Failed to save assignment and test cases: ${message}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="assignment-wizard-container">
            <h1 className="wizard-title">
                {isEditing ? 'Edit Assignment' : 'Create New Assignment'}
            </h1>

            <form onSubmit={handleSubmit} className="wizard-form">
                <div className="form-group">
                    <label className="form-label">Title</label>
                    <input
                        type="text"
                        required
                        className="form-input"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g. Midterm Project"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                        required
                        className="form-textarea"
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Enter assignment instructions..."
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Due Date</label>
                        <div className="form-input-group">
                            <input
                                type="date"
                                required
                                className="form-input"
                                value={formData.due_date}
                                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                            />
                            <input
                                type="time"
                                required
                                className="form-input"
                                value={formData.due_time}
                                onChange={e => setFormData({ ...formData, due_time: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Grade</label>
                        <input
                            type="number"
                            min="0"
                            className="form-input"
                            value={formData.points}
                            onChange={e => setFormData({ ...formData, points: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Status</label>
                        <select
                            className="form-select"
                            value={formData.status}
                            onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                        >
                            <option value="active">Active</option>
                            <option value="closed">Closed</option>
                            <option value="late">Late</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Type</label>
                        <select
                            className="form-select"
                            value={formData.type}
                            onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                        >
                            <option value="individual">Individual</option>
                            <option value="group">Group</option>
                        </select>
                    </div>
                </div>

                <div className="late-penalty-card">
                    <h3 className="late-penalty-title">Late submission penalty</h3>
                    <p className="late-penalty-info">When enabled, the autograder applies a deduction based on submission time vs due date. Submission time is recorded automatically.</p>
                    <div className="form-group-checkbox">
                        <input
                            type="checkbox"
                            checked={formData.late_penalty_enabled}
                            onChange={e => setFormData({ ...formData, late_penalty_enabled: e.target.checked })}
                        />
                        <span className="checkbox-label-text">Enable late penalty</span>
                    </div>
                    {formData.late_penalty_enabled && (
                        <div className="late-penalty-grid">
                            <div>
                                <label className="form-label">Type</label>
                                <select
                                    className="form-select"
                                    value={formData.late_penalty_type}
                                    onChange={e => setFormData({ ...formData, late_penalty_type: e.target.value as any })}
                                >
                                    <option value="per_day">Per day</option>
                                    <option value="per_hour">Per hour</option>
                                    <option value="fixed">Fixed %</option>
                                </select>
                            </div>
                            <div>
                                <label className="form-label">{formData.late_penalty_type === 'fixed' ? 'Deduction %' : 'Value (% per day/hour)'}</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    className="form-input"
                                    value={formData.late_penalty_value}
                                    onChange={e => setFormData({ ...formData, late_penalty_value: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="form-label">Cap (%)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="5"
                                    className="form-input"
                                    value={formData.late_penalty_cap}
                                    onChange={e => setFormData({ ...formData, late_penalty_cap: e.target.value })}
                                />
                                <span className="late-penalty-cap-info">Max deduction</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                    <h3 className="section-title-wizard">Grading rubric (optional)</h3>
                    <p className="description-text" style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                        Add criteria for manual grading. Use <strong>points</strong> (unweighted: total = sum of earned points) or <strong>weighted</strong> (each criterion has a weight %; grade = weighted average). Optionally add a <strong>category</strong> (e.g. &quot;I. Correctness&quot;, &quot;II. Style&quot;) and a <strong>description</strong> (e.g. &quot;All test cases produce expected output&quot;) per criterion.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                            <input type="radio" name="rubricType" checked={!rubricWeighted} onChange={() => setRubricWeighted(false)} />
                            <span>Points (unweighted)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                            <input type="radio" name="rubricType" checked={rubricWeighted} onChange={() => setRubricWeighted(true)} />
                            <span>Weighted</span>
                        </label>
                    </div>
                    {rubricCriteria.length === 0 ? (
                        <Button type="button" variant="outline" size="sm" onClick={addRubricCriterion}>
                            <Plus size={14} /> Add criterion
                        </Button>
                    ) : (
                        <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                {rubricCriteria.map((r, idx) => (
                                    <div key={idx} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', background: 'var(--bg-surface)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={r.category ?? ''}
                                                onChange={e => updateRubricCriterion(idx, 'category', e.target.value)}
                                                placeholder="Category (e.g. I. Correctness)"
                                                style={{ flex: '0 0 180px', minWidth: '140px' }}
                                                title="Section header for grouping"
                                            />
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={r.criterion_name}
                                                onChange={e => updateRubricCriterion(idx, 'criterion_name', e.target.value)}
                                                placeholder="Criterion name"
                                                style={{ flex: '1', minWidth: '120px' }}
                                            />
                                            <input
                                                type="number"
                                                min={0}
                                                className="form-input"
                                                value={r.points}
                                                onChange={e => updateRubricCriterion(idx, 'points', e.target.value)}
                                                placeholder="Points"
                                                style={{ width: '70px' }}
                                            />
                                            {rubricWeighted && (
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    step={0.5}
                                                    className="form-input"
                                                    value={r.weight ?? ''}
                                                    onChange={e => updateRubricCriterion(idx, 'weight', e.target.value)}
                                                    placeholder="%"
                                                    title="Weight %"
                                                    style={{ width: '56px' }}
                                                />
                                            )}
                                            <Button type="button" variant="ghost" size="sm" onClick={() => removeRubricCriterion(idx)}>
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={r.description ?? ''}
                                            onChange={e => updateRubricCriterion(idx, 'description', e.target.value)}
                                            placeholder="Description (e.g. All test cases produce expected output)"
                                            style={{ width: '100%', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                ))}
                            </div>
                            {rubricWeighted && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                    Weights should sum to 100% for a 0–100 scale. Example: 40, 35, 25.
                                </p>
                            )}
                            <Button type="button" variant="outline" size="sm" onClick={addRubricCriterion}>
                                <Plus size={14} /> Add criterion
                            </Button>
                        </>
                    )}
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Programming Language</label>
                        <select
                            className="form-select"
                            value={formData.language}
                            onChange={e => setFormData({ ...formData, language: e.target.value })}
                        >
                            <option value="">Select Language (Optional)</option>
                            <option value="python">Python</option>
                            <option value="java">Java</option>
                            <option value="cpp">C++</option>
                            <option value="javascript">JavaScript</option>
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Starter Code (ZIP or individual file)</label>
                    <div className="upload-box-wizard">
                        <input
                            type="file"
                            onChange={e => e.target.files?.[0] && setStarterCodeFile(e.target.files[0])}
                            className="form-input-file"
                        />
                        {formData.starter_code_path && (
                            <p className="file-info-wizard">
                                Current: <span className="active-filename">{formData.starter_code_path}</span>
                            </p>
                        )}
                    </div>
                </div>

                <div className="test-cases-section">
                    <div className="section-header-wizard">
                        <h2 className="section-title-wizard">Test Cases</h2>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddTestCase}>
                            <Plus size={16} /> Add Test Case
                        </Button>
                    </div>

                    <div className="test-cases-list">
                        {testCases.length === 0 ? (
                            <p className="empty-state-text">No test cases defined. Add one above to enable automated grading.</p>
                        ) : (
                            testCases.map((tc, idx) => (
                                <div key={idx} className="test-case-item glass-card">
                                    <div className="tc-header">
                                        <span className="tc-index">Test Case {idx + 1}</span>
                                        <div className="tc-actions">
                                            <button
                                                type="button"
                                                className={`tc-toggle-btn ${tc.is_public ? 'public' : 'hidden'}`}
                                                onClick={() => handleTestCaseChange(idx, 'is_public', tc.is_public ? 0 : 1)}
                                                title={tc.is_public ? "Public (Student can see input/output)" : "Hidden (Only for grading)"}
                                            >
                                                {tc.is_public ? <Eye size={16} /> : <EyeOff size={16} />}
                                                <span>{tc.is_public ? 'Public' : 'Hidden'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="tc-delete-btn"
                                                onClick={() => handleRemoveTestCase(idx)}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="tc-grid">
                                        <div className="form-group">
                                            <label className="tc-label">Input</label>
                                            <textarea
                                                className="tc-textarea"
                                                value={tc.input || ''}
                                                onChange={e => handleTestCaseChange(idx, 'input', e.target.value)}
                                                placeholder="e.g. 5\n10"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="tc-label">Expected Output</label>
                                            <textarea
                                                className="tc-textarea"
                                                required
                                                value={tc.expected_output || ''}
                                                onChange={e => handleTestCaseChange(idx, 'expected_output', e.target.value)}
                                                placeholder="e.g. 15"
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group" style={{ maxWidth: '120px' }}>
                                        <label className="tc-label">Points</label>
                                        <input
                                            type="number"
                                            className="tc-input"
                                            value={tc.points ?? ''}
                                            onChange={e => handleTestCaseChange(idx, 'points', e.target.value)}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="section-header-wizard" style={{ borderTop: '1px solid var(--border-color)', marginTop: '2rem', paddingTop: '2rem' }}>
                    <h2 className="section-title-wizard">Test Case File (Optional)</h2>
                </div>

                <div className="test-case-file-container glass-card" style={{ marginBottom: '2rem' }}>
                    <p className="tc-description-wizard">
                        Upload a Python grader file (or zip) used for autograding submissions. This will override the manual test cases above.
                    </p>

                    <div className="upload-box-wizard">
                        <input
                            type="file"
                            id="test-case-file-input"
                            onChange={e => e.target.files?.[0] && setTestCaseFile(e.target.files[0])}
                            className="form-input-file"
                            style={{ display: 'none' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="file-display">
                                {(testCaseFile || formData.test_case_file_path) ? (
                                    <div className="file-info-active">
                                        <span className="active-filename">
                                            {testCaseFile ? testCaseFile.name : formData.test_case_file_path?.split('/').pop()}
                                        </span>
                                        {testCaseFile && <span className="active-filesize">({(testCaseFile.size / 1024).toFixed(1)} KB)</span>}
                                    </div>
                                ) : (
                                    <span className="empty-state-text-small">No test case file uploaded.</span>
                                )}
                            </div>
                            <div className="file-actions-wizard">
                                {(testCaseFile || formData.test_case_file_path) ? (
                                    <>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => document.getElementById('test-case-file-input')?.click()}
                                        >
                                            Replace
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="tc-remove-btn"
                                            style={{ color: '#ef4444' }}
                                            onClick={() => {
                                                setTestCaseFile(null);
                                                setFormData({ ...formData, test_case_file_path: '' });
                                            }}
                                        >
                                            <Trash2 size={14} /> Remove
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
                                        onClick={() => document.getElementById('test-case-file-input')?.click()}
                                    >
                                        <Plus size={16} /> Upload Grader
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="form-actions">
                    <Button type="button" variant="ghost" onClick={() => navigate(`${basePath}/courses/${courseId}`)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? 'Saving...' : (isEditing ? 'Update Assignment' : 'Create Assignment')}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default AssignmentWizard;
