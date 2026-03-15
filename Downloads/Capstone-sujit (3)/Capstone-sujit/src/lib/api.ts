/** Backend base URL (no trailing slash). Empty in dev = use Vite proxy. Set VITE_API_URL in .env for production. */
const BACKEND_BASE = import.meta.env.VITE_API_URL || '';
/** API base URL for fetch calls (e.g. /api or http://localhost:3001/api). */
export const API_BASE = `${BACKEND_BASE}/api`;
/** Base URL for uploaded files (profile pics, starter code, etc.). Use with path like `/uploads/...`. */
export const UPLOADS_BASE = BACKEND_BASE;

/** Format a grade for display (2 decimal places). */
export function formatGrade(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return Number(value).toFixed(2);
}

/** Round grade to 2 decimal places for storage. */
export function roundGrade(value: number): number {
    return Math.round(Number(value) * 100) / 100;
}

const BACKEND_UNREACHABLE_MSG =
    'Cannot reach the server. Make sure the backend is running (e.g. run "npm run dev" from project root, or "npm run dev:server" in one terminal and "npm run dev:frontend" in another).';

/** Wraps fetch and throws a clear error when the backend is unreachable (e.g. not running). */
export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
    try {
        return await fetch(url, options);
    } catch (err) {
        if (err instanceof TypeError && String(err.message).toLowerCase().includes('fetch')) {
            throw new Error(BACKEND_UNREACHABLE_MSG);
        }
        throw err instanceof Error ? err : new Error('Request failed');
    }
}

// Generic fetch wrapper with error handling
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await safeFetch(`${API_BASE}${url}`, options);
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
    instructor_id?: string;
    is_archived?: boolean;
    student_count?: number;
    active_assignment_count?: number;
    created_at?: string;
}

export async function getCourses(filters?: { instructorId?: string; studentId?: string; taId?: string }): Promise<Course[]> {
    let url = '/courses';
    if (filters) {
        const params = new URLSearchParams();
        if (filters.instructorId) params.append('instructorId', filters.instructorId);
        if (filters.studentId) params.append('studentId', filters.studentId);
        if (filters.taId) params.append('taId', filters.taId);
        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;
    }
    return apiFetch<Course[]>(url);
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

export function getCourseGradesExportUrl(
    id: string,
    format: 'csv' | 'excel' = 'csv',
    options?: { studentId?: string }
): string {
    const params = new URLSearchParams({ format });
    if (options?.studentId) {
        params.set('studentId', options.studentId);
    }
    return `${API_BASE}/courses/${id}/grades/export?${params.toString()}`;
}

export type GradeCellStatus = 'graded' | 'submitted' | 'not_submitted' | 'missing';

export interface GradeCell {
    score: number | null;
    status: GradeCellStatus;
}

export interface GradebookData {
    course: Course;
    assignments: Assignment[];
    students: {
        id: string;
        name: string;
        email: string;
        grades: Record<string, GradeCell>;
    }[];
}

export async function getCourseGrades(courseId: string): Promise<GradebookData> {
    return apiFetch<GradebookData>(`/courses/${courseId}/grades`);
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

export async function deleteCourse(id: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/courses/${id}`, {
        method: 'DELETE',
    });
}

// ============ Assignments ============

export interface Assignment {
    /** Assignment id (numeric in DB; may be number or string from API) */
    id: number | string;
    course_id: string;
    title: string;
    description?: string;
    due_date: string;
    status: 'active' | 'closed' | 'late';
    points?: number;
    language?: string;
    starter_code_path?: string;
    test_case_file_path?: string;
    type?: 'individual' | 'group';
    created_at?: string;
    /** Faculty-configured: apply penalty when submitted after due_date (uses submission submitted_at) */
    late_penalty_enabled?: boolean | number;
    late_penalty_type?: 'per_day' | 'per_hour' | 'fixed';
    late_penalty_value?: number;
    late_penalty_cap?: number;
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

export async function enrollStudent(courseId: string, studentId: string): Promise<{ message: string }> {
    const url = `/courses/${courseId}/enroll?studentId=${encodeURIComponent(studentId)}`;
    return apiFetch<{ message: string }>(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentId }),
    });
}

export async function unenrollStudent(courseId: string, studentId: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/courses/${courseId}/enroll/${studentId}`, {
        method: 'DELETE',
    });
}

export async function inviteTA(courseId: string, payload: { email?: string; taId?: string }): Promise<{ message: string; taId: string }> {
    return apiFetch<{ message: string; taId: string }>(`/courses/${courseId}/invite-ta`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
}

export async function getTAs(courseId: string): Promise<User[]> {
    return apiFetch<User[]>(`/courses/${courseId}/tas`);
}

export async function removeTA(courseId: string, taId: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/courses/${courseId}/tas/${taId}`, {
        method: 'DELETE',
    });
}

export interface CsvEnrollResult {
    enrolled: { email: string; name: string }[];
    notFound: string[];
    alreadyEnrolled: { email: string; name: string }[];
}

export async function enrollStudentsByCSV(courseId: string, students: { id: string, name: string, email: string }[]): Promise<CsvEnrollResult> {
    return apiFetch<CsvEnrollResult>(`/courses/${courseId}/enroll-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students }),
    });
}

