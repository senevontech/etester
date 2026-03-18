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
import AdminDashboard from './pages/admin/AdminDashboard';
import TestEditor from './pages/admin/TestEditor';
import AdminTestResults from './pages/admin/AdminTestResults';
import AdminStudents from './pages/admin/AdminStudents';
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

                                    {/* Protected Admin Routes */}
                                    <Route
                                        path="/admin"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <AdminDashboard />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/test/:testId"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <TestEditor />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/test/:testId/results"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <AdminTestResults />
                                            </ProtectedRoute>
                                        }
                                    />
                                    <Route
                                        path="/admin/students"
                                        element={
                                            <ProtectedRoute requiredRole="admin">
                                                <AdminStudents />
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
