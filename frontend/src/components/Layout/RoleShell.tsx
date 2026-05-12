import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, BookOpen, LogOut, ShieldCheck, UserCog } from 'lucide-react';
import Navbar from './Navbar';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';

type ShellRole = 'admin' | 'subadmin';
type NavKey = 'dashboard' | 'users' | 'tests' | 'assignments' | 'interviews' | 'activity';

interface RoleShellProps {
    role: ShellRole;
    activeKey: NavKey;
    children: React.ReactNode;
}

const navConfig: Record<ShellRole, Array<{ key: NavKey; label: string; to: string; icon: React.ComponentType<{ size?: number }> }>> = {
    admin: [
        { key: 'dashboard', label: 'Dashboard', to: '/admin/dashboard', icon: BarChart3 },
        { key: 'users', label: 'User Management', to: '/admin/users', icon: UserCog },
        { key: 'tests', label: 'Test Management', to: '/admin/tests', icon: BookOpen },
        { key: 'assignments', label: 'Assignment Management', to: '/admin/assignments', icon: ShieldCheck },
        { key: 'interviews', label: 'Interview Management', to: '/admin/interviews', icon: Activity },
        { key: 'activity', label: 'Recent Activity', to: '/admin/activity', icon: Activity },
    ],
    subadmin: [
        { key: 'dashboard', label: 'Dashboard', to: '/subadmin/dashboard', icon: BarChart3 },
        { key: 'tests', label: 'Test Management', to: '/subadmin/tests', icon: BookOpen },
        { key: 'assignments', label: 'Assignment Management', to: '/subadmin/assignments', icon: ShieldCheck },
        { key: 'interviews', label: 'Interview Management', to: '/subadmin/interviews', icon: Activity },
        { key: 'activity', label: 'Recent Activity', to: '/subadmin/activity', icon: Activity },
    ],
};

const RoleShell: React.FC<RoleShellProps> = ({ role, activeKey, children }) => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { activeOrg } = useOrg();

    const navItems = navConfig[role];
    const roleLabel = role === 'admin' ? 'Admin Workspace' : 'Subadmin Workspace';

    const handleLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar />

            <div className="container" style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr)', gap: '1.25rem', paddingTop: '1.25rem', paddingBottom: '3rem' }}>
                <aside className="role-shell-sidebar" style={{ alignSelf: 'start', position: 'sticky', top: '72px' }}>
                    <div className="card" style={{ padding: '1rem', marginBottom: '0.875rem' }}>
                        <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>{roleLabel}</p>
                        <p className="t-h3" style={{ marginBottom: '0.25rem' }}>{activeOrg?.name ?? 'Organization'}</p>
                        <p className="t-small" style={{ color: 'var(--text-muted)' }}>{user?.email ?? ''}</p>
                    </div>

                    <nav className="card" style={{ padding: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {navItems.map(({ key, label, to, icon: Icon }) => {
                            const active = key === activeKey;
                            return (
                                <Link
                                    key={key}
                                    to={to}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.6rem',
                                        padding: '0.7rem 0.8rem',
                                        borderRadius: '12px',
                                        textDecoration: 'none',
                                        color: active ? 'var(--text)' : 'var(--text-muted)',
                                        background: active ? 'var(--surface-raised)' : 'transparent',
                                        border: active ? '1px solid var(--border)' : '1px solid transparent',
                                        fontWeight: active ? 800 : 700,
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    <Icon size={16} />
                                    <span>{label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <button className="btn btn-md btn-outline" style={{ width: '100%', marginTop: '0.875rem', gap: '0.45rem' }} onClick={() => void handleLogout()}>
                        <LogOut size={14} /> Sign Out
                    </button>
                </aside>

                <div style={{ minWidth: 0 }}>
                    {children}
                </div>
            </div>

            <style>{`
                @media (max-width: 900px) {
                    .role-shell-sidebar {
                        position: static !important;
                    }
                    .container {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default RoleShell;
