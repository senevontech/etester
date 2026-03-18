import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Moon, Sun, Menu, X, ShieldAlert, LogOut, ChevronDown } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';

interface NavbarProps {
    activeTab?: 'dashboard' | 'progress' | 'faq';
}

const Navbar: React.FC<NavbarProps> = ({ activeTab = 'dashboard' }) => {
    const { theme, toggle } = useTheme();
    const { user, logout, isAuthenticated } = useAuth();
    const { activeOrg, userOrgs, switchOrg } = useOrg();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const initials = user?.name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() ?? '?';

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    return (
        <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--bg)', borderBottom: '1px solid var(--border)', transition: 'background 0.25s ease' }}>
            <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
                {/* Logo */}
                <Link to={isAuthenticated ? (user?.role === 'admin' ? '/admin' : '/dashboard') : '/'} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
                    <img
                        src="/logo.png"
                        alt="Etester"
                        style={{ height: '32px', width: 'auto', maxWidth: '140px', objectFit: 'contain', display: 'block' }}
                    />
                </Link>

                {/* Desktop Nav */}
                <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} className="desktop-nav">
                    {user?.role === 'student' && (
                        <>
                            <Link to="/dashboard" style={{ padding: '0.375rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, color: activeTab === 'dashboard' ? 'var(--text)' : 'var(--text-muted)', background: activeTab === 'dashboard' ? 'var(--surface)' : 'transparent', transition: 'all 0.15s ease', textDecoration: 'none' }}>
                                Dashboard
                            </Link>
                            <Link to="/progress" style={{ padding: '0.375rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', transition: 'all 0.15s ease' }}>
                                My Progress
                            </Link>
                        </>
                    )}
                    {user?.role === 'admin' && (
                        <Link to="/admin" style={{ padding: '0.375rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <ShieldAlert size={14} /> Admin Panel
                        </Link>
                    )}
                </nav>

                {/* Right side */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {/* Public actions */}
                    {!isAuthenticated && (
                        <div className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Link to="/login" className="btn btn-sm btn-ghost">
                                Sign in
                            </Link>
                            <Link to="/signup" className="btn btn-sm btn-primary">
                                Sign up
                            </Link>
                        </div>
                    )}

                    {/* Theme toggle */}
                    <button onClick={toggle} className="icon-btn" aria-label="Toggle theme">
                        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>

                    {/* User menu */}
                    {user && (
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setUserMenuOpen(o => !o)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.75rem', borderLeft: '1px solid var(--border)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px', padding: '0.375rem 0.625rem', transition: 'background 0.15s ease' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface-raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-2)', flexShrink: 0 }}>
                                    {initials}
                                </div>
                                <div style={{ textAlign: 'left' }} className="desktop-only">
                                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>{user.name}</p>
                                    <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.1 }}>{user.role}</p>
                                </div>
                                <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} className="desktop-only" />
                            </button>

                            {userMenuOpen && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setUserMenuOpen(false)} />
                                    <div className="anim-fade-in" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 100, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', minWidth: '180px', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                                        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
                                            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1px' }}>{user.name}</p>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</p>
                                        </div>
                                        {userOrgs.length > 0 && (
                                            <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                                                <p style={{ padding: '0 1rem', fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Organizations</p>
                                                {userOrgs.map(org => (
                                                    <button key={org.id} onClick={() => { switchOrg(org.id); setUserMenuOpen(false); }}
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.375rem 1rem', fontSize: '0.8rem', fontWeight: 600, color: org.id === activeOrg?.id ? 'var(--accent)' : 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s', fontFamily: 'Manrope, sans-serif' }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        {org.name}
                                                        {org.id === activeOrg?.id && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />}
                                                    </button>
                                                ))}
                                                <Link to="/org-setup" onClick={() => setUserMenuOpen(false)}
                                                    style={{ display: 'block', padding: '0.375rem 1rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', transition: 'background 0.1s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    + Join / Create Org
                                                </Link>
                                            </div>
                                        )}
                                        {user.role === 'admin' && (
                                            <Link to="/admin" onClick={() => setUserMenuOpen(false)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-2)', textDecoration: 'none', transition: 'background 0.1s' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <ShieldAlert size={14} /> Admin Panel
                                            </Link>
                                        )}
                                        <button onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', borderTop: '1px solid var(--border)', textAlign: 'left', transition: 'background 0.1s', fontFamily: 'Manrope, sans-serif' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-bg)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <LogOut size={14} /> Sign Out
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Mobile menu toggle */}
                    <button className="icon-btn mobile-menu-btn" onClick={() => setMobileOpen(o => !o)} aria-label="Toggle menu">
                        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>
            </div>

            {/* Mobile dropdown */}
            {mobileOpen && (
                <div className="anim-fade-in" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)', padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {!isAuthenticated && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <Link to="/login" onClick={() => setMobileOpen(false)} className="btn btn-md btn-outline" style={{ width: '100%' }}>
                                Sign in
                            </Link>
                            <Link to="/signup" onClick={() => setMobileOpen(false)} className="btn btn-md btn-primary hover-glow" style={{ width: '100%' }}>
                                Sign up
                            </Link>
                            <div className="divider" style={{ marginTop: '0.5rem' }} />
                        </div>
                    )}
                    {user?.role === 'student' && (
                        <>
                            <Link to="/dashboard" onClick={() => setMobileOpen(false)} style={{ padding: '0.625rem 0.75rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 700, color: activeTab === 'dashboard' ? 'var(--text)' : 'var(--text-muted)', background: activeTab === 'dashboard' ? 'var(--surface)' : 'transparent', textDecoration: 'none' }}>
                                Dashboard
                            </Link>
                            <Link to="/progress" onClick={() => setMobileOpen(false)} style={{ padding: '0.625rem 0.75rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 700, color: activeTab === 'progress' ? 'var(--text)' : 'var(--text-muted)', background: activeTab === 'progress' ? 'var(--surface)' : 'transparent', textDecoration: 'none' }}>
                                My Progress
                            </Link>
                        </>
                    )}
                    {user?.role === 'admin' && (
                        <Link to="/admin" onClick={() => setMobileOpen(false)} style={{ padding: '0.625rem 0.75rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ShieldAlert size={14} /> Admin Panel
                        </Link>
                    )}
                    <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                        {user && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface-raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-2)' }}>
                                    {initials}
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{user.name}</p>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.2 }}>{user.role}</p>
                                </div>
                            </div>
                        )}
                        {user && (
                            <button onClick={() => { setMobileOpen(false); handleLogout(); }}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.75rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '8px', textAlign: 'left', fontFamily: 'Manrope, sans-serif' }}>
                                <LogOut size={14} /> Sign Out
                            </button>
                        )}
                    </div>
                </div>
            )}

            <style>{`
        @media (min-width: 768px) { .mobile-menu-btn { display: none !important; } }
        @media (max-width: 767px) { .desktop-nav { display: none !important; } .desktop-only { display: none !important; } }
      `}</style>
        </header>
    );
};

export default Navbar;
