import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import NotFound from './pages/NotFound';
import StudentDashboard from './pages/student/Dashboard';
// import FacultyDashboard from './pages/faculty/Dashboard'; // Placeholder

// Simple placeholder components for now
const FacultyDashboard = () => <div className="p-4">Faculty Dashboard (Coming Soon)</div>;

function App() {
  return (
    <Router>
      <Routes>
        {/* Redirect root to student dashboard for now (or login later) */}
        <Route path="/" element={<Navigate to="/student" replace />} />

        {/* Student Routes */}
        <Route path="/student" element={<DashboardLayout />}>
          <Route index element={<StudentDashboard />} />
          {/* Add more student routes here */}
        </Route>

        {/* Faculty Routes */}
        <Route path="/faculty" element={<DashboardLayout />}>
          <Route index element={<FacultyDashboard />} />
          {/* Add more faculty routes here */}
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
