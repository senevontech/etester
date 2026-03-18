import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Shield, Eye, EyeOff, ArrowRight, Moon, Sun, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useTheme } from '../../context/ThemeContext';

const Login: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, user, isAuthenticated, loading: authLoading } = useAuth();
    const { activeOrg, loading: orgLoading } = useOrg();
    const { theme, toggle } = useTheme();

    const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
    const infoMessage = (location.state as { message?: string } | null)?.message ?? '';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (authLoading || orgLoading || !isAuthenticated) return;

        if (from && from !== '/login') {
            navigate(from, { replace: true });
            return;
        }

        if (!activeOrg) {
            navigate('/org-setup', { replace: true });
            return;
        }

        navigate(user?.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    }, [activeOrg, authLoading, from, isAuthenticated, navigate, orgLoading, user?.role]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const result = await login(email, password);
        setLoading(false);
        if (!result.success) {
            setError(result.error ?? 'Login failed.');
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '26px', height: '26px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Shield size={14} color="var(--accent-fg)" strokeWidth={2.5} />
                    </div>
                    <span style={{ fontWeight: 900, fontSize: '0.95rem', letterSpacing: '-0.03em', color: 'var(--text)' }}>Etester</span>
                </div>
                <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
            </div>

            {/* Center content */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
                <div className="anim-fade-up" style={{ width: '100%', maxWidth: '400px' }}>

                    {/* Heading */}
                    <div style={{ marginBottom: '1.75rem' }}>
                        <h1 className="t-h1" style={{ marginBottom: '0.375rem' }}>Welcome back</h1>
                        <p className="t-body">Sign in to continue to Etester.</p>
                    </div>

                    {infoMessage && (
                        <div style={{ marginBottom: '1rem', padding: '0.625rem 0.875rem', background: 'var(--surface)', border: '1px solid var(--border-strong)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                            {infoMessage}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label className="label" htmlFor="email" style={{ display: 'block', marginBottom: '0.375rem' }}>Email</label>
                            <input id="email" type="email" className="input" placeholder="you@example.com"
                                value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus />
                        </div>

                        <div>
                            <label className="label" htmlFor="password" style={{ display: 'block', marginBottom: '0.375rem' }}>Password</label>
                            <div style={{ position: 'relative' }}>
                                <input id="password" type={showPw ? 'text' : 'password'} className="input"
                                    placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                                    required autoComplete="current-password" style={{ paddingRight: '2.75rem' }} />
                                <button type="button" onClick={() => setShowPw(p => !p)}
                                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div style={{ padding: '0.625rem 0.875rem', background: 'var(--danger-bg)', border: '1px solid var(--danger)', fontSize: '13px', fontWeight: 600, color: 'var(--danger)' }}>
                                {error}
                            </div>
                        )}

                        <button type="submit" className="btn btn-lg btn-primary hover-glow" style={{ width: '100%', marginTop: '0.25rem', gap: '0.5rem' }} disabled={loading}>
                            {loading
                                ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Signing in…</>
                                : <><span>Sign In</span><ArrowRight size={16} /></>}
                        </button>
                    </form>

                    <p className="t-small" style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '1.5rem' }}>
                        Don't have an account?{' '}
                        <Link to="/signup" style={{ color: 'var(--text)', fontWeight: 700, textDecoration: 'none' }}>
                            Create one
                        </Link>
                    </p>
                </div>
            </div>

            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
};

export default Login;
