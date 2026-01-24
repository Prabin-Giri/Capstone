// Status Vocabulary (Verbatim as required)

export const SUBMISSION_STATUS = {
    QUEUED: 'queued',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    TIMED_OUT: 'timed out',
} as const;

export const VISIBILITY_STATUS = {
    HIDDEN: 'hidden',
    RELEASED: 'released',
} as const;

export const ASSIGNMENT_STATUS = {
    OPEN: 'open',
    CLOSED: 'closed',
    LATE: 'late',
} as const;

export type SubmissionStatus = typeof SUBMISSION_STATUS[keyof typeof SUBMISSION_STATUS];
export type VisibilityStatus = typeof VISIBILITY_STATUS[keyof typeof VISIBILITY_STATUS];
export type AssignmentStatus = typeof ASSIGNMENT_STATUS[keyof typeof ASSIGNMENT_STATUS];
