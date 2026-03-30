import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAssignment, createAssignment, updateAssignment, uploadStarterCode, getTestCases, createTestCase, updateTestCase, deleteTestCase, getEnrolledStudents, getAssignmentGroups, getSubmissions, deleteAssignment, UPLOADS_BASE } from '../../lib/api';
import type { TestCase, RubricConfig, User } from '../../lib/api';
import { getRole } from '../../lib/auth';

import { Button } from '../../components/ui/Button';
import { Bold, Italic, Underline, List, ListOrdered, Link2, Paperclip, RemoveFormatting, Trash2, Eye, EyeOff, Plus, X, Edit, BarChart2, Download, ChevronLeft } from 'lucide-react';
import './AssignmentWizard.css';
import { showDialog } from '../../components/ui/Dialog';

export interface AssignmentWizardProps {
    /** Read-only view of an existing assignment (same layout as edit; use Edit to open the editor). */
    viewOnly?: boolean;
}

const AssignmentWizard: React.FC<AssignmentWizardProps> = ({ viewOnly = false }) => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const basePath = getRole() === 'ta' ? '/ta' : '/faculty';
    const isEditing = !!assignmentId;
    const readOnly = viewOnly;

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
        group_submission_type: 'one_for_all' as 'one_for_all' | 'individual',
        max_group_members: '',
        late_penalty_enabled: false,
        late_penalty_type: 'per_day' as 'per_day' | 'per_hour' | 'fixed',
        late_penalty_value: '10' as string | number,
        late_penalty_cap: '50' as string | number
    });
    // existingStarterPaths: already-uploaded paths (from DB); starterCodeFiles: new local files pending upload
    const [existingStarterPaths, setExistingStarterPaths] = useState<string[]>([]);
    const [starterCodeFiles, setStarterCodeFiles] = useState<File[]>([]);
    const [testCaseFile, setTestCaseFile] = useState<File | null>(null);
    const [testCases, setTestCases] = useState<(Omit<Partial<TestCase>, 'points'> & { points?: number | string })[]>([]);
    const [enrolledStudents, setEnrolledStudents] = useState<User[]>([]);
    const [assignmentGroups, setAssignmentGroups] = useState<{ id: string; name: string; students: string[] }[]>([]);
    const [loading, setLoading] = useState(isEditing || viewOnly);
    const [saving, setSaving] = useState(false);
    const [submissionCount, setSubmissionCount] = useState<number | null>(null);
    const [rubric, setRubric] = useState<RubricConfig>({
        title: '',
        weighted: false,
        sections: [
            { id: 'sec-1', title: '', items: [{ id: 'crit-1', name: '', weight: null, maxPoints: null, comment: '' }] }
        ]
    });

    const descriptionRef = useRef<HTMLDivElement>(null);
    const attachmentInputRef = useRef<HTMLInputElement>(null);

    const API_BASE = `${UPLOADS_BASE}/api`;

    useEffect(() => {
        if (!viewOnly || !assignmentId) {
            setSubmissionCount(null);
            return;
        }
        getSubmissions({ assignment_id: assignmentId })
            .then((subs) => setSubmissionCount(subs.length))
            .catch(() => setSubmissionCount(0));
    }, [viewOnly, assignmentId]);

    useEffect(() => {
        if (courseId) {
            getEnrolledStudents(courseId).then(setEnrolledStudents).catch(() => console.error('Failed to load students'));
        }

        if (isEditing && assignmentId) {
            Promise.all([
                getAssignment(assignmentId),
                getTestCases(assignmentId),
                getAssignmentGroups(assignmentId).catch(() => [])
            ]).then(([data, cases, groups]) => {
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
                    group_submission_type: data.group_submission_type || 'one_for_all',
                    max_group_members: data.max_group_members ? String(data.max_group_members) : '',
                    late_penalty_enabled: !!(data.late_penalty_enabled === true || data.late_penalty_enabled === 1),
                    late_penalty_type: (data.late_penalty_type as 'per_day' | 'per_hour' | 'fixed') || 'per_day',
                    late_penalty_value: data.late_penalty_value != null ? data.late_penalty_value : 10,
                    late_penalty_cap: data.late_penalty_cap != null ? data.late_penalty_cap : 50
                });
                // Parse existing starter code paths (supports both plain string and JSON array)
                if (data.starter_code_path) {
                    try {
                        const parsed = JSON.parse(data.starter_code_path);
                        setExistingStarterPaths(Array.isArray(parsed) ? parsed : [data.starter_code_path]);
                    } catch {
                        setExistingStarterPaths([data.starter_code_path]);
                    }
                }
                setTestCases(cases.map(tc => ({ ...tc, points: tc.points })));
                if (groups && groups.length > 0) {
                    setAssignmentGroups(groups.map(g => ({
                        id: g.id,
                        name: g.name,
                        students: g.students.map(s => s.id)
                    })));
                }

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
        const fileUrl = `${UPLOADS_BASE}/uploads/${data.filePath}`;
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
            if (formData.type === 'group') {
                const invalidGroup = assignmentGroups.find(g => g.students.length < 2);
                if (invalidGroup) {
                    await showDialog({
                        title: 'Invalid Group',
                        message: `Group "${invalidGroup.name}" has ${invalidGroup.students.length} members. A group must have at least 2 members to be formed. Please add more students or remove the group.`,
                        type: 'alert',
                        confirmText: 'OK',
                    });
                    setSaving(false);
                    return;
                }
            }

            let starterCodePath = formData.starter_code_path;
            let testCaseFilePath = formData.test_case_file_path;

            // Upload any new files and merge with remaining existing paths
            const newPaths = await Promise.all(
                starterCodeFiles.map(f => uploadStarterCode(f).then(r => r.filePath))
            );
            const allPaths = [...existingStarterPaths, ...newPaths];
            if (allPaths.length === 0) {
                starterCodePath = '';
            } else if (allPaths.length === 1) {
                starterCodePath = allPaths[0];
            } else {
                starterCodePath = JSON.stringify(allPaths);
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
                rubric_config: rubricConfigPayload,
                max_group_members: formData.type === 'group' && formData.max_group_members ? Number(formData.max_group_members) : null,
                groups: formData.type === 'group' ? assignmentGroups : undefined
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

    const handleDeleteAssignmentView = async () => {
        if (!assignmentId || !courseId) return;
        const confirmed = await showDialog({
            title: 'Delete Assignment',
            message: `Are you sure you want to delete "${formData.title}"? This will also delete all submissions.`,
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel',
        });
        if (!confirmed) return;
        try {
            await deleteAssignment(assignmentId);
            navigate(`${basePath}/courses/${courseId}/assignments`);
        } catch (err) {
            console.error(err);
            await showDialog({ title: 'Error', message: 'Failed to delete assignment', confirmText: 'OK' });
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;

    const editHref = assignmentId ? `${basePath}/courses/${courseId}/assignments/${assignmentId}/edit` : '';
    const gradingHref = assignmentId ? `${basePath}/courses/${courseId}/assignments/${assignmentId}/grading` : '';

    return (
        <div className={`assignment-wizard-container${readOnly ? ' view-only' : ''}`}>
            {readOnly && (
                <div className="wizard-view-header">
                    <button
                        type="button"
                        className="wizard-back-to-assignments"
                        onClick={() => courseId && navigate(`${basePath}/courses/${courseId}/assignments`)}
                    >
                        <ChevronLeft size={16} />
                        Back to assignments
                    </button>
                    <div className="wizard-view-header-row">
                        <h1 className="wizard-title wizard-title-view">{formData.title || 'Assignment'}</h1>
                        <div className="wizard-view-actions">
                            <Button type="button" variant="outline" size="sm" onClick={() => courseId && navigate(`${basePath}/courses/${courseId}/gradebook`)}>
                                <Download size={16} />
                                Grades
                            </Button>
                            <Button type="button" variant="primary" size="sm" onClick={() => gradingHref && navigate(gradingHref)}>
                                <BarChart2 size={16} />
                                Grade
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => editHref && navigate(editHref)}>
                                <Edit size={16} />
                                Edit
                            </Button>
                            <Button type="button" variant="danger" size="sm" onClick={handleDeleteAssignmentView}>
                                <Trash2 size={16} />
                                Delete
                            </Button>
                        </div>
                    </div>
                    {submissionCount !== null && (
                        <p className="wizard-submission-count">Submissions: {submissionCount}</p>
                    )}
                </div>
            )}
            {!readOnly && (
                <h1 className="wizard-title">
                    {isEditing ? 'Edit Assignment' : 'Create New Assignment'}
                </h1>
            )}

            <form onSubmit={readOnly ? (e) => e.preventDefault() : handleSubmit} className="wizard-form">
                <div className={readOnly ? 'wizard-readonly-inner' : undefined}>
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
                        {!readOnly && (
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
                        )}

                        <div
                            ref={descriptionRef}
                            className="rich-content"
                            contentEditable={!readOnly}
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

                {formData.type === 'group' && (
                    <div className="test-cases-section" style={{ borderTop: 'none', paddingTop: 0, marginTop: '1rem' }}>
                        <div className="section-header-wizard">
                            <h2 className="section-title-wizard">Group Configuration</h2>
                        </div>
                        
                        <div className="test-case-item glass-card" style={{ marginBottom: '2rem' }}>
                            <div className="tc-grid">
                                <div className="form-group">
                                    <label className="tc-label">Max Group Members</label>
                                    <input
                                        type="number"
                                        min="2"
                                        className="tc-input"
                                        value={formData.max_group_members}
                                        placeholder="e.g. 4"
                                        onChange={e => setFormData({ ...formData, max_group_members: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="tc-label">Submission Policy</label>
                                    <select
                                        className="form-select"
                                        style={{ height: '100%', borderRadius: 'var(--radius-md)' }}
                                        value={formData.group_submission_type}
                                        onChange={e => setFormData({ ...formData, group_submission_type: e.target.value as any })}
                                    >
                                        <option value="one_for_all">One submission per group</option>
                                        <option value="individual">Individual submissions required</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="form-group" style={{ marginTop: '1.5rem' }}>
                            <div className="section-header-wizard">
                                <h2 className="section-title-wizard">Manage Groups</h2>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => {
                                        const newGroup = { id: `grp-${Date.now()}`, name: `Group ${assignmentGroups.length + 1}`, students: [] };
                                        setAssignmentGroups([...assignmentGroups, newGroup]);
                                    }}
                                >
                                    <Plus size={16} /> Add Group
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => {
                                        const max = parseInt(formData.max_group_members as string) || 2;
                                        const unassigned = enrolledStudents.filter(s => !assignmentGroups.some(g => g.students.includes(s.id)));
                                        if (unassigned.length === 0) return;

                                        const shuffled = [...unassigned].sort(() => 0.5 - Math.random());
                                        const newGroups = [...assignmentGroups];

                                        // Fill existing groups that aren't full first
                                        let studentIndex = 0;
                                        for (let group of newGroups) {
                                            while (group.students.length < max && studentIndex < shuffled.length) {
                                                group.students.push(shuffled[studentIndex].id);
                                                studentIndex++;
                                            }
                                        }

                                        // If there are still unassigned students, create new groups for them evenly
                                        const remainingStudents = shuffled.slice(studentIndex);
                                        if (remainingStudents.length > 0) {
                                            const numNewGroups = Math.ceil(remainingStudents.length / max);
                                            const startingIndex = newGroups.length;

                                            for (let i = 0; i < numNewGroups; i++) {
                                                newGroups.push({ id: `grp-${Date.now()}-${i}`, name: `Group ${startingIndex + i + 1}`, students: [] });
                                            }

                                            remainingStudents.forEach((student, idx) => {
                                                const groupIdx = startingIndex + (idx % numNewGroups);
                                                newGroups[groupIdx].students.push(student.id);
                                            });
                                        }
                                        setAssignmentGroups(newGroups);
                                    }}
                                >
                                    Randomly Assign
                                </Button>
                            </div>
                            <div className="groups-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                {assignmentGroups.map((group, groupIndex) => (
                                    <div key={group.id} className="group-card" style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '0.5rem', backgroundColor: 'var(--bg-primary)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                            <input
                                                type="text"
                                                value={group.name}
                                                className="form-input"
                                                style={{ width: '150px', padding: '0.25rem 0.5rem', fontWeight: 'bold' }}
                                                onChange={e => {
                                                    const newGroups = [...assignmentGroups];
                                                    newGroups[groupIndex].name = e.target.value;
                                                    setAssignmentGroups(newGroups);
                                                }}
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                type="button"
                                                className="text-red-500 hover:bg-red-500/10 border-transparent hover:border-red-500/20"
                                                onClick={() => {
                                                    setAssignmentGroups(assignmentGroups.filter((_, i) => i !== groupIndex));
                                                }}
                                            >
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                        <div className="group-students">
                                            {group.students.map(studentId => {
                                                const student = enrolledStudents.find(s => s.id === studentId);
                                                return (
                                                    <div key={studentId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0.5rem', background: 'var(--bg-secondary)', marginBottom: '0.25rem', borderRadius: '0.25rem', border: '1px solid var(--border)', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.875rem' }}>{student?.name || studentId}</span>
                                                        <button
                                                            type="button"
                                                            onClick={e => {
                                                                e.preventDefault();
                                                                const newGroups = [...assignmentGroups];
                                                                newGroups[groupIndex].students = newGroups[groupIndex].students.filter(id => id !== studentId);
                                                                setAssignmentGroups(newGroups);
                                                            }}
                                                            style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0' }}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            <select
                                                className="form-select"
                                                style={{ padding: '0.25rem', fontSize: '0.875rem', marginTop: '0.5rem' }}
                                                value=""
                                                onChange={e => {
                                                    if (!e.target.value) return;
                                                    const newGroups = [...assignmentGroups];
                                                    if (!newGroups[groupIndex].students.includes(e.target.value)) {
                                                        newGroups[groupIndex].students.push(e.target.value);
                                                    }
                                                    setAssignmentGroups(newGroups);
                                                }}
                                            >
                                                <option value="">+ Add student</option>
                                                {enrolledStudents
                                                    .filter(s => !assignmentGroups.some(g => g.students.includes(s.id)))
                                                    .map(s => (
                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                    ))}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

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
                            <option value="c">C</option>
                            <option value="javascript">JavaScript</option>
                            <option value="typescript">TypeScript</option>
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Starter Code (ZIP or individual file)</label>
                    <div className="upload-box-wizard">
                        <input
                            type="file"
                            multiple
                            onChange={e => {
                                if (e.target.files && e.target.files.length > 0) {
                                    const picked = Array.from(e.target.files);
                                    setStarterCodeFiles(prev => [...prev, ...picked]);
                                    e.target.value = '';
                                }
                            }}
                            className="form-input-file"
                        />
                        {(existingStarterPaths.length > 0 || starterCodeFiles.length > 0) && (
                            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {existingStarterPaths.map((p, i) => (
                                    <div key={`existing-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', background: 'var(--bg-body)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                                        <span className="active-filename" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                            {p.replace(/^\d+-\d+-/, '')}
                                        </span>
                                        <button type="button" onClick={() => setExistingStarterPaths(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', flexShrink: 0 }} title="Remove">
                                            <X size={13} />
                                        </button>
                                    </div>
                                ))}
                                {starterCodeFiles.map((f, i) => (
                                    <div key={`new-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', background: 'color-mix(in srgb, var(--primary-color) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--primary-color) 25%, transparent)', borderRadius: '6px' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary-text)', background: 'color-mix(in srgb, var(--primary-color) 15%, transparent)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>NEW</span>
                                        <span className="active-filename" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{f.name}</span>
                                        <button type="button" onClick={() => setStarterCodeFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', flexShrink: 0 }} title="Remove">
                                            <X size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
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

                </div>

                {readOnly ? (
                    <div className="form-actions">
                        <Button type="button" variant="ghost" onClick={() => navigate(`${basePath}/courses/${courseId}/assignments`)}>
                            Back to assignments
                        </Button>
                    </div>
                ) : (
                    <div className="form-actions">
                        <Button type="button" variant="ghost" onClick={() => navigate(`${basePath}/courses/${courseId}`)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving...' : (isEditing ? 'Update Assignment' : 'Create Assignment')}
                        </Button>
                    </div>
                )}
            </form>
        </div>
    );
};

export default AssignmentWizard;
