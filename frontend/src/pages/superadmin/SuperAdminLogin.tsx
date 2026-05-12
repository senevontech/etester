import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Eye, EyeOff, ArrowRight, Moon, Sun, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const SuperAdminLogin: React.FC = () => {
    const navigate = useNavigate();
    const { login, user, isAuthenticated, loading: authLoading } = useAuth();
    const { theme, toggle } = useTheme();

    const [email, setEmail]     = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw]   = useState(false);
    const [error, setError]     = useState('');
    const [loading, setLoading] = useState(false);

    // If already logged in as superadmin, go straight to the dashboard
    useEffect(() => {
        if (authLoading) return;
        if (isAuthenticated && user?.role === 'superadmin') {
            navigate('/superadmin/dashboard', { replace: true });
        }
    }, [authLoading, isAuthenticated, user?.role, navigate]);

    const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await login(email.trim().toLowerCase(), password);
        setLoading(false);

        if (!result.success) {
            setError(result.error ?? 'Login failed.');
            return;
        }

        // login() updates user state asynchronously — the useEffect above
        // will fire once user.role is resolved and redirect if superadmin.
        // But we can also check synchronously via a fresh read from context
        // (user is stale here). The useEffect handles the redirect.
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg)',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <div style={{ width: '28px', height: '28px', background: 'linear-gradient(135deg, #f59e0b, #f97316)', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={14} style={{ color: 'white' }} />
                    </div>
                    <div>
                        <p style={{ fontWeight: 900, fontSize: '0.9rem', letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1, fontFamily: 'Manrope' }}>Etester</p>
                        <p style={{ fontSize: '9px', fontWeight: 800, color: '#f59e0b', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1, marginTop: '1px', fontFamily: 'Manrope' }}>Super Admin Portal</p>
                    </div>
                </div>
                <button
                    onClick={toggle}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}
                    aria-label="Toggle theme"
                >
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
            </div>

            {/* Center content */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
                <div style={{ width: '100%', maxWidth: '400px' }}>

                    {/* Icon + heading */}
                    <div style={{ textAlign: 'center', marginBottom: '2.25rem' }}>
                        <div style={{
                            width: '64px', height: '64px',
                            background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                            borderRadius: '18px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 1.25rem',
                            boxShadow: '0 8px 28px rgba(245,158,11,0.4)',
                        }}>
                            <Sparkles size={28} style={{ color: 'white' }} />
                        </div>
                        <h1 style={{ fontWeight: 900, fontSize: '1.6rem', letterSpacing: '-0.04em', color: 'var(--text)', fontFamily: 'Manrope', marginBottom: '0.375rem' }}>
                            Super Admin Login
                        </h1>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'Manrope' }}>
                            Restricted access — authorised personnel only.
                        </p>
                    </div>

                    {/* Form card */}
                    <form
                        onSubmit={handleSubmit}
                        style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '18px',
                            padding: '2rem',
                            boxShadow: 'var(--shadow)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.125rem',
                        }}
                    >
                        {/* Email */}
                        <div>
                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '7px', fontFamily: 'Manrope' }}>
                                Email
                            </label>
                            <input
                                className="input"
                                type="email"
                                placeholder="superadmin@etester.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoComplete="username"
                                autoFocus
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '7px', fontFamily: 'Manrope' }}>
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="input"
                                    type={showPw ? 'text' : 'password'}
                                    placeholder="••••••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                    style={{ paddingRight: '2.75rem' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw(p => !p)}
                                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
                                >
                                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', padding: '0.75rem', background: 'var(--danger-bg)', border: '1px solid rgba(220,53,69,0.35)', borderRadius: '10px' }}>
                                <ShieldAlert size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '1px' }} />
                                <p style={{ fontSize: '13px', color: 'var(--danger)', fontFamily: 'Manrope', fontWeight: 600 }}>{error}</p>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                padding: '0.875rem', borderRadius: '10px', border: 'none',
                                background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                                color: 'white', fontWeight: 800, fontSize: '14px', fontFamily: 'Manrope',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.75 : 1,
                                boxShadow: '0 4px 16px rgba(245,158,11,0.35)',
                                transition: 'opacity 0.15s',
                                marginTop: '0.25rem',
                            }}
                        >
                            {loading
                                ? <><div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Signing in…</>
                                : <><span>Sign In</span><ArrowRight size={16} /></>
                            }
                        </button>
                    </form>

                    {/* Divider note */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0 0' }}>
                        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Manrope', whiteSpace: 'nowrap' }}>Not a super admin?</p>
                        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                    </div>
                    <a
                        href="/login"
                        style={{ display: 'block', textAlign: 'center', marginTop: '0.875rem', fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'Manrope', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                        Go to regular login →
                    </a>
                </div>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default SuperAdminLogin;
