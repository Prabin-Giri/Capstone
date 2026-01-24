import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import StudentDashboard from '../pages/student/StudentDashboard';
import ClassAssignments from '../pages/student/ClassAssignments';
import AssignmentDetails from '../pages/student/AssignmentDetails';
import SubmitAssignment from '../pages/student/SubmitAssignment';
import SubmissionResults from '../pages/student/SubmissionResults';
import FacultyDashboard from '../pages/faculty/FacultyDashboard';
import NotFound from '../pages/NotFound';

export const router = createBrowserRouter([
    {
        path: '/',
        element: <AppShell />,
        errorElement: <NotFound />,
        children: [
            {
                index: true,
                element: <Navigate to="/student" replace />
            },
            {
                path: 'student',
                children: [
                    { index: true, element: <StudentDashboard /> },
                    { path: 'classes/:classId/assignments', element: <ClassAssignments /> },
                    { path: 'assignments/:assignmentId', element: <AssignmentDetails /> },
                    { path: 'assignments/:assignmentId/submit', element: <SubmitAssignment /> },
                    { path: 'submissions/:submissionId', element: <SubmissionResults /> },
                ]
            },
            {
                path: 'faculty',
                element: <FacultyDashboard />
            }
        ]
    },
    {
        path: '*',
        element: <NotFound />
    }
]);
