const API_BASE = 'http://localhost:3001/api';

// Generic fetch wrapper with error handling
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, options);
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
    }
    return response.json();
}

// ============ Courses ============

export interface Course {
    id: string;
    name: string;
    term: string;
    is_archived?: boolean;
    created_at?: string;
}

export async function getCourses(): Promise<Course[]> {
    return apiFetch<Course[]>('/courses');
}

export async function getCourse(id: string): Promise<Course> {
    return apiFetch<Course>(`/courses/${id}`);
}

export async function createCourse(course: Course): Promise<Course> {
    return apiFetch<Course>('/courses', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(course),
    });
}

export function getCourseGradesExportUrl(id: string): string {
    return `${API_BASE}/courses/${id}/grades/export`;
}

export function getAssignmentGradesExportUrl(id: string): string {
    return `${API_BASE}/assignments/${id}/grades/export`;
}

export async function updateCourse(id: string, updates: Partial<Course>): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/courses/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
    });
}

// ============ Assignments ============

export interface Assignment {
    id: string;
    course_id: string;
    title: string;
    description?: string;
    due_date: string;
    status: 'active' | 'closed' | 'late';
    points?: number;
    language?: string;
    starter_code_path?: string;
    style_points_possible?: number;
    efficiency_points_possible?: number;
    /** For Java: main class to run (e.g. "LoadShipping"). Overrides inference from filename. */
    java_main_class?: string | null;
    /** 'program' = stdin/stdout or files; 'function' = LeetCode-style, student defines solution(), we call it with test input. */
    run_mode?: 'program' | 'function';
    created_at?: string;
}

export async function getAssignments(): Promise<Assignment[]> {
    return apiFetch<Assignment[]>('/assignments');
}

export async function getAssignment(id: string): Promise<Assignment> {
    return apiFetch<Assignment>(`/assignments/${id}`);
}

export async function getCourseAssignments(courseId: string): Promise<Assignment[]> {
    return apiFetch<Assignment[]>(`/courses/${courseId}/assignments`);
}

export async function createAssignment(assignment: Omit<Assignment, 'id' | 'created_at'> & { id?: string }): Promise<Assignment> {
    return apiFetch<Assignment>('/assignments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(assignment),
    });
}

export async function updateAssignment(id: string, updates: Partial<Assignment>): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/assignments/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
    });
}

export async function deleteAssignment(id: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/assignments/${id}`, {
        method: 'DELETE',
    });
}

// ============ Submissions ============

export interface Submission {
    id: number;
    assignment_id: string;
    student_id: string;
    file_name: string;
    file_path: string;
    file_name_2?: string | null;
    file_path_2?: string | null;
    submitted_at: string;
    updated_at: string;
    status: 'pending' | 'graded' | 'returned';
    grade?: number | null;
    feedback?: string | null;
    correctness_score?: number | null;
    style_points?: number | null;
    efficiency_points?: number | null;
    deduction_points?: number | null;
}

export async function getSubmissions(params?: {
    assignment_id?: string;
    student_id?: string;
}): Promise<Submission[]> {
    const searchParams = new URLSearchParams();
    if (params?.assignment_id) searchParams.set('assignment_id', params.assignment_id);
    if (params?.student_id) searchParams.set('student_id', params.student_id);
    const query = searchParams.toString();
    return apiFetch<Submission[]>(`/submissions${query ? `?${query}` : ''}`);
}

export async function getSubmission(id: number): Promise<Submission> {
    return apiFetch<Submission>(`/submissions/${id}`);
}

export async function createSubmission(
    assignmentId: string,
    studentId: string,
    file: File,
    testCasesFile?: File | null
): Promise<Submission> {
    const formData = new FormData();
    formData.append('assignment_id', assignmentId);
    formData.append('student_id', studentId);
    formData.append('file', file);
    if (testCasesFile) formData.append('testCasesFile', testCasesFile);

    const response = await fetch(`${API_BASE}/submissions`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error.error || 'Upload failed');
    }

    return response.json();
}

export async function updateSubmission(
    id: number,
    data: {
        file?: File;
        status?: string;
        grade?: number;
        feedback?: string;
        style_points?: number | null;
        efficiency_points?: number | null;
        deduction_points?: number | null;
    }
): Promise<Submission> {
    const formData = new FormData();
    if (data.file) formData.append('file', data.file);
    if (data.status) formData.append('status', data.status);
    if (data.grade !== undefined) formData.append('grade', String(data.grade));
    if (data.feedback !== undefined) formData.append('feedback', data.feedback);
    if (data.style_points !== undefined) formData.append('style_points', data.style_points === null ? '' : String(data.style_points));
    if (data.efficiency_points !== undefined) formData.append('efficiency_points', data.efficiency_points === null ? '' : String(data.efficiency_points));
    if (data.deduction_points !== undefined) formData.append('deduction_points', String(data.deduction_points ?? 0));

    const response = await fetch(`${API_BASE}/submissions/${id}`, {
        method: 'PUT',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Update failed' }));
        throw new Error(error.error || 'Update failed');
    }

    return response.json();
}

export async function deleteSubmission(id: number): Promise<void> {
    await apiFetch<{ message: string }>(`/submissions/${id}`, { method: 'DELETE' });
}

// ============ Grader (auto-grade submission) ============

export interface AutoGradeResult {
    grade: number | null;
    feedback: string;
    results: Array<{ testId: number; passed: boolean; points: number; maxPoints: number; actual?: string; expected?: string; error?: string }>;
    rawScore: number;
    maxPossible: number;
    latePenaltyPercent: number;
}

export async function runAutoGrader(submissionId: number, publicOnly = false): Promise<AutoGradeResult> {
    const q = publicOnly ? '?publicOnly=1' : '';
    return apiFetch<AutoGradeResult>(`/grader/submissions/${submissionId}/run${q}`, { method: 'POST' });
}

// Helper to get the full URL for a submitted file
export function getFileUrl(filePath: string): string {
    return `${API_BASE.replace('/api', '')}/uploads/${filePath}`;
}
// --- Calendar API ---

export interface Todo {
    id: string;
    student_id: string;
    course_id?: string;
    title: string;
    due_date?: string;
    completed: boolean;
    created_at?: string;
}

export async function getTodos(params: { student_id: string }): Promise<Todo[]> {
    const res = await fetch(`${API_BASE}/calendar/todos?student_id=${params.student_id}`);
    if (!res.ok) throw new Error('Failed to fetch todos');
    return res.json();
}

export async function createTodo(data: { student_id: string; title: string; due_date?: string; course_id?: string }): Promise<Todo> {
    const res = await fetch(`${API_BASE}/calendar/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create todo');
    return res.json();
}

