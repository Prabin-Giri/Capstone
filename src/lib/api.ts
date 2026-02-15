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
    created_at?: string;
}

export async function getCourses(): Promise<Course[]> {
    return apiFetch<Course[]>('/courses');
}

export async function getCourse(id: string): Promise<Course> {
    return apiFetch<Course>(`/courses/${id}`);
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
    submitted_at: string;
    updated_at: string;
    status: 'pending' | 'graded' | 'returned';
    grade?: number;
    feedback?: string;
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
    file: File
): Promise<Submission> {
    const formData = new FormData();
    formData.append('assignment_id', assignmentId);
    formData.append('student_id', studentId);
    formData.append('file', file);

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
    data: { file?: File; status?: string; grade?: number; feedback?: string }
): Promise<Submission> {
    const formData = new FormData();
    if (data.file) formData.append('file', data.file);
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

    return response.json();
}

export async function deleteSubmission(id: number): Promise<void> {
    await apiFetch<{ message: string }>(`/submissions/${id}`, { method: 'DELETE' });
}

// Helper to get the full URL for a submitted file
export function getFileUrl(filePath: string): string {
    return `${API_BASE.replace('/api', '')}/uploads/${filePath}`;
}