export async function getEnrolledStudents(courseId: string): Promise<User[]> {
    return apiFetch<User[]>(`/courses/${courseId}/students`);
}

export async function searchStudents(query: string): Promise<User[]> {
    return apiFetch<User[]>(`/users/students?q=${encodeURIComponent(query)}`);
}

export async function searchTAs(query: string): Promise<User[]> {
    // Allow faculty to search any user; invite-ta endpoint will promote them to TA as needed.
    return apiFetch<User[]>(`/users/search?q=${encodeURIComponent(query)}`);
}

export interface RubricCriterionInput {
    criterion_name?: string;
    label?: string;
    points?: number;
    maxPoints?: number;
    /** Weight % for weighted rubrics (0–100); omit or null for unweighted */
    weight?: number | null;
    /** Section header e.g. "I. Correctness", "II. Style", "III. Documentation" */
    category?: string | null;
    /** What this criterion measures e.g. "All test cases produce expected output" */
    description?: string | null;
}

export async function createAssignmentWithRubric(
    assignment: Omit<Assignment, 'id' | 'created_at'> & { rubric_criteria?: RubricCriterionInput[] }
): Promise<Assignment> {
    return apiFetch<Assignment>('/assignments/with-rubric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignment),
    });
}

export interface AssignmentRubricCriterion {
    id: number;
    assignment_id: number;
    criterion_name: string;
    points: number;
    /** Weight % when rubric is weighted; null for unweighted */
    weight?: number | null;
    /** Section header e.g. "I. Correctness", "II. Style" */
    category?: string | null;
    /** What this criterion measures */
    description?: string | null;
}

export async function getAssignmentRubricCriteria(assignmentId: string | number): Promise<AssignmentRubricCriterion[]> {
    return apiFetch<AssignmentRubricCriterion[]>(`/assignments/${assignmentId}/rubric-criteria`);
}

export async function updateAssignmentRubricCriteria(
    assignmentId: string | number,
    criteria: RubricCriterionInput[]
): Promise<{ message: string; count: number }> {
    return apiFetch<{ message: string; count: number }>(`/assignments/${assignmentId}/rubric-criteria`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria }),
    });
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
    assignment_id: number | string;
    student_id: string;
    file_name: string;
    file_path: string;
    submitted_at: string;
    updated_at: string;
    status: 'pending' | 'graded' | 'returned';
    grade?: number;
    feedback?: string;
    files?: { name: string, path: string }[];
}

export async function getSubmissions(params?: {
    assignment_id?: string;
    student_id?: string;
}): Promise<Submission[]> {
    const searchParams = new URLSearchParams();
    if (params?.assignment_id) searchParams.set('assignment_id', params.assignment_id);
    if (params?.student_id) searchParams.set('student_id', params.student_id);
    const query = searchParams.toString();
    const res = await apiFetch<Submission[]>(`/submissions${query ? `?${query}` : ''}`);
    return res.map(sub => {
        try {
            sub.files = JSON.parse(sub.file_path);
        } catch (e) {
            sub.files = [{ name: sub.file_name, path: sub.file_path }];
        }
        return sub;
    });
}

