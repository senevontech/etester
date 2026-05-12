import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Sparkles, UserPlus, ArrowLeft, Eye, EyeOff,
    Check, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { apiRequest, ApiError } from '../../lib/api';
import { Moon, Sun, LogOut } from 'lucide-react';

// ── Shared navbar (same as SuperAdminUserManagement) ──────────────────────────

const SuperAdminNavbar: React.FC = () => {
    const { user, logout } = useAuth();
    const { theme, toggle } = useTheme();
    const navigate = useNavigate();
    const initials = (user?.name ?? 'S').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

    const handleLogout = async () => { await logout(); navigate('/login', { replace: true }); };

    return (
        <nav style={{ height: '56px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 1.5rem', gap: '1rem', position: 'sticky', top: 0, zIndex: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <div style={{ width: '28px', height: '28px', background: 'linear-gradient(135deg, #f59e0b, #f97316)', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={14} style={{ color: 'white' }} />
                </div>
                <div>
                    <p style={{ fontWeight: 900, fontSize: '0.875rem', letterSpacing: '-0.02em', color: 'var(--text)', fontFamily: 'Manrope', lineHeight: 1 }}>Etester</p>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, marginTop: '1px', fontFamily: 'Manrope' }}>Super Admin</p>
                </div>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '4px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: 'white' }}>{initials}</div>
                <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', lineHeight: 1, fontFamily: 'Manrope' }}>{user?.name}</p>
                    <p style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1, fontFamily: 'Manrope' }}>Super Admin</p>
                </div>
            </div>
            <button onClick={() => void handleLogout()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center' }} title="Logout">
                <LogOut size={15} />
            </button>
        </nav>
    );
};

// ── Password strength ──────────────────────────────────────────────────────────

const getStrength = (pw: string): { score: number; label: string; color: string } => {
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    if (score <= 1) return { score, label: 'Weak',   color: 'var(--danger)' };
    if (score <= 2) return { score, label: 'Fair',   color: '#f59e0b' };
    if (score <= 3) return { score, label: 'Good',   color: '#3b82f6' };
    return              { score, label: 'Strong', color: 'var(--success)' };
};

const StrengthBar: React.FC<{ password: string }> = ({ password }) => {
    if (!password) return null;
    const { score, label, color } = getStrength(password);
    const segments = 5;
    return (
        <div style={{ marginTop: '6px' }}>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                {Array.from({ length: segments }).map((_, i) => (
                    <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i < score ? color : 'var(--border)', transition: 'background 0.25s' }} />
                ))}
            </div>
            <p style={{ fontSize: '11px', fontWeight: 700, color, fontFamily: 'Manrope' }}>{label}</p>
        </div>
    );
};

// ── Created account card ───────────────────────────────────────────────────────

interface CreatedAccount { name: string; email: string; role: string; }

const SuccessCard: React.FC<{ account: CreatedAccount; onAnother: () => void; onManage: () => void }> = ({ account, onAnother, onManage }) => (
    <div style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', background: 'linear-gradient(135deg, #f59e0b22, #f9731622)', border: '2px solid #f59e0b44', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <ShieldCheck size={28} style={{ color: '#f59e0b' }} />
        </div>
        <h2 style={{ fontWeight: 900, fontSize: '1.4rem', color: 'var(--text)', fontFamily: 'Manrope', marginBottom: '0.5rem' }}>Account Created</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'Manrope', marginBottom: '2rem', lineHeight: 1.6 }}>
            The new Super Admin account is ready to use.
        </p>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.5rem', marginBottom: '2rem', textAlign: 'left' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.75rem 0', fontSize: '14px', fontFamily: 'Manrope' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Name</span>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{account.name}</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Email</span>
                <span style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>{account.email}</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Role</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: '#f59e0b' }}>
                    <Sparkles size={12} /> Super Admin
                </span>
            </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={onAnother} style={{ flex: 1, padding: '0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px', color: 'var(--text)', fontFamily: 'Manrope' }}>
                Create Another
            </button>
            <button onClick={onManage} style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #f59e0b, #f97316)', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 800, fontSize: '14px', color: 'white', fontFamily: 'Manrope', boxShadow: '0 4px 14px rgba(245,158,11,0.35)' }}>
                View All Admins
            </button>
        </div>
    </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────

