import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, LayoutDashboard, LogOut, Moon, Shield, Sun, UserCog, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

type SuperAdminNavKey = 'dashboard' | 'users' | 'admins' | 'analytics';

interface SuperAdminShellProps {
    activeKey: SuperAdminNavKey;
    children: React.ReactNode;
}

const navItems: Array<{ key: SuperAdminNavKey; label: string; to: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: 'dashboard', label: 'Dashboard', to: '/superadmin/dashboard', icon: LayoutDashboard },
    { key: 'users', label: 'User Management', to: '/superadmin/users', icon: Users },
    { key: 'admins', label: 'Admin Management', to: '/superadmin/admins', icon: UserCog },
    { key: 'analytics', label: 'Analytics', to: '/superadmin/analytics', icon: BarChart3 },
];

const SuperAdminShell: React.FC<SuperAdminShellProps> = ({ activeKey, children }) => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { theme, toggle } = useTheme();

    const initials = (user?.name ?? 'SA')
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const handleLogout = async () => {
        await logout();
        navigate('/superadmin', { replace: true });
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', minHeight: '100vh' }} className="superadmin-shell">
                <aside
                    className="superadmin-sidebar"
                    style={{
                        borderRight: '1px solid var(--border)',
                        background: 'var(--surface)',
                        padding: '1rem',
                        position: 'sticky',
                        top: 0,
                        height: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <Link to="/superadmin/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'var(--text)', marginBottom: '1.25rem' }}>
                        <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #f59e0b, #f97316)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Shield size={18} style={{ color: 'white' }} />
                        </div>
                        <div>
                            <p style={{ fontWeight: 900, fontSize: '0.95rem', lineHeight: 1, fontFamily: 'Manrope' }}>Etester</p>
                            <p style={{ fontSize: '10px', fontWeight: 800, color: '#f59e0b', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '3px', fontFamily: 'Manrope' }}>Super Admin</p>
                        </div>
                    </Link>

                    <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {navItems.map(({ key, label, to, icon: Icon }) => {
                            const active = key === activeKey;
                            return (
                                <Link
                                    key={key}
                                    to={to}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.65rem',
                                        padding: '0.75rem 0.85rem',
                                        borderRadius: '8px',
                                        textDecoration: 'none',
                                        color: active ? 'var(--text)' : 'var(--text-muted)',
                                        background: active ? 'var(--bg)' : 'transparent',
                                        border: active ? '1px solid var(--border)' : '1px solid transparent',
                                        fontWeight: active ? 850 : 700,
                                        fontSize: '0.9rem',
                                        fontFamily: 'Manrope',
                                    }}
                                >
                                    <Icon size={17} />
                                    <span>{label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.8rem' }}>
                            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '12px' }}>
                                {initials}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: '13px', lineHeight: 1.1, fontFamily: 'Manrope', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name ?? 'Super Admin'}</p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '3px', fontFamily: 'Manrope', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email ?? ''}</p>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr', gap: '0.5rem' }}>
                            <button className="btn btn-md btn-outline" onClick={toggle} aria-label="Toggle theme" title="Toggle theme" style={{ padding: 0 }}>
                                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                            </button>
                            <button className="btn btn-md btn-outline" onClick={() => void handleLogout()} style={{ gap: '0.45rem' }}>
                                <LogOut size={15} /> Sign Out
                            </button>
                        </div>
                    </div>
                </aside>

                <main style={{ minWidth: 0 }}>
                    {children}
                </main>
            </div>

            <style>{`
                @media (max-width: 900px) {
                    .superadmin-shell {
                        grid-template-columns: 1fr !important;
                    }
                    .superadmin-sidebar {
                        position: static !important;
                        height: auto !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default SuperAdminShell;
