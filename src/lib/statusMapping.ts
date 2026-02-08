import { SUBMISSION_STATUS } from './constants';

/**
 * Maps backend submission status to UI vocabulary.
 * Backend: 'pending' | 'graded' | 'returned'
 * UI: 'queued' | 'running' | 'completed' | 'failed' | 'timed out'
 */
export const mapSubmissionStatus = (backendStatus: string): string => {
    switch (backendStatus) {
        case 'pending':
            return SUBMISSION_STATUS.QUEUED;
        case 'graded':
            return SUBMISSION_STATUS.COMPLETED;
        case 'returned':
            return SUBMISSION_STATUS.COMPLETED; // Or 'failed' depending on logic, but completed is safer for now
        default:
            return backendStatus; // Fallback if it already matches
    }
};

/**
 * Maps UI status back to backend status (if needed for writes).
 */
export const mapUiStatusToBackend = (uiStatus: string): string => {
    switch (uiStatus) {
        case SUBMISSION_STATUS.QUEUED:
        case SUBMISSION_STATUS.RUNNING:
            return 'pending';
        case SUBMISSION_STATUS.COMPLETED:
            return 'graded';
        case SUBMISSION_STATUS.FAILED:
        case SUBMISSION_STATUS.TIMED_OUT:
            return 'returned'; // Closest mapping
        default:
            return 'pending';
    }
};
