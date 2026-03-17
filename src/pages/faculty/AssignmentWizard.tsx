import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAssignment, createAssignment, updateAssignment, uploadStarterCode, getTestCases, createTestCase, updateTestCase, deleteTestCase } from '../../lib/api';
import type { TestCase, RubricConfig } from '../../lib/api';
import { getRole } from '../../lib/auth';

import { Button } from '../../components/ui/Button';
import { Bold, Italic, Underline, List, ListOrdered, Link2, Paperclip, RemoveFormatting, Trash2, Eye, EyeOff, Plus } from 'lucide-react';
import './AssignmentWizard.css';
import { showDialog } from '../../components/ui/Dialog';

const AssignmentWizard: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const basePath = getRole() === 'ta' ? '/ta' : '/faculty';
    const isEditing = !!assignmentId;

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
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [rubric, setRubric] = useState<RubricConfig>({
        title: '',
        weighted: false,
        sections: [
            { id: 'sec-1', title: '', items: [{ id: 'crit-1', name: '', weight: null, maxPoints: null, comment: '' }] }
        ]
    });

    const descriptionRef = useRef<HTMLDivElement>(null);
    const attachmentInputRef = useRef<HTMLInputElement>(null);

    const API_BASE = useMemo(
        () => import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
        []
    );

    useEffect(() => {
        if (isEditing && assignmentId) {
            Promise.all([
                getAssignment(assignmentId),
                getTestCases(assignmentId)
            ]).then(([data, cases]) => {
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

                // Load rubric configuration if present
                if (data.rubric_config) {
                    try {
                        const parsed = typeof data.rubric_config === 'string'
                            ? JSON.parse(data.rubric_config)
                            : data.rubric_config;
                        if (parsed) {
                            if (parsed.sections && Array.isArray(parsed.sections)) {
                                setRubric(parsed as RubricConfig);
                            } else if (parsed.criteria && Array.isArray(parsed.criteria)) {
                                setRubric({
                                    title: parsed.title || '',
                                    weighted: !!parsed.weighted,
                                    sections: [{ id: 'sec-1', title: '', items: parsed.criteria }]
                                });
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to parse rubric_config; using default', e);
                    }
                }
                setLoading(false);
            }).catch(err => {
                console.error(err);
                navigate(`${basePath}/courses/${courseId}`);
            });
        }
    }, [isEditing, assignmentId, courseId, navigate]);

    // When editing loads description from API, reflect it into the editor.
    useEffect(() => {
        if (descriptionRef.current && descriptionRef.current.innerHTML !== formData.description) {
            descriptionRef.current.innerHTML = formData.description || '';
        }
    }, [formData.description]);

    const exec = (command: string, value?: string) => {
        // Ensure editor has focus so execCommand applies to it
        descriptionRef.current?.focus();
        document.execCommand(command, false, value);
        // Sync current HTML back into form state
        const html = descriptionRef.current?.innerHTML ?? '';
        setFormData((prev) => ({ ...prev, description: html }));
    };

    const handleAttachFile = async (file: File) => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${API_BASE}/uploads/attachments`, { method: 'POST', body: form });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        const fileUrl = `${API_BASE.replace('/api', '')}/uploads/${data.filePath}`;
        const safeName = String(data.originalName || file.name).replace(/[<>]/g, '');
        exec(
            'insertHTML',
            `<a class="attachment-bubble" href="${fileUrl}" target="_blank" rel="noreferrer">${safeName}</a>&nbsp;`
        );
    };

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
            const confirmed = await showDialog({
                title: 'Delete Test Case',
                message: 'Are you sure you want to delete this test case?',
                type: 'danger',
                confirmText: 'Delete',
                cancelText: 'Cancel',
            });
            if (!confirmed) return;
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

            const sections = rubric.sections ?? (rubric.criteria ? [{ id: 'sec-1', title: '', items: rubric.criteria }] : []);
            const hasRubricContent =
                rubric.title.trim().length > 0 ||
                sections.some(sec => (sec.title && sec.title.trim().length > 0) || sec.items.some(c => c.name && c.name.trim().length > 0));
            const rubricToSave = { ...rubric, sections };
            const rubricConfigPayload = hasRubricContent ? JSON.stringify(rubricToSave) : null;

            const payload = {
                ...formData,
                points: formData.points === '' ? 0 : Number(formData.points),
                late_penalty_value: formData.late_penalty_value === '' ? 0 : Number(formData.late_penalty_value),
                late_penalty_cap: formData.late_penalty_cap === '' ? 0 : Number(formData.late_penalty_cap),
                due_date: combinedDateTime,
                starter_code_path: starterCodePath,
                test_case_file_path: testCaseFilePath,
                rubric_config: rubricConfigPayload
            };
            const { due_time, ...finalPayload } = payload;

            let finalAssignmentId = assignmentId;
            if (isEditing && assignmentId) {
                await updateAssignment(assignmentId, finalPayload);
            } else {
                if (!courseId) return;
                const newAssignment = await createAssignment({
                    ...finalPayload,
                    course_id: courseId,
                });
                finalAssignmentId = newAssignment.id;
            }

            // Sync test cases
            if (finalAssignmentId) {
                for (const tc of testCases) {
                    const tcPayload = {
                        ...tc,
                        points: tc.points === '' || tc.points === undefined ? 0 : Number(tc.points)
                    };
                    if (tc.id) {
                        await updateTestCase(tc.id, tcPayload);
                    } else {
                        await createTestCase({ ...tcPayload, assignment_id: finalAssignmentId });
                    }
                }
            }

            navigate(`${basePath}/courses/${courseId}`);
        } catch (err: any) {
            console.error('Failed to save', err);
            const message = err.message || 'Unknown error';
            await showDialog({ title: 'Save Failed', message: `Failed to save assignment and test cases: ${message}`, confirmText: 'OK' });
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
                    <div className="rich-editor">
                        <div className="rich-toolbar" role="toolbar" aria-label="Description editor toolbar">
                            <button type="button" className="rich-btn" onClick={() => exec('bold')} title="Bold">
                                <Bold size={16} />
                            </button>
                            <button type="button" className="rich-btn" onClick={() => exec('italic')} title="Italic">
                                <Italic size={16} />
                            </button>
                            <button type="button" className="rich-btn" onClick={() => exec('underline')} title="Underline">
                                <Underline size={16} />
                            </button>
                            <span className="rich-divider" />
                            <button type="button" className="rich-btn" onClick={() => exec('insertUnorderedList')} title="Bullet list">
                                <List size={16} />
                            </button>
                            <button type="button" className="rich-btn" onClick={() => exec('insertOrderedList')} title="Numbered list">
                                <ListOrdered size={16} />
                            </button>
                            <span className="rich-divider" />
                            <button
                                type="button"
                                className="rich-btn"
                                onClick={async () => {
                                    const url = window.prompt('Paste a link URL');
                                    if (!url) return;
                                    exec('createLink', url);
                                }}
                                title="Insert link"
                            >
                                <Link2 size={16} />
                            </button>
                            <button
                                type="button"
                                className="rich-btn"
                                onClick={() => attachmentInputRef.current?.click()}
                                title="Upload attachment"
                            >
                                <Paperclip size={16} />
                            </button>
                            <button type="button" className="rich-btn" onClick={() => exec('removeFormat')} title="Clear formatting">
                                <RemoveFormatting size={16} />
                            </button>
                        </div>

                        <div
                            ref={descriptionRef}
                            className="rich-content"
                            contentEditable
                            role="textbox"
                            aria-multiline="true"
                            onInput={() => setFormData((prev) => ({ ...prev, description: descriptionRef.current?.innerHTML ?? '' }))}
                            onBlur={() => setFormData((prev) => ({ ...prev, description: descriptionRef.current?.innerHTML ?? '' }))}
                            data-placeholder="Enter assignment instructions…"
                        />

                        <input
                            ref={attachmentInputRef}
                            type="file"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                try {
                                    await handleAttachFile(f);
                                } catch (err) {
                                    const msg = err instanceof Error ? err.message : String(err);
                                    await showDialog({ title: 'Upload failed', message: msg, confirmText: 'OK' });
                                } finally {
                                    e.currentTarget.value = '';
                                }
                            }}
                        />
                    </div>
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

                {/* Rubric configuration */}
                <div className="form-group">
                    <label className="form-label">Grading Rubric</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Rubric title (e.g. Project 1 Rubric)"
                        value={rubric.title}
                        onChange={e => setRubric({ ...rubric, title: e.target.value })}
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Rubric Type</label>
                        <select
                            className="form-select"
                            value={rubric.weighted ? 'weighted' : 'unweighted'}
                            onChange={e => setRubric({ ...rubric, weighted: e.target.value === 'weighted' })}
                        >
                            <option value="unweighted">Unweighted (all criteria equal)</option>
                            <option value="weighted">Weighted (specify weights)</option>
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Criteria</label>
                    {(rubric.sections ?? []).map((section, secIndex) => (
                        <div key={section.id} className="rubric-section-block" style={{ marginBottom: '1.5rem', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
                            <div style={{ background: '#e5e7eb', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: 8, color: '#000' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Section (e.g. Correctness)"
                                    value={section.title}
                                    onChange={e => {
                                        const next = [...(rubric.sections ?? [])];
                                        next[secIndex] = { ...next[secIndex], title: e.target.value };
                                        setRubric({ ...rubric, sections: next });
                                    }}
                                    style={{ flex: 1, maxWidth: 320, fontWeight: 600, border: 'none', background: 'transparent', color: '#000' }}
                                />
                                <button
                                    type="button"
                                    className="icon-button"
                                    onClick={() => {
                                        const next = (rubric.sections ?? []).filter((_, i) => i !== secIndex);
                                        if (next.length === 0) return;
                                        setRubric({ ...rubric, sections: next });
                                    }}
                                    title="Remove section"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <div className="rubric-table-wrapper">
                                <table className="rubric-table">
                                    <thead>
                                        <tr>
                                            <th>Criterion</th>
                                            {rubric.weighted && <th style={{ width: '90px' }}>Weight %</th>}
                                            <th style={{ width: '110px' }}>Max Points</th>
                                            <th>Comments / Notes</th>
                                            <th style={{ width: '40px' }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {section.items.map((crit, index) => (
                                            <tr key={crit.id}>
                                                <td>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        placeholder="e.g. Correct Output"
                                                        value={crit.name || ''}
                                                        onChange={e => {
                                                            const next = [...(rubric.sections ?? [])];
                                                            const items = [...next[secIndex].items];
                                                            items[index] = { ...items[index], name: e.target.value };
                                                            next[secIndex] = { ...next[secIndex], items };
                                                            setRubric({ ...rubric, sections: next });
                                                        }}
                                                    />
                                                </td>
                                                {rubric.weighted && (
                                                    <td>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            min={0}
                                                            max={100}
                                                            value={crit.weight ?? ''}
                                                            onChange={e => {
                                                                const value = e.target.value === '' ? null : Number(e.target.value);
                                                                const next = [...(rubric.sections ?? [])];
                                                                const items = [...next[secIndex].items];
                                                                items[index] = { ...items[index], weight: value };
                                                                next[secIndex] = { ...next[secIndex], items };
                                                                setRubric({ ...rubric, sections: next });
                                                            }}
                                                        />
                                                    </td>
                                                )}
                                                <td>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        min={0}
                                                        value={crit.maxPoints ?? ''}
                                                        onChange={e => {
                                                            const value = e.target.value === '' ? null : Number(e.target.value);
                                                            const next = [...(rubric.sections ?? [])];
                                                            const items = [...next[secIndex].items];
                                                            items[index] = { ...items[index], maxPoints: value };
                                                            next[secIndex] = { ...next[secIndex], items };
                                                            setRubric({ ...rubric, sections: next });
                                                        }}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        placeholder="Instructor comments or guidelines"
                                                        value={crit.comment ?? ''}
                                                        onChange={e => {
                                                            const next = [...(rubric.sections ?? [])];
                                                            const items = [...next[secIndex].items];
                                                            items[index] = { ...items[index], comment: e.target.value };
                                                            next[secIndex] = { ...next[secIndex], items };
                                                            setRubric({ ...rubric, sections: next });
                                                        }}
                                                    />
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="icon-button"
                                                        onClick={() => {
                                                            const next = [...(rubric.sections ?? [])];
                                                            const items = next[secIndex].items.filter((_, i) => i !== index);
                                                            if (items.length === 0) return;
                                                            next[secIndex] = { ...next[secIndex], items };
                                                            setRubric({ ...rubric, sections: next });
                                                        }}
                                                        title="Remove criterion"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border-color)' }}>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const next = [...(rubric.sections ?? [])];
                                        const items = [...next[secIndex].items];
                                        items.push({ id: `crit-${section.id}-${Date.now()}`, name: '', weight: null, maxPoints: null, comment: '' });
                                        next[secIndex] = { ...next[secIndex], items };
                                        setRubric({ ...rubric, sections: next });
                                    }}
                                >
                                    <Plus className="icon-left" size={16} />
                                    Add Criterion
                                </Button>
                            </div>
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            const sections = rubric.sections ?? [];
                            setRubric({
                                ...rubric,
                                sections: [
                                    ...sections,
                                    { id: `sec-${Date.now()}`, title: 'New Section', items: [{ id: `crit-${Date.now()}`, name: '', weight: null, maxPoints: null, comment: '' }] }
                                ]
                            });
                        }}
                    >
                        <Plus className="icon-left" size={16} />
                        Add Section
                    </Button>
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
