import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAssignment, createAssignment, updateAssignment, uploadStarterCode, getTestCases, createTestCase, updateTestCase, deleteTestCase, importTestCases } from '../../lib/api';
import type { TestCase } from '../../lib/api';

import { Button } from '../../components/ui/Button';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import './AssignmentWizard.css';

const AssignmentWizard: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(assignmentId && assignmentId !== 'new');

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        due_date: '',
        due_time: '23:59',
        status: 'active' as 'active' | 'closed' | 'late',
        points: 100,
        language: '',
        starter_code_path: '',
        style_points_possible: 0,
        efficiency_points_possible: 0,
        java_main_class: '',
        run_mode: 'program' as 'program' | 'function',
    });
    const [starterCodeFile, setStarterCodeFile] = useState<File | null>(null);
    const [testCases, setTestCases] = useState<Partial<TestCase>[]>([]);
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        if (!isEditing || !assignmentId) return;
        setLoading(true);
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
                style_points_possible: data.style_points_possible ?? 0,
                efficiency_points_possible: data.efficiency_points_possible ?? 0,
                java_main_class: (data as any).java_main_class || '',
                run_mode: (data as any).run_mode === 'function' ? 'function' : 'program',
            });
            setTestCases(Array.isArray(cases) ? cases : []);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            navigate(`/faculty/courses/${courseId}`);
        });
    }, [isEditing, assignmentId, courseId, navigate]);

    const handleAddTestCase = () => {
        setTestCases([...testCases, {
            input: '',
            expected_output: '',
            points: 0,
            is_public: 1,
            input_type: 'stdin',
            input_filename: undefined,
            output_filename: undefined,
            run_args: undefined,
            output_filename_2: undefined,
            expected_output_2: undefined,
            compare_mode: 'exact',
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

    /** Parse CSV text into test case rows (input, expected_output, points). Skip header row if present. */
    const parseCsvToTestCases = (text: string): Partial<TestCase>[] => {
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
        const rows: Partial<TestCase>[] = [];
        for (const line of lines) {
            const parts: string[] = [];
            let pos = 0;
            while (pos < line.length) {
                if (line[pos] === '"') {
                    let end = pos + 1;
                    while (end < line.length && (line[end] !== '"' || line[end + 1] === '"')) {
                        if (line[end] === '"' && line[end + 1] === '"') end += 2;
                        else end += 1;
                    }
                    parts.push(line.slice(pos + 1, end).replace(/""/g, '"'));
                    pos = line[end] === '"' ? end + 1 : end + 2;
                } else {
                    const comma = line.indexOf(',', pos);
                    const slice = comma === -1 ? line.slice(pos) : line.slice(pos, comma);
                    parts.push(slice.trim());
                    pos = comma === -1 ? line.length : comma + 1;
                }
            }
            const input = parts[0] ?? '';
            const expected_output = parts[1] ?? '';
            const points = parts[2] != null ? parseInt(parts[2], 10) || 0 : 0;
            if (input === 'input' && expected_output === 'expected_output') continue;
            rows.push({ input, expected_output, points, is_public: 1 });
        }
        return rows;
    };

    const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        try {
            if (isEditing && assignmentId) {
                const result = await importTestCases(assignmentId, file);
                const cases = await getTestCases(assignmentId);
                setTestCases(cases);
                alert(result.message);
            } else {
                const text = await file.text();
                const parsed = parseCsvToTestCases(text);
                if (parsed.length === 0) {
                    alert('No valid rows found. Use CSV with columns: input, expected_output, points');
                } else {
                    setTestCases((prev) => [...prev, ...parsed]);
                    alert(`Added ${parsed.length} test case(s) from CSV.`);
                }
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            let starterCodePath = formData.starter_code_path;

            if (starterCodeFile) {
                const uploadResult = await uploadStarterCode(starterCodeFile);
                starterCodePath = uploadResult.filePath;
            }

            const combinedDateTime = new Date(`${formData.due_date}T${formData.due_time}:00`).toISOString();

            const payload = {
                ...formData,
                due_date: combinedDateTime,
                starter_code_path: starterCodePath,
                style_points_possible: formData.style_points_possible,
                efficiency_points_possible: formData.efficiency_points_possible,
                java_main_class: formData.java_main_class || null,
                run_mode: formData.run_mode,
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
                    if (tc.id) {
                        await updateTestCase(tc.id, tc);
                    } else {
                        await createTestCase({ ...tc, assignment_id: finalAssignmentId });
                    }
                }
            }

            // After creating a new assignment, go to its edit page so test cases load on refresh
            if (!isEditing && finalAssignmentId) {
                navigate(`/faculty/courses/${courseId}/assignments/${finalAssignmentId}/edit`);
            } else {
                navigate(`/faculty/courses/${courseId}`);
            }
        } catch (err) {
            console.error('Failed to save', err);
            alert('Failed to save assignment and test cases');
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
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <input
                                type="date"
                                required
                                className="form-input"
                                value={formData.due_date}
                                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                                style={{ flex: 2 }}
                            />
                            <input
                                type="time"
                                required
                                className="form-input"
                                value={formData.due_time}
                                onChange={e => setFormData({ ...formData, due_time: e.target.value })}
                                style={{ flex: 1 }}
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
                            onChange={e => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
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

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Submission style</label>
                        <select
                            className="form-select"
                            value={formData.run_mode}
                            onChange={e => setFormData({ ...formData, run_mode: e.target.value as 'program' | 'function' })}
                        >
                            <option value="program">Program (stdin/stdout or files)</option>
                            <option value="function">Function (LeetCode-style)</option>
                        </select>
                        {formData.run_mode === 'function' && (
                            <span className="form-hint">Students define a single function <code>solution(input_str)</code>; we run it with each test input and compare the return value. No I/O code needed.</span>
                        )}
                    </div>
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
                    {formData.language === 'java' && (
                        <div className="form-group">
                            <label className="form-label">Java main class</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="e.g. LoadShipping"
                                value={formData.java_main_class}
                                onChange={e => setFormData({ ...formData, java_main_class: e.target.value })}
                            />
                            <span className="form-hint">Required if spec uses a specific class (e.g. LoadShipping). Leave blank to infer from filename.</span>
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label">Style (possible points)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.5"
                            className="form-input"
                            value={formData.style_points_possible}
                            onChange={e => setFormData({ ...formData, style_points_possible: parseFloat(e.target.value) || 0 })}
                            placeholder="0 = not used"
                        />
                        <span className="form-hint">Set to 0 if not used. Faculty can set any value.</span>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Efficiency (possible points)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.5"
                            className="form-input"
                            value={formData.efficiency_points_possible}
                            onChange={e => setFormData({ ...formData, efficiency_points_possible: parseFloat(e.target.value) || 0 })}
                            placeholder="0 = not used"
                        />
                        <span className="form-hint">Set to 0 if not used. Faculty can set any value.</span>
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
                                Current: <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{formData.starter_code_path}</span>
                            </p>
                        )}
                    </div>
                </div>

                <div className="test-cases-section">
                    <div className="section-header-wizard">
                        <h2 className="section-title-wizard">Test Cases</h2>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                type="file"
                                accept=".csv"
                                id="import-csv"
                                style={{ display: 'none' }}
                                onChange={handleImportCsv}
                            />
                            <Button type="button" variant="outline" size="sm" disabled={importing} onClick={() => document.getElementById('import-csv')?.click()}>
                                {importing ? 'Importing…' : 'Import from CSV'}
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={handleAddTestCase}>
                                <Plus size={16} /> Add Test Case
                            </Button>
                        </div>
                    </div>
                    <p className="empty-state-text" style={{ fontSize: '12px', marginBottom: '8px' }}>
                        CSV format: input, expected_output, points (optional header row). To deduct points per wrong line, add one test case per check and set points each (e.g. 25 per test).
                    </p>

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
                                    <div className="tc-io-mode">
                                        <div className="form-group" style={{ minWidth: '100px' }}>
                                            <label className="tc-label">Input</label>
                                            <select
                                                className="form-select"
                                                value={(tc.input_type as string) || 'stdin'}
                                                onChange={e => handleTestCaseChange(idx, 'input_type', e.target.value)}
                                            >
                                                <option value="stdin">stdin</option>
                                                <option value="file">From file</option>
                                                <option value="file_and_stdin">File + stdin</option>
                                            </select>
                                            {((tc.input_type as string) === 'file' || (tc.input_type as string) === 'file_and_stdin') && (
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    placeholder="e.g. input.txt"
                                                    value={tc.input_filename || ''}
                                                    onChange={e => handleTestCaseChange(idx, 'input_filename', e.target.value || undefined)}
                                                    style={{ marginTop: 6 }}
                                                />
                                            )}
                                        </div>
                                        <div className="form-group" style={{ minWidth: '100px' }}>
                                            <label className="tc-label">Output</label>
                                            <select
                                                className="form-select"
                                                value={tc.output_filename ? 'file' : 'stdout'}
                                                onChange={e => {
                                                    const useFile = e.target.value === 'file';
                                                    handleTestCaseChange(idx, 'output_filename', useFile ? 'output.txt' : undefined);
                                                }}
                                            >
                                                <option value="stdout">stdout</option>
                                                <option value="file">From file</option>
                                            </select>
                                            {tc.output_filename && (
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    placeholder="e.g. output.txt"
                                                    value={tc.output_filename || ''}
                                                    onChange={e => handleTestCaseChange(idx, 'output_filename', e.target.value || undefined)}
                                                    style={{ marginTop: 6 }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 8 }}>
                                        <label className="tc-label">CLI arguments (optional)</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder='e.g. ["input.txt", "output.txt"] or input.txt, output.txt'
                                            value={typeof tc.run_args === 'string' ? tc.run_args : ''}
                                            onChange={e => handleTestCaseChange(idx, 'run_args', e.target.value || undefined)}
                                        />
                                        <span className="form-hint">Passed to the program (e.g. java Main input.txt output.txt).</span>
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 8 }}>
                                        <label className="tc-label">Compare mode</label>
                                        <select
                                            className="form-select"
                                            value={(tc.compare_mode as string) || 'exact'}
                                            onChange={e => handleTestCaseChange(idx, 'compare_mode', e.target.value as 'exact' | 'lines_unordered' | 'run_only')}
                                        >
                                            <option value="exact">Exact match</option>
                                            <option value="lines_unordered">Match lines (any order)</option>
                                            <option value="run_only">Run only (no output check)</option>
                                        </select>
                                        {(tc.compare_mode as string) === 'run_only' && (
                                            <span className="form-hint">Full points if the program runs and exits 0. Use for open-ended or “make your own” assignments.</span>
                                        )}
                                    </div>
                                    {(Boolean(tc.output_filename_2 || tc.expected_output_2)) && (
                                        <div className="tc-grid" style={{ marginTop: 8 }}>
                                            <div className="form-group">
                                                <label className="tc-label">Second output file name</label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    placeholder="e.g. error.txt"
                                                    value={tc.output_filename_2 || ''}
                                                    onChange={e => handleTestCaseChange(idx, 'output_filename_2', e.target.value || undefined)}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="tc-label">Expected second output</label>
                                                <textarea
                                                    className="tc-textarea"
                                                    value={tc.expected_output_2 || ''}
                                                    onChange={e => handleTestCaseChange(idx, 'expected_output_2', e.target.value)}
                                                    placeholder="Expected content of second file"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {!(tc.output_filename_2 || tc.expected_output_2) && (
                                        <div style={{ marginBottom: 8 }}>
                                            <button
                                                type="button"
                                                className="tc-toggle-btn outline"
                                                onClick={() => handleTestCaseChange(idx, 'output_filename_2', 'error.txt')}
                                            >
                                                + Add second output file (e.g. error report)
                                            </button>
                                        </div>
                                    )}
                                    {((tc.input_type as string) === 'file' || (tc.input_type as string) === 'file_and_stdin') && (
                                        <div className="form-group" style={{ marginBottom: 8 }}>
                                            <label className="tc-label">Stdin (optional, e.g. menu input after reading file)</label>
                                            <textarea
                                                className="tc-textarea"
                                                value={typeof tc.stdin === 'string' ? tc.stdin : ''}
                                                onChange={e => handleTestCaseChange(idx, 'stdin', e.target.value || undefined)}
                                                placeholder="e.g. 2025 then menu choice and options (one per line)"
                                                rows={2}
                                            />
                                            <span className="form-hint">Sent to the program after the file is available. Use for PA3-style: file + menu.</span>
                                        </div>
                                    )}
                                    <div className="tc-grid">
                                        <div className="form-group">
                                            <label className="tc-label">{(tc.input_type as string) === 'file' || (tc.input_type as string) === 'file_and_stdin' ? 'Input file content' : 'Input (stdin)'}</label>
                                            <textarea
                                                className="tc-textarea"
                                                value={tc.input || ''}
                                                onChange={e => handleTestCaseChange(idx, 'input', e.target.value)}
                                                placeholder={(tc.input_type as string) === 'file' || (tc.input_type as string) === 'file_and_stdin' ? 'Content of the input file' : 'e.g. 5\n10'}
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
                                            value={tc.points || 0}
                                            onChange={e => handleTestCaseChange(idx, 'points', parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="form-actions">
                    <Button type="button" variant="ghost" onClick={() => navigate(`/faculty/courses/${courseId}`)} disabled={saving}>
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
