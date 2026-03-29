const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
export const UPLOADS_BASE = API_BASE.replace(/\/api$/, '');

// Generic fetch wrapper with error handling
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, options);
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
    }
    return response.json();
}

// ============ Admin / Database Explorer ============

export interface TableColumn {
    name: string;
    type: string;
    pk?: number;
    COLUMN_KEY?: string;
    IS_NULLABLE?: string;
}

export interface TableData {
    tableName: string;
    columns: TableColumn[];
    rows: Record<string, unknown>[];
}

export async function getDbTables(): Promise<string[]> {
    return apiFetch<string[]>('/admin/tables');
}

export async function getTableData(table: string): Promise<TableData> {
    return apiFetch<TableData>(`/admin/tables/${encodeURIComponent(table)}`);
}

export interface PendingFaculty {
    id: string;
    name: string;
    email: string;
    role: string;
    created_at?: string;
}

export async function getPendingFaculty(): Promise<PendingFaculty[]> {
    return apiFetch<PendingFaculty[]>('/admin/pending-faculty');
}

export async function verifyFaculty(userId: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/admin/verify-faculty/${encodeURIComponent(userId)}`, { method: 'POST' });
}

export interface AdminUser {
    id: string;
    name: string;
    email: string;
    role: string;
    verified?: number;
    created_at?: string;
}

export async function getAdminUsers(): Promise<AdminUser[]> {
    return apiFetch<AdminUser[]>('/admin/users');
}

export interface StudentInsight {
    id: string;
    name: string;
    email: string;
    created_at?: string;
    courses_enrolled: number;
    submissions_count: number;
    graded_count: number;
}

export async function getStudentInsights(): Promise<StudentInsight[]> {
    return apiFetch<StudentInsight[]>('/admin/students/insights');
}

export interface AdminFaculty {
    id: string;
    name: string;
    email: string;
    verified?: number;
    created_at?: string;
    course_count: number;
}

export async function getAdminFaculty(): Promise<AdminFaculty[]> {
    return apiFetch<AdminFaculty[]>('/admin/faculty');
}

export interface AdminAnalytics {
    users: Record<string, number>;
    totalUsers: number;
    totalCourses: number;
    totalAssignments: number;
    totalSubmissions: number;
    totalEnrollments: number;
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
    return apiFetch<AdminAnalytics>('/admin/analytics');
}

export async function deleteAdminUser(userId: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

export async function updateTableRecord(
    tableName: string, 
    pkFields: Record<string, any>, 
    updates: Record<string, any>
): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/admin/tables/${encodeURIComponent(tableName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pkFields, updates }),
    });
}

export async function deleteTableRecord(
    tableName: string, 
    pkFields: Record<string, any>
): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/admin/tables/${encodeURIComponent(tableName)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pkFields }),
    });
}

export interface EnrollmentRecord {
    id: string;
    name: string;
    created_at: string;
}

export async function getUserEnrollments(userId: string): Promise<EnrollmentRecord[]> {
    return apiFetch<EnrollmentRecord[]>(`/admin/users/${encodeURIComponent(userId)}/enrollments`);
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
    /** Present when fetching with both studentId and taId: 'student' | 'ta' | 'both' */
    my_role?: 'student' | 'ta' | 'both';
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

export async function deleteCourse(id: string): Promise<void> {
    return apiFetch<void>(`/courses/${id}`, {
        method: 'DELETE',
    });
}

export type CourseGradesExportType = 'assignments' | 'final' | 'student';

export function getCourseGradesExportUrl(
    courseId: string,
    format: 'csv' | 'excel' = 'csv',
    options?: { type?: CourseGradesExportType; studentId?: string; assignmentIds?: string[] }
): string {
    const params = new URLSearchParams();
    params.set('format', format);
    params.set('type', options?.type || 'assignments');
    if (options?.type === 'student' && options?.studentId) params.set('studentId', options.studentId);
    if (options?.assignmentIds && options.assignmentIds.length > 0) params.set('assignmentIds', options.assignmentIds.join(','));
    return `${API_BASE}/courses/${courseId}/grades/export?${params.toString()}`;
}

export interface GradebookData {
    course: Course;
    assignments: Assignment[];
    students: {
        id: string;
        name: string;
        email: string;
        grades: Record<string, number | null>;
        /** true if student has a submission for that assignment (may be ungraded) */
        submitted?: Record<string, boolean>;
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

// ============ Assignments ============

export interface RubricCriterion {
    id: string;
    name: string;
    weight?: number | null;
    maxPoints?: number | null;
    comment?: string;
}

export interface RubricSection {
    id: string;
    title: string;
    items: RubricCriterion[];
}

export interface RubricConfig {
    title: string;
    weighted: boolean;
    /** New format: sections, each with its own criterion table */
    sections?: RubricSection[];
    /** Legacy format: flat criteria (converted to one section when loading) */
    criteria?: RubricCriterion[];
}

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
    test_case_file_path?: string;
    type?: 'individual' | 'group';
    created_at?: string;
    /** Faculty-configured: apply penalty when submitted after due_date (uses submission submitted_at) */
    late_penalty_enabled?: boolean | number;
    late_penalty_type?: 'per_day' | 'per_hour' | 'fixed';
    late_penalty_value?: number;
    late_penalty_cap?: number;
    rubric_config?: RubricConfig | string | null;
    /** Faculty-only: when 1, GAs see "Student 1 / 2 / …" instead of real names */
    hide_student_names?: number | boolean;
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
    return apiFetch<{ message: string }>(`/courses/${courseId}/enroll`, {
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
    return apiFetch<User[]>(`/users/search?role=ta&q=${encodeURIComponent(query)}`);
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
    student_name?: string;
    student_profile_picture?: string;
    file_name: string;
    file_path: string;
    submitted_at: string;
    updated_at: string;
    status: 'pending' | 'graded' | 'returned';
    grade?: number;
    auto_grade?: number;
    feedback?: string;
    auto_feedback?: string;
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
            let parsed = JSON.parse(sub.file_path);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed); // Handle double-stringified JSON
            if (Array.isArray(parsed)) {
                sub.files = parsed;
            } else {
                sub.files = [{ name: sub.file_name, path: sub.file_path }];
            }
        } catch (e) {
            sub.files = [{ name: sub.file_name, path: sub.file_path }];
        }
        return sub;
    });
}

export async function getSubmission(id: number): Promise<Submission> {
    const sub = await apiFetch<Submission>(`/submissions/${id}`);
    try {
        let parsed = JSON.parse(sub.file_path);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed); // Handle double-stringified JSON
        if (Array.isArray(parsed)) {
            sub.files = parsed;
        } else {
            sub.files = [{ name: sub.file_name, path: sub.file_path }];
        }
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

    const response = await fetch(`${API_BASE}/submissions`, {
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

    const response = await fetch(`${API_BASE}/submissions/${id}`, {
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

export async function runTests(assignmentId: string, code: string, language: string): Promise<{ results: TestResult[] }> {
    return apiFetch<{ results: TestResult[] }>(`/assignments/${assignmentId}/test`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, language }),
    });
}

export async function runCustomCode(assignmentId: string, code: string, language: string, stdin: string): Promise<{ stdout: string; stderr: string | null; exitCode: number; timedOut: boolean }> {
    return apiFetch<{ stdout: string; stderr: string | null; exitCode: number; timedOut: boolean }>(`/assignments/${assignmentId}/run`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, language, stdin }),
    });
}

// ============ Users ============

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'student' | 'faculty' | 'ta' | 'admin';
    profile_picture?: string;
    verified?: boolean;
    email_verified?: boolean;
    student_id?: string;
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

export async function signupRequest(data: { name: string; email: string; password: string; student_id?: string }): Promise<User> {
    return apiFetch<User>('/users/signup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });
}

export async function checkUserVerified(userId: string): Promise<{ verified: boolean }> {
    return apiFetch<{ verified: boolean }>(`/users/${encodeURIComponent(userId)}/verified`);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, currentPassword, newPassword }),
    });
}

// ============ Email Verification ============

export async function verifyEmailByOtp(email: string, otp: string): Promise<User> {
    return apiFetch<User>('/users/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
    });
}

export async function verifyEmailByToken(token: string): Promise<User> {
    return apiFetch<User>(`/users/verify-email-token?token=${encodeURIComponent(token)}`);
}

export async function resendVerificationEmail(email: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/users/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });
}

export interface DevEmailLog {
    id: string;
    provider: string;
    from: string;
    to: string;
    subject: string;
    otp: string | null;
    link: string | null;
    createdAt: string;
}

export async function getDevEmailLogs(email: string): Promise<{ logs: DevEmailLog[] }> {
    return apiFetch<{ logs: DevEmailLog[] }>(`/users/dev-email-logs?email=${encodeURIComponent(email)}`);
}

// ============ Password Reset ============

export async function forgotPassword(email: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/users/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
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

export async function runAutograde(submissionId: number, dryRun = false): Promise<Submission> {
    const url = `/grader/submissions/${submissionId}/run${dryRun ? '?dryRun=1' : ''}`;
    return apiFetch<Submission>(url, {
        method: 'POST',
    });
}

// ============ Messaging / Inbox ============

export interface MessageContact {
    id: string;
    name: string;
    email: string;
    role: string;
    profile_picture?: string;
}

export interface ConversationMessage {
    id: number;
    conversation_id: number;
    sender_id: string;
    sender_name: string;
    sender_picture?: string;
    body: string;
    created_at: string;
}

export interface Conversation {
    id: number;
    course_id: string;
    course_name?: string;
    subject: string;
    created_by: string;
    created_by_name?: string;
    created_at: string;
    updated_at: string;
    is_starred: number;
    is_archived: number;
    last_read_at: string | null;
    last_message: { body: string; created_at: string; sender_name: string } | null;
    unread_count: number;
    participants: { id: string; name: string; profile_picture?: string }[];
}

export async function getContacts(userId: string, courseId?: string): Promise<MessageContact[]> {
    const params = new URLSearchParams({ userId });
    if (courseId) params.set('courseId', courseId);
    return apiFetch<MessageContact[]>(`/messages/contacts?${params}`);
}

export async function getConversations(userId: string, filter?: string): Promise<Conversation[]> {
    const params = new URLSearchParams({ userId });
    if (filter) params.set('filter', filter);
    return apiFetch<Conversation[]>(`/messages/conversations?${params}`);
}

export async function createConversation(data: {
    courseId: string;
    subject: string;
    createdBy: string;
    recipientIds: string[];
    body: string;
}): Promise<{ id: number; message: string }> {
    return apiFetch<{ id: number; message: string }>('/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
}

export async function getConversationMessages(conversationId: number, userId: string): Promise<ConversationMessage[]> {
    return apiFetch<ConversationMessage[]>(`/messages/conversations/${conversationId}/messages?userId=${userId}`);
}

export async function replyToConversation(conversationId: number, senderId: string, body: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/messages/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId, body }),
    });
}

export async function toggleStar(conversationId: number, userId: string, starred: boolean): Promise<void> {
    await apiFetch<{ message: string }>(`/messages/conversations/${conversationId}/star`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, starred }),
    });
}

export async function toggleArchive(conversationId: number, userId: string, archived: boolean): Promise<void> {
    await apiFetch<{ message: string }>(`/messages/conversations/${conversationId}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, archived }),
    });
}

export async function deleteConversation(conversationId: number, userId: string): Promise<void> {
    await apiFetch<{ message: string }>(`/messages/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
}

export async function getUnreadCount(userId: string): Promise<number> {
    const data = await apiFetch<{ count: number }>(`/messages/unread-count?userId=${userId}`);
    return data.count;
}
