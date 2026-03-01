import { createBrowserRouter } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import LandingPage from '../pages/LandingPage';
import Login from '../pages/auth/Login';
import SignUp from '../pages/auth/SignUp';
import StudentDashboard from '../pages/student/StudentDashboard';
import Calendar from '../pages/student/Calendar';
import ClassOverview from '../pages/student/ClassOverview';
import ClassAssignments from '../pages/student/ClassAssignments';
import AssignmentDetails from '../pages/student/AssignmentDetails';
import SubmitAssignment from '../pages/student/SubmitAssignment';
import SubmissionResults from '../pages/student/SubmissionResults';
import CourseGrades from '../pages/student/CourseGrades';
import FacultyDashboard from '../pages/faculty/FacultyDashboard';
import FacultyCourseView from '../pages/faculty/FacultyCourseView';
import AssignmentWizard from '../pages/faculty/AssignmentWizard';
import GradingDashboard from '../pages/faculty/GradingDashboard';
import SubmissionGrader from '../pages/faculty/SubmissionGrader';
import NewCourse from '../pages/faculty/NewCourse';
import CourseGradebook from '../pages/faculty/CourseGradebook';
import NotFound from '../pages/NotFound';
import TADashboard from '../pages/ta/TADashboard';
import TACourseView from '../pages/ta/TACourseView';
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
        path: '/signup/:role',
        element: <SignUp />,
    },
    {
        path: '/',
        element: <AppShell />,
        errorElement: <NotFound />,
        children: [
            {
                path: 'calendar',
                element: <Calendar />
            },
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
                    { path: 'courses/new', element: <NewCourse /> },
                    { path: 'courses/:courseId', element: <FacultyCourseView /> },
                    { path: 'courses/:courseId/assignments/new', element: <AssignmentWizard /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/edit', element: <AssignmentWizard /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/grading', element: <GradingDashboard /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/grading/:submissionId', element: <SubmissionGrader /> },
                    { path: 'courses/:courseId/gradebook', element: <CourseGradebook /> },
                ]
            },
            {
                path: 'ta',
                element: <ProtectedRoute requiredRole={AUTH_ROLES.TA} />,
                children: [
                    { index: true, element: <TADashboard /> },
                    { path: 'courses/:courseId', element: <TACourseView /> },
                ]
            }
        ]
    },
    {
        path: '*',
        element: <NotFound />
    }
]);
