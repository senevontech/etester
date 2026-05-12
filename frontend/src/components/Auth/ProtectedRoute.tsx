import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole?: 'superadmin' | 'admin' | 'subadmin' | 'student';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
    const { isAuthenticated, loading: authLoading, user } = useAuth();
    const { activeOrg, loading: orgLoading } = useOrg();
    const location = useLocation();

    // While restoring session/org, or while the org role is still being resolved, show a loader.
    // Without this, role-gated routes can briefly redirect before OrgContext updates the stored role.
    if (authLoading || orgLoading || (requiredRole && isAuthenticated && activeOrg && user && user.role === null)) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid var(--border-strong)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Superadmin lives above org context — skip the org-setup gate entirely
    const isSuperAdmin = user?.role === 'superadmin';
    const hasRoleAccess = (() => {
        if (!requiredRole) return true;
        if (!user?.role) return false;
        if (user.role === requiredRole) return true;
        if (requiredRole === 'subadmin' && user.role === 'admin') return true;
        return false;
    })();

    const canUseOrgSetup = user?.role === 'admin' || user?.role === 'superadmin';

    // Only admin/superadmin should be pushed into org setup.
    if (!activeOrg && !isSuperAdmin && canUseOrgSetup && location.pathname !== '/org-setup') {
        return <Navigate to="/org-setup" replace />;
    }

    // Role check — determined by org membership loaded in OrgContext (or global role for superadmin)
    if (requiredRole && !hasRoleAccess) {
        const fallback = user?.role === 'superadmin' ? '/superadmin/dashboard'
            : user?.role === 'admin' ? '/admin/dashboard'
            : user?.role === 'subadmin' ? '/subadmin/dashboard'
            : '/';
        return <Navigate to={fallback} replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