export async function getSubmission(id: number): Promise<Submission> {
    const sub = await apiFetch<Submission>(`/submissions/${id}`);
    try {
        sub.files = JSON.parse(sub.file_path);
    } catch (e) {
        sub.files = [{ name: sub.file_name, path: sub.file_path }];
    }
    return sub;
}

export async function createSubmission(
    assignmentId: string,
    studentId: string,
    files: File[]
): Promise<Submission> {
    const formData = new FormData();
    formData.append('assignment_id', assignmentId);
    formData.append('student_id', studentId);
    files.forEach(f => formData.append('files', f));

    const response = await safeFetch(`${API_BASE}/submissions`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error.error || 'Upload failed');
    }

    const sub = await response.json();
    try {
        sub.files = JSON.parse(sub.file_path);
    } catch (e) {
        sub.files = [{ name: sub.file_name, path: sub.file_path }];
    }
    return sub;
}

export async function updateSubmission(
    id: number,
    data: { files?: File[]; status?: string; grade?: number; feedback?: string }
): Promise<Submission> {
    const formData = new FormData();
    if (data.files) {
        data.files.forEach(f => formData.append('files', f));
    }
    if (data.status) formData.append('status', data.status);
    if (data.grade !== undefined) formData.append('grade', String(data.grade));
    if (data.feedback !== undefined) formData.append('feedback', data.feedback);

    const response = await safeFetch(`${API_BASE}/submissions/${id}`, {
        method: 'PUT',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Update failed' }));
        throw new Error(error.error || 'Update failed');
    }

    const sub = await response.json();
    try {
        sub.files = JSON.parse(sub.file_path);
    } catch (e) {
        sub.files = [{ name: sub.file_name, path: sub.file_path }];
    }
    return sub;
}

export async function deleteSubmission(id: number): Promise<void> {
    await apiFetch<{ message: string }>(`/submissions/${id}`, { method: 'DELETE' });
}

// Helper to get the full URL for a submitted file (path = filename or relative path under uploads)
export function getFileUrl(filePath: string): string {
    const base = (UPLOADS_BASE || '').replace(/\/$/, '');
    const path = (filePath || '').replace(/^\/+/, '');
    return base ? `${base}/uploads/${path}` : `/uploads/${path}`;
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
    const res = await safeFetch(`${API_BASE}/calendar/todos?student_id=${params.student_id}`);
    if (!res.ok) throw new Error('Failed to fetch todos');
    return res.json();
}

export async function createTodo(data: { student_id: string; title: string; due_date?: string; course_id?: string }): Promise<Todo> {
    const res = await safeFetch(`${API_BASE}/calendar/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create todo');
    return res.json();
}

export async function updateTodo(id: string, data: Partial<Todo>): Promise<Todo> {
    const res = await safeFetch(`${API_BASE}/calendar/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update todo');
    return res.json();
}

export async function deleteTodo(id: string): Promise<void> {
    const res = await safeFetch(`${API_BASE}/calendar/todos/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete todo');
}

export async function getColors(studentId: string): Promise<Record<string, string>> {
    const res = await safeFetch(`${API_BASE}/calendar/colors?student_id=${studentId}`);
    if (!res.ok) throw new Error('Failed to fetch colors');
    return res.json();
}

export async function saveColor(data: { student_id: string; course_id: string; color: string }): Promise<void> {
    const res = await safeFetch(`${API_BASE}/calendar/colors`, {
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

    const response = await safeFetch(`${API_BASE}/uploads/${endpoint}/${courseId}`, {
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

    const response = await safeFetch(`${API_BASE}/uploads/starter-code`, {
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
    assignment_id: number | string;
    input: string;
    expected_output: string;
    points: number;
    is_public: number;
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

/** Create test case for an assignment (assignment_id from URL — avoids "assignment_id doesn't have a default value") */
export async function createTestCaseForAssignment(
    assignmentId: string,
    testCase: { input?: string; expected_output?: string; points?: number; is_public?: number }
): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/assignments/${encodeURIComponent(assignmentId)}/test-cases`, {
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

export interface TestResult {
    id: number;
    input: string;
    expected: string;
    actual: string;
    error: string | null;
    passed: boolean;
    is_public: number;
    points?: number;
}

export async function runTests(
    assignmentId: string,
    code: string,
    language: string,
    submissionId?: number,
    filename?: string
): Promise<{ results: TestResult[] }> {
    return apiFetch<{ results: TestResult[] }>(`/assignments/${assignmentId}/test`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, language, submissionId, filename }),
    });
}

export interface RunCodeResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
}

/** Run code with manual stdin (Python or Java). Available to all users for terminal-style execution. */
export async function runCode(code: string, language: 'python' | 'java', stdin?: string): Promise<RunCodeResult> {
    return apiFetch<RunCodeResult>('/code/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, stdin: stdin ?? '' }),
    });
}

