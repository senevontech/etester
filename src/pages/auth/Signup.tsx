import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, ArrowRight, CheckCircle2, Moon, Sun, Loader2, House } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const PASSWORD_RULES = [
    { label: 'At least 6 characters', test: (p: string) => p.length >= 6 },
    { label: 'Contains a number', test: (p: string) => /\d/.test(p) },
];

const Signup: React.FC = () => {
    const navigate = useNavigate();
    const { signup } = useAuth();
    const { theme, toggle } = useTheme();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password !== confirm) { setError('Passwords do not match.'); return; }
        if (!PASSWORD_RULES.every(r => r.test(password))) { setError('Password does not meet requirements.'); return; }
        setLoading(true);
        const result = await signup(name, email, password);
        setLoading(false);
        if (!result.success) { setError(result.error ?? 'Registration failed.'); return; }
        if (result.pendingEmailConfirmation) {
            navigate('/login', {
                replace: true,
                state: { message: 'Account created. Check your email for the Supabase confirmation link, then sign in.' },
            });
            return;
        }
        // After signup they need to create or join an org
        navigate('/org-setup', { replace: true });
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Link to="/" className="btn btn-sm btn-ghost" style={{ gap: '0.375rem' }}>
                        <House size={14} /> Home
                    </Link>
                    <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
                        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                </div>
            </div>

            {/* Center */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
                <div className="anim-fade-up" style={{ width: '100%', maxWidth: '400px' }}>

                    {/* Heading */}
                    <div style={{ marginBottom: '1.75rem' }}>
                        <h1 className="t-h1" style={{ marginBottom: '0.375rem' }}>Create your account</h1>
                        <p className="t-body">After signing up, you can create or join an organization.</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                        <div>
                            <label className="label" htmlFor="name" style={{ display: 'block', marginBottom: '0.375rem' }}>Full Name</label>
                            <input id="name" type="text" className="input" placeholder="Your name here"
                                value={name} onChange={e => setName(e.target.value)} required autoFocus />
                        </div>

                        <div>
                            <label className="label" htmlFor="email" style={{ display: 'block', marginBottom: '0.375rem' }}>Email</label>
                            <input id="email" type="email" className="input" placeholder="you@example.com"
                                value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
                        </div>

                        <div>
                            <label className="label" htmlFor="password" style={{ display: 'block', marginBottom: '0.375rem' }}>Password</label>
                            <div style={{ position: 'relative' }}>
                                <input id="password" type={showPw ? 'text' : 'password'} className="input"
                                    placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                                    required style={{ paddingRight: '2.75rem' }} />
                                <button type="button" onClick={() => setShowPw(p => !p)}
                                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            {password.length > 0 && (
                                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {PASSWORD_RULES.map(rule => (
                                        <div key={rule.label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                            <CheckCircle2 size={11} style={{ color: rule.test(password) ? 'var(--success)' : 'var(--border-strong)', flexShrink: 0, transition: 'color 0.2s' }} />
                                            <span style={{ fontSize: '11px', fontWeight: 600, color: rule.test(password) ? 'var(--success)' : 'var(--text-muted)', transition: 'color 0.2s' }}>{rule.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="label" htmlFor="confirm" style={{ display: 'block', marginBottom: '0.375rem' }}>Confirm Password</label>
                            <input id="confirm" type={showPw ? 'text' : 'password'} className="input"
                                placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required
                                style={{ borderColor: confirm && confirm !== password ? 'var(--danger)' : undefined }} />
                            {confirm && confirm !== password && (
                                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--danger)', marginTop: '0.25rem' }}>Passwords don't match</p>
                            )}
                        </div>

                        {error && (
                            <div style={{ padding: '0.625rem 0.875rem', background: 'var(--danger-bg)', border: '1px solid var(--danger)', fontSize: '13px', fontWeight: 600, color: 'var(--danger)' }}>
                                {error}
                            </div>
                        )}

                        <button type="submit" className="btn btn-lg btn-primary hover-glow" style={{ width: '100%', marginTop: '0.25rem', gap: '0.5rem' }} disabled={loading}>
                            {loading
                                ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Creating account…</>
                                : <><span>Create Account</span><ArrowRight size={16} /></>}
                        </button>
                    </form>

                    <p className="t-small" style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '1.5rem' }}>
                        Already have an account?{' '}
                        <Link to="/login" style={{ color: 'var(--text)', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
                    </p>
                </div>
            </div>

            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
};

export default Signup;
