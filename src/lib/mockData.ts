import { ASSIGNMENT_STATUS } from './constants';
import type { AssignmentStatus } from './constants';

export type Course = {
    id: string;
    name: string;
    term: string;
};

export type Assignment = {
    id: string;
    courseId: string;
    title: string;
    dueDate: string;
    status: AssignmentStatus;
};

export const courses: Course[] = [
    { id: 'CSCI4060', name: 'Software Engineering', term: 'Spring 2026' },
    { id: 'CSCI2100', name: 'Data Structures', term: 'Spring 2026' },
    { id: 'CSCI1100', name: 'Intro to Computer Science', term: 'Spring 2026' },
];

export const assignments: Assignment[] = [
    {
        id: 'lang-platform',
        courseId: 'CSCI4060',
        title: 'Language and Platform',
        dueDate: 'Feb 19, 2026',
        status: ASSIGNMENT_STATUS.OPEN,
    },
    {
        id: 'sprint-1',
        courseId: 'CSCI4060',
        title: 'Sprint 1 Planning',
        dueDate: 'Mar 2, 2026',
        status: ASSIGNMENT_STATUS.CLOSED,
    },
    {
        id: 'linked-lists',
        courseId: 'CSCI2100',
        title: 'Linked List Utilities',
        dueDate: 'Feb 18, 2026',
        status: ASSIGNMENT_STATUS.LATE,
    },
    {
        id: 'stacks-queues',
        courseId: 'CSCI2100',
        title: 'Stacks and Queues',
        dueDate: 'Mar 1, 2026',
        status: ASSIGNMENT_STATUS.OPEN,
    },
    {
        id: 'intro-lab',
        courseId: 'CSCI1100',
        title: 'Intro Lab',
        dueDate: 'Feb 10, 2026',
        status: ASSIGNMENT_STATUS.CLOSED,
    },
];