// ============ Users ============

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'user' | 'student' | 'faculty' | 'ta' | 'admin' | null;
    profile_picture?: string;
}

export async function loginRequest(email: string, password: string): Promise<User> {
    return apiFetch<User>('/users/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
    });
}

export async function signupRequest(data: { name: string; email: string; password: string; role?: string }): Promise<User> {
    return apiFetch<User>('/users/signup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });
}

export interface PlagiarismResult {
    student1: { name: string; id: string };
    student2: { name: string; id: string };
    similarity: number;
    matchedTokens: number;
    totalTokens: number;
}

export interface PlagiarismResponse {
    assignmentId: string;
    totalSubmissions: number;
    flaggedPairs: PlagiarismResult[];
    message?: string;
}

export async function runPlagiarismCheck(assignmentId: string): Promise<PlagiarismResponse> {
    return apiFetch<PlagiarismResponse>(`/assignments/${assignmentId}/plagiarism-check`, {
        method: 'POST',
    });
}

export interface AutoGradeSummary {
    graded: number;
    failed: number;
    average: number;
}

export async function autoGradeAssignment(
    assignmentId: string,
    latePenalty: string,
    timeout: number
): Promise<AutoGradeSummary> {
    return apiFetch<AutoGradeSummary>(`/assignments/${assignmentId}/autograde`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ latePenalty, timeout }),
    });
}

export async function runAutograde(
    submissionId: number,
    opts?: { publicOnly?: boolean }
): Promise<Submission> {
    const qs = opts?.publicOnly ? '?publicOnly=1' : '';
    return apiFetch<Submission>(`/grader/submissions/${submissionId}/run${qs}`, {
        method: 'POST',
    });
}

// ============ Admin / Database Explorer ============

export interface TableColumn {
    name: string;
    type: string;
    pk?: number | string;
    [key: string]: any;
}

export interface TableData {
    tableName: string;
    columns: TableColumn[];
    rows: Record<string, any>[];
}

export async function getDbTables(): Promise<string[]> {
    return apiFetch<string[]>('/admin/tables');
}

export async function getTableData(tableName: string): Promise<TableData> {
    return apiFetch<TableData>(`/admin/tables/${encodeURIComponent(tableName)}`);
}

export interface InsertRowResult {
    message: string;
    insertId?: number;
    affectedRows?: number;
}

export interface UpdateDeleteRowResult {
    message: string;
    affectedRows?: number;
}

