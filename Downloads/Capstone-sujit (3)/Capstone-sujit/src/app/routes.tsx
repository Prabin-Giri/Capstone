import { createBrowserRouter } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import AuthPage from '../pages/auth/AuthPage';
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
import FacultyAssignmentRunner from '../pages/faculty/FacultyAssignmentRunner';
import SubmissionPreviewPage from '../pages/faculty/SubmissionPreviewPage';
import NotFound from '../pages/NotFound';
import AdminDashboard from '../pages/admin/AdminDashboard';
import DatabaseExplorer from '../pages/admin/DatabaseExplorer';
import FacultyManagement from '../pages/admin/FacultyManagement';
import UserManagement from '../pages/admin/UserManagement';
import TAManagement from '../pages/admin/TAManagement';
import CourseOversight from '../pages/admin/CourseOversight';
import AdminReports from '../pages/admin/AdminReports';
import TADashboard from '../pages/ta/TADashboard';
import TACourseView from '../pages/ta/TACourseView';
import UserDashboard from '../pages/user/UserDashboard';
import CodeRunner from '../pages/CodeRunner';
import { AUTH_ROLES } from '../lib/auth';

export const router = createBrowserRouter([
    {
        path: '/',
        element: <AuthPage />,
    },
    {
        path: '/login',
        element: <AuthPage />,
    },
    {
        path: '/signup',
        element: <AuthPage />,
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
                path: 'run',
                element: <ProtectedRoute requiredRole={[AUTH_ROLES.STUDENT, AUTH_ROLES.TA, AUTH_ROLES.FACULTY, AUTH_ROLES.ADMIN, AUTH_ROLES.USER]} />,
                children: [
                    { index: true, element: <CodeRunner /> },
                ]
            },
            {
                path: 'user',
                element: <ProtectedRoute requiredRole={AUTH_ROLES.USER} />,
                children: [
                    { index: true, element: <UserDashboard /> },
                ]
            },
            {
                path: 'student',
                element: <ProtectedRoute requiredRole={[AUTH_ROLES.STUDENT, AUTH_ROLES.TA]} />,
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
                    { path: 'courses/:courseId/assignments/:assignmentId/run', element: <FacultyAssignmentRunner /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/grading/:submissionId', element: <SubmissionGrader /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/grading/:submissionId/preview', element: <SubmissionPreviewPage /> },
                    { path: 'courses/:courseId/gradebook', element: <CourseGradebook /> },
                ]
            },
            {
                path: 'ta',
                element: <ProtectedRoute requiredRole={AUTH_ROLES.TA} />,
                children: [
                    { index: true, element: <TADashboard /> },
                    { path: 'courses/:courseId', element: <TACourseView /> },
                    { path: 'courses/:courseId/assignments/new', element: <AssignmentWizard /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/edit', element: <AssignmentWizard /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/grading', element: <GradingDashboard /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/run', element: <FacultyAssignmentRunner /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/grading/:submissionId', element: <SubmissionGrader /> },
                    { path: 'courses/:courseId/assignments/:assignmentId/grading/:submissionId/preview', element: <SubmissionPreviewPage /> },
                    { path: 'courses/:courseId/gradebook', element: <CourseGradebook /> },
                ]
            },
            {
                path: 'admin',
                element: <ProtectedRoute requiredRole={AUTH_ROLES.ADMIN} />,
                children: [
                    { index: true, element: <AdminDashboard /> },
                    { path: 'database', element: <DatabaseExplorer /> },
                    { path: 'users', element: <UserManagement /> },
                    { path: 'faculty', element: <FacultyManagement /> },
                    { path: 'tas', element: <TAManagement /> },
                    { path: 'courses', element: <CourseOversight /> },
                    { path: 'reports', element: <AdminReports /> },
                ]
            }
        ]
    },
    {
        path: '*',
        element: <NotFound />
    }
]);
