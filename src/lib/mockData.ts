import { ASSIGNMENT_STATUS } from './constants';
import type { AssignmentStatus } from './constants';

export type Class = {
    id: string;
    name: string;
    term: string;
};

export type Assignment = {
    id: string;
    classId: string;
    title: string;
    dueDate: string;
    status: AssignmentStatus;
};

export const classes: Class[] = [
    { id: 'cs101', name: 'Intro to Computer Science', term: 'Spring 2026' },
    { id: 'cs201', name: 'Data Structures', term: 'Spring 2026' },
    { id: 'se300', name: 'Software Engineering', term: 'Spring 2026' },
];

export const assignments: Assignment[] = [
    {
        id: 'a1',
        classId: 'cs101',
        title: 'Binary Search Implementation',
        dueDate: 'Feb 20, 2026',
        status: ASSIGNMENT_STATUS.OPEN,
    },
    {
        id: 'a2',
        classId: 'cs101',
        title: 'Sorting Algorithms',
        dueDate: 'Mar 5, 2026',
        status: ASSIGNMENT_STATUS.CLOSED,
    },
    {
        id: 'a3',
        classId: 'cs201',
        title: 'Linked List Utilities',
        dueDate: 'Feb 18, 2026',
        status: ASSIGNMENT_STATUS.LATE,
    },
    {
        id: 'a4',
        classId: 'cs201',
        title: 'Stacks and Queues',
        dueDate: 'Mar 1, 2026',
        status: ASSIGNMENT_STATUS.OPEN,
    },
];
