import { createBrowserRouter } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import LandingPage from '../pages/LandingPage';
import Login from '../pages/auth/Login';
import StudentDashboard from '../pages/student/StudentDashboard';
import ClassOverview from '../pages/student/ClassOverview';
import ClassAssignments from '../pages/student/ClassAssignments';
import AssignmentDetails from '../pages/student/AssignmentDetails';
import SubmitAssignment from '../pages/student/SubmitAssignment';
import SubmissionResults from '../pages/student/SubmissionResults';
import CourseGrades from '../pages/student/CourseGrades';
import FacultyDashboard from '../pages/faculty/FacultyDashboard';
import NotFound from '../pages/NotFound';
import { AUTH_ROLES } from '../lib/auth';

export const router = createBrowserRouter([
    {
        path: '/',
        element: <LandingPage />,
    },
    {
        path: '/login/:role',
        element: <Login />,
    },
    {
        path: '/',
        element: <AppShell />,
        errorElement: <NotFound />,
        children: [
            {
                path: 'student',
                element: <ProtectedRoute requiredRole={AUTH_ROLES.STUDENT} />,
                children: [
                    { index: true, element: <StudentDashboard /> },
                    { path: 'courses/:courseId', element: <ClassOverview /> },
                    { path: 'courses/:courseId/assignments', element: <ClassAssignments /> },
                    { path: 'courses/:courseId/assignments/:assignmentId', element: <AssignmentDetails /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/submit', element: <SubmitAssignment /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/submissions/:submissionId', element: <SubmissionResults /> },
                    { path: 'courses/:courseId/grades', element: <CourseGrades /> },
                ]
            },
            {
                path: 'faculty',
                element: <ProtectedRoute requiredRole={AUTH_ROLES.FACULTY} />,
                children: [
                    { index: true, element: <FacultyDashboard /> },
                ]
            }
        ]
    },
    {
        path: '*',
        element: <NotFound />
    }
]);
