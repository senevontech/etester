import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { OrgProvider } from './context/OrgContext';
import { TestProvider } from './context/TestContext';
import { ResultProvider } from './context/ResultContext';
import ProtectedRoute from './components/Auth/ProtectedRoute';

import Dashboard from './pages/Dashboard';
import Progress from './pages/Progress';
import TestRoom from './pages/TestRoom';
import PreTestGate from './pages/PreTestGate';
import SubAdminDashboard from './pages/subadmin/SubAdminDashboard';
import SubAdminTestEditor from './pages/subadmin/SubAdminTestEditor';
import SubAdminTestResults from './pages/subadmin/SubAdminTestResults';
import SubAdminStudents from './pages/subadmin/SubAdminStudents';
import SubAdminGroups from './pages/subadmin/SubAdminGroups';
import SubAdminMonitor from './pages/subadmin/SubAdminMonitor';
import AdminUserManagement from './pages/admin/AdminUserManagement';
import AdminDashboard from './pages/admin/AdminDashboard';
import SuperAdminLogin from './pages/superadmin/SuperAdminLogin';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';
import SuperAdminUsers from './pages/superadmin/SuperAdminUsers';
import SuperAdminUserManagement from './pages/superadmin/SuperAdminUserManagement';
import SuperAdminCreateSuperAdmin from './pages/superadmin/SuperAdminCreateSuperAdmin';
import SuperAdminAnalytics from './pages/superadmin/SuperAdminAnalytics';
import SuperAdminAdminDetails from './pages/superadmin/SuperAdminAdminDetails';
import SubAdminOverview from './pages/subadmin/SubAdminOverview';
import AssignmentManagement from './pages/shared/AssignmentManagement';
import InterviewManagement from './pages/shared/InterviewManagement';
import RecentActivity from './pages/shared/RecentActivity';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import OrgSetup from './pages/auth/OrgSetup';
import Home from './pages/Home';
import WhoMadeIt from './pages/WhoMadeIt';
import './index.css';

function App() {
    return (
        <Router>
            <ThemeProvider>
                <AuthProvider>
                    <OrgProvider>
                        <TestProvider>
                            <ResultProvider>
                                <Routes>
                                    {/* Public Routes */}
                                    <Route path="/" element={<Home />} />
                                    <Route path="/whomadeit" element={<WhoMadeIt />} />
                                    <Route path="/login" element={<Login />} />
                                    <Route path="/signup" element={<Signup />} />

                                    {/* Org Setup - Authenticated, but no active org yet */}
                                    <Route path="/org-setup" element={
                                        <ProtectedRoute>
                                            <OrgSetup />
                                        </ProtectedRoute>
                                    } />

                                    {/* Protected Student Routes */}
                                    <Route
                                        path="/dashboard"
                                        element={
                                            <ProtectedRoute requiredRole="student">
                                                <Dashboard />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/test/:testId/pre-gate"
                                        element={
                                            <ProtectedRoute requiredRole="student">
                                                <PreTestGate />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/test/:testId"
                                        element={
                                            <ProtectedRoute requiredRole="student">
                                                <TestRoom />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/progress"
                                        element={
                                            <ProtectedRoute requiredRole="student">
                                                <Progress />
                                            </ProtectedRoute>
                                        }
                                    />

                                    {/* Protected Sub Admin Routes */}
                                    <Route
                                        path="/subadmin"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <Navigate to="/subadmin/dashboard" replace />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/subadmin/dashboard"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <SubAdminOverview />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/subadmin/tests"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <SubAdminDashboard />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/subadmin/assignments"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <AssignmentManagement role="subadmin" />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/subadmin/interviews"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <InterviewManagement role="subadmin" />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/subadmin/activity"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <RecentActivity role="subadmin" />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/subadmin/test/:testId"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <SubAdminTestEditor />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/subadmin/test/:testId/results"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <SubAdminTestResults />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/subadmin/students"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <SubAdminStudents />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/subadmin/groups"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <SubAdminGroups />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/subadmin/monitor"
                                        element={
                                            <ProtectedRoute requiredRole="subadmin">
                                                <SubAdminMonitor />
                                            </ProtectedRoute>
                                        }
                                    />
                                    {/* Protected Admin Routes */}
                                    <Route
                                        path="/admin"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <Navigate to="/admin/dashboard" replace />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/dashboard"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <AdminDashboard />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/users"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <AdminUserManagement />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/tests"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <SubAdminDashboard />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/assignments"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <AssignmentManagement role="admin" />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/interviews"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <InterviewManagement role="admin" />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/activity"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <RecentActivity role="admin" />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/test/:testId"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <SubAdminTestEditor />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/test/:testId/results"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <SubAdminTestResults />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/students"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <SubAdminStudents />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/groups"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <SubAdminGroups />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/monitor"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <SubAdminMonitor />
                                            </ProtectedRoute>
                                        }
                                    />

                                    {/* Super Admin Routes */}
                                    <Route path="/superadmin" element={<SuperAdminLogin />} />
                                    <Route
                                        path="/superadmin/dashboard"
                                        element={
                                            <ProtectedRoute requiredRole="superadmin">
                                                <SuperAdminDashboard />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/superadmin/users"
                                        element={
                                            <ProtectedRoute requiredRole="superadmin">
                                                <SuperAdminUsers />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/superadmin/admins"
                                        element={
                                            <ProtectedRoute requiredRole="superadmin">
                                                <SuperAdminUserManagement />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/superadmin/analytics"
                                        element={
                                            <ProtectedRoute requiredRole="superadmin">
                                                <SuperAdminAnalytics />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/superadmin/admins/:adminId"
                                        element={
                                            <ProtectedRoute requiredRole="superadmin">
                                                <SuperAdminAdminDetails />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/superadmin/create"
                                        element={
                                            <ProtectedRoute requiredRole="superadmin">
                                                <SuperAdminCreateSuperAdmin />
                                            </ProtectedRoute>
                                        }
                                    />

                                    {/* Fallback */}
                                    <Route path="*" element={<Navigate to="/" replace />} />
                                </Routes>
                            </ResultProvider>
                        </TestProvider>
                    </OrgProvider>
                </AuthProvider>
            </ThemeProvider>
        </Router>
    );
}

export default App;