export async function updateTodo(id: string, data: Partial<Todo>): Promise<Todo> {
    const res = await fetch(`${API_BASE}/calendar/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update todo');
    return res.json();
}

export async function deleteTodo(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/calendar/todos/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete todo');
}

export async function getColors(studentId: string): Promise<Record<string, string>> {
    const res = await fetch(`${API_BASE}/calendar/colors?student_id=${studentId}`);
    if (!res.ok) throw new Error('Failed to fetch colors');
    return res.json();
}

export async function saveColor(data: { student_id: string; course_id: string; color: string }): Promise<void> {
    const res = await fetch(`${API_BASE}/calendar/colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to save color');
}

// ============ Uploads ============

export interface CourseDocuments {
    course_id: string;
    syllabus_path?: string;
    schedule_path?: string;
    updated_at?: string;
}

export async function getCourseDocuments(courseId: string): Promise<CourseDocuments> {
    return apiFetch<CourseDocuments>(`/uploads/documents/${courseId}`);
}

async function uploadFile(endpoint: string, courseId: string, file: File): Promise<{ message: string; filePath: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/uploads/${endpoint}/${courseId}`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error.error || 'Upload failed');
    }

    return response.json();
}

export async function uploadSyllabus(courseId: string, file: File) {
    return uploadFile('syllabus', courseId, file);
}

export async function uploadSchedule(course_id: string, file: File) {
    return uploadFile('schedule', course_id, file);
}

export async function uploadStarterCode(file: File): Promise<{ message: string; filePath: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/uploads/starter-code`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error.error || 'Upload failed');
    }

    return response.json();
}

// ============ Test Cases ============

export interface TestCase {
    id: number;
    assignment_id: string;
    input: string;
    expected_output: string;
    points: number;
    is_public: number;
    /** 'stdin' = program reads from stdin; 'file' = input written to input_filename in work dir */
    input_type?: 'stdin' | 'file';
    /** e.g. 'input.txt'; used when input_type === 'file' */
    input_filename?: string | null;
    /** e.g. 'output.txt'; when set, grader reads this file after run and compares to expected_output */
    output_filename?: string | null;
    /** CLI args passed to the program (JSON array e.g. ["input.txt","output.txt"] or comma-separated) */
    run_args?: string | null;
    /** Second output file to compare (e.g. error report); both must match for full points */
    output_filename_2?: string | null;
    expected_output_2?: string | null;
    /** 'exact' = full string match; 'lines_unordered' = sort lines then compare; 'run_only' = full points if run succeeds (no output check) */
    compare_mode?: 'exact' | 'lines_unordered' | 'run_only';
    /** When input_type is file (or file_and_stdin), optional stdin sent after the file is available (e.g. menu choices). */
    stdin?: string | null;
    updated_at?: string;
}

export async function getTestCases(assignmentId: string): Promise<TestCase[]> {
    return apiFetch<TestCase[]>(`/test-cases/${assignmentId}`);
}

export async function createTestCase(testCase: Partial<TestCase>): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/test-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase),
    });
}

export async function updateTestCase(id: number, testCase: Partial<TestCase>): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/test-cases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase),
    });
}

export async function deleteTestCase(id: number): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/test-cases/${id}`, {
        method: 'DELETE',
    });
}

export async function importTestCases(assignmentId: string, file: File): Promise<{ message: string; count: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/test-cases/import?assignmentId=${encodeURIComponent(assignmentId)}`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Import failed' }));
        throw new Error(error.error || 'Import failed');
    }

    return response.json();
}

// ============ Admin / Database Explorer ============

export interface DbColumn {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: any;
    pk: number;
}

export interface TableData {
    tableName: string;
    columns: DbColumn[];
    rows: any[];
}

export async function getDbTables(): Promise<string[]> {
    return apiFetch<string[]>('/admin/tables');
}

export async function getTableData(tableName: string): Promise<TableData> {
    return apiFetch<TableData>(`/admin/tables/${tableName}`);
}
// ============ Users ============

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'student' | 'faculty' | 'admin';
}

export async function loginRequest(email: string): Promise<User> {
    return apiFetch<User>('/users/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
    });
}