export async function adminInsertRow(tableName: string, row: Record<string, unknown>): Promise<InsertRowResult> {
    return apiFetch<InsertRowResult>(`/admin/tables/${encodeURIComponent(tableName)}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row }),
    });
}

export async function adminUpdateRow(
    tableName: string,
    primaryKey: Record<string, unknown>,
    row: Record<string, unknown>
): Promise<UpdateDeleteRowResult> {
    return apiFetch<UpdateDeleteRowResult>(`/admin/tables/${encodeURIComponent(tableName)}/rows`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryKey, row }),
    });
}

export async function adminDeleteRow(
    tableName: string,
    primaryKey: Record<string, unknown>
): Promise<UpdateDeleteRowResult> {
    return apiFetch<UpdateDeleteRowResult>(`/admin/tables/${encodeURIComponent(tableName)}/rows`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryKey }),
    });
}

export interface AdminGetUsersParams {
    role?: string;
    q?: string;
    courseId?: string;
    taCourseId?: string;
    instructorOnly?: boolean;
    noRole?: boolean;
}

export async function adminGetUsers(params?: AdminGetUsersParams): Promise<User[]> {
    const search = new URLSearchParams();
    if (params?.role) search.set('role', params.role);
    if (params?.q) search.set('q', params.q);
    if (params?.courseId) search.set('courseId', params.courseId);
    if (params?.taCourseId) search.set('taCourseId', params.taCourseId);
    if (params?.instructorOnly) search.set('instructorOnly', '1');
    if (params?.noRole) search.set('noRole', '1');
    const qs = search.toString();
    const url = `/admin/users${qs ? `?${qs}` : ''}`;
    return apiFetch<User[]>(url);
}

export async function adminPromoteToFaculty(payload: { email?: string; id?: string }): Promise<{ message: string; user: User }> {
    return apiFetch<{ message: string; user: User }>('/admin/users/promote-faculty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function adminCreateFaculty(payload: { id?: string; name: string; email: string; password: string }): Promise<{ message: string; user: User }> {
    return apiFetch<{ message: string; user: User }>('/admin/users/create-faculty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function adminUpdateUserRole(userId: string, role: string): Promise<{ message: string; user: User }> {
    return apiFetch<{ message: string; user: User }>(`/admin/users/${encodeURIComponent(userId)}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
    });
}

export async function adminResetPassword(userId: string, password: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
}

export interface AdminTA {
    id: string;
    name: string;
    email: string;
    role: string;
    course_ids: string[];
}

export async function adminGetTAs(): Promise<AdminTA[]> {
    return apiFetch<AdminTA[]>('/admin/tas');
}

export async function adminPromoteToTA(payload: { id?: string; email?: string }): Promise<{ message: string; user: User }> {
    return apiFetch<{ message: string; user: User }>('/admin/tas/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function adminAssignTAToCourse(courseId: string, taId: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/admin/courses/${encodeURIComponent(courseId)}/tas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taId }),
    });
}

export async function adminRemoveTAFromCourse(courseId: string, taId: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/admin/courses/${encodeURIComponent(courseId)}/tas/${encodeURIComponent(taId)}`, {
        method: 'DELETE',
    });
}

export interface AdminCourse {
    id: string;
    name: string;
    term: string;
    instructor_id: string | null;
    is_archived: number;
    instructor_name: string | null;
    instructor_email: string | null;
    enrollment_count: number;
    assignment_count: number;
}

export async function adminGetCourses(): Promise<AdminCourse[]> {
    return apiFetch<AdminCourse[]>('/admin/courses');
}

export async function adminReassignInstructor(courseId: string, instructorId: string | null): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/admin/courses/${encodeURIComponent(courseId)}/instructor`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructorId }),
    });
}

export async function adminSetCourseArchived(courseId: string, isArchived: boolean): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/admin/courses/${encodeURIComponent(courseId)}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived }),
    });
}

export interface AdminReportSummary {
    usersByRole: Record<string, number>;
    totalUsers: number;
    courses: { total: number; archived: number };
    assignments: number;
    submissions: number;
    recentSignups: { id: string; name: string; email: string; role: string | null; created_at: string }[];
    recentSubmissions: { id: number; student_id: string; assignment_id: string; submitted_at: string; assignment_title: string }[];
}

export async function adminGetReportSummary(): Promise<AdminReportSummary> {
    return apiFetch<AdminReportSummary>('/admin/reports/summary');
}

export async function adminBulkImportUsers(users: { id?: string; name: string; email: string; password?: string; role?: string }[]): Promise<{ created: { id: string; name: string; email: string; role: string | null }[]; skipped: { email: string; reason: string }[]; errors: { email: string; error: string }[] }> {
    return apiFetch('/admin/users/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users }),
    });
}

export async function adminBulkUpdateRole(userIds: string[], role: string): Promise<{ message: string; updated: number }> {
    return apiFetch('/admin/users/bulk-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, role }),
    });
}