const SuperAdminCreateSuperAdmin: React.FC = () => {
    const navigate = useNavigate();
    const nameRef = useRef<HTMLInputElement>(null);

    const [name, setName]         = useState('');
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm]   = useState('');
    const [showPw, setShowPw]     = useState(false);
    const [showCf, setShowCf]     = useState(false);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState<string | null>(null);
    const [created, setCreated]   = useState<CreatedAccount | null>(null);

    const pwMatch   = confirm === '' || password === confirm;
    const canSubmit = name.trim() && email.trim() && password.length >= 8 && password === confirm;

    const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!canSubmit) return;
        setLoading(true);
        setError(null);
        try {
            await apiRequest('/superadmin/users', {
                method: 'POST',
                body: { name: name.trim(), email: email.trim(), password, role: 'superadmin' },
            });
            setCreated({ name: name.trim(), email: email.trim(), role: 'superadmin' });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to create account.');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setName(''); setEmail(''); setPassword(''); setConfirm('');
        setCreated(null); setError(null);
        setTimeout(() => nameRef.current?.focus(), 50);
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <SuperAdminNavbar />

            {/* Sub-header */}
            <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(249,115,22,0.03) 100%)', borderBottom: '1px solid var(--border)' }}>
                <div className="container" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/superadmin/admins')}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 600, fontSize: '13px', fontFamily: 'Manrope', padding: '4px 8px', borderRadius: '6px' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                        <ArrowLeft size={14} /> All Admins
                    </button>
                    <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={14} style={{ color: '#f59e0b' }} />
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)', fontFamily: 'Manrope' }}>Create Super Admin</span>
                    </div>
                </div>
            </div>

            <main className="container" style={{ paddingTop: '3rem', paddingBottom: '5rem' }}>
                {created ? (
                    <SuccessCard
                        account={created}
                        onAnother={resetForm}
                        onManage={() => navigate('/superadmin/admins')}
                    />
                ) : (
                    <div style={{ maxWidth: '520px', margin: '0 auto' }}>

                        {/* Header */}
                        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                            <div style={{ width: '60px', height: '60px', background: 'linear-gradient(135deg, #f59e0b, #f97316)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', boxShadow: '0 8px 24px rgba(245,158,11,0.35)' }}>
                                <UserPlus size={26} style={{ color: 'white' }} />
                            </div>
                            <h1 style={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-0.03em', color: 'var(--text)', fontFamily: 'Manrope', marginBottom: '0.5rem' }}>New Super Admin</h1>
                            <p style={{ fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'Manrope', lineHeight: 1.6, maxWidth: '380px', margin: '0 auto' }}>
                                Super admins have full platform access and can create other admins. Only add trusted people.
                            </p>
                        </div>

                        {/* Form card */}
                        <form
                            onSubmit={handleSubmit}
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '18px', padding: '2rem', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
                        >
                            {/* Name */}
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '7px', fontFamily: 'Manrope' }}>Full Name</label>
                                <input
                                    ref={nameRef}
                                    className="input"
                                    placeholder="e.g. Rajan Mehta"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>

                            {/* Email */}
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '7px', fontFamily: 'Manrope' }}>Email Address</label>
                                <input
                                    className="input"
                                    type="email"
                                    placeholder="rajan@example.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '7px', fontFamily: 'Manrope' }}>Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="input"
                                        type={showPw ? 'text' : 'password'}
                                        placeholder="Min. 8 characters"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        style={{ paddingRight: '2.75rem' }}
                                    />
                                    <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                                <StrengthBar password={password} />
                            </div>

                            {/* Confirm password */}
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '7px', fontFamily: 'Manrope' }}>Confirm Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="input"
                                        type={showCf ? 'text' : 'password'}
                                        placeholder="Repeat the password"
                                        value={confirm}
                                        onChange={e => setConfirm(e.target.value)}
                                        required
                                        style={{ paddingRight: '2.75rem', borderColor: !pwMatch ? 'var(--danger)' : undefined }}
                                    />
                                    <button type="button" onClick={() => setShowCf(p => !p)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                                        {showCf ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                                {!pwMatch && confirm && (
                                    <p style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '5px', fontFamily: 'Manrope', fontWeight: 600 }}>Passwords do not match.</p>
                                )}
                                {pwMatch && confirm && (
                                    <p style={{ fontSize: '11px', color: 'var(--success)', marginTop: '5px', fontFamily: 'Manrope', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Check size={11} /> Passwords match
                                    </p>
                                )}
                            </div>

                            {/* Error */}
                            {error && (
                                <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', padding: '0.75rem', background: 'var(--danger-bg)', border: '1px solid rgba(220,53,69,0.3)', borderRadius: '10px' }}>
                                    <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '1px' }} />
                                    <p style={{ fontSize: '13px', color: 'var(--danger)', fontFamily: 'Manrope' }}>{error}</p>
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading || !canSubmit}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    padding: '0.875rem', borderRadius: '10px', border: 'none',
                                    background: canSubmit ? 'linear-gradient(135deg, #f59e0b, #f97316)' : 'var(--surface)',
                                    color: canSubmit ? 'white' : 'var(--text-muted)',
                                    fontWeight: 800, fontSize: '14px', fontFamily: 'Manrope',
                                    cursor: loading || !canSubmit ? 'not-allowed' : 'pointer',
                                    boxShadow: canSubmit ? '0 4px 16px rgba(245,158,11,0.35)' : 'none',
                                    transition: 'all 0.2s', marginTop: '0.25rem',
                                }}
                            >
                                {loading
                                    ? <><div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Creating…</>
                                    : <><UserPlus size={16} /> Create Super Admin</>
                                }
                            </button>
                        </form>

                        {/* Note */}
                        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', marginTop: '1.25rem', fontFamily: 'Manrope', lineHeight: 1.6 }}>
                            The account will be active immediately. Share credentials securely — they cannot be recovered after creation.
                        </p>
                    </div>
                )}
            </main>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default SuperAdminCreateSuperAdmin;
