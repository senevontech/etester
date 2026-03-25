import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ShieldAlert, ArrowRight, Plus, LogIn, Moon, Sun, Loader2, House } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const OrgSetup: React.FC = () => {
    const navigate = useNavigate();
    const { createOrg, joinOrgByInviteCode, activeOrg, loading: orgLoading } = useOrg();
    const { user, loading: authLoading } = useAuth();
    const { theme, toggle } = useTheme();

    const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
    const [orgName, setOrgName] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (authLoading || orgLoading || !activeOrg || !user?.role) return;
        navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    }, [activeOrg, authLoading, navigate, orgLoading, user?.role]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgName.trim()) return;
        setLoading(true); setError('');
        const { data, error: err } = await createOrg(orgName.trim());
        setLoading(false);
        if (err) { setError(err); return; }
        if (data) setMode('choose');
    };

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteCode.trim()) return;
        setLoading(true); setError('');
        const { error: err } = await joinOrgByInviteCode(inviteCode.trim());
        setLoading(false);
        if (err) { setError(err); return; }
        setMode('choose');
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
                    <button className="btn btn-sm btn-ghost" style={{ gap: '0.375rem' }} onClick={() => navigate('/')}>
                        <House size={14} /> Home
                    </button>
                    <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
                        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
                <div className="anim-fade-up" style={{ width: '100%', maxWidth: '420px' }}>

                    {mode === 'choose' && (
                        <>
                            <div style={{ marginBottom: '2.5rem' }}>
                                <h1 className="t-h1" style={{ marginBottom: '0.5rem' }}>Set up your workspace</h1>
                                <p className="t-body">Create a new organization or join one with an invite code.</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <button
                                    className="card hover-antigravity"
                                    style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', width: '100%', textAlign: 'left' }}
                                    onClick={() => setMode('create')}
                                >
                                    <div style={{ width: '40px', height: '40px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Plus size={20} color="white" />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '2px' }}>Create an organization</p>
                                        <p className="t-small" style={{ color: 'var(--text-muted)' }}>You'll be the admin. Add students via invite code.</p>
                                    </div>
                                    <ArrowRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0 }} />
                                </button>
                                <button
                                    className="card hover-antigravity"
                                    style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', width: '100%', textAlign: 'left' }}
                                    onClick={() => setMode('join')}
                                >
                                    <div style={{ width: '40px', height: '40px', background: 'var(--surface-raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <LogIn size={20} style={{ color: 'var(--text)' }} />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '2px' }}>Join an organization</p>
                                        <p className="t-small" style={{ color: 'var(--text-muted)' }}>Enter an invite code from your admin.</p>
                                    </div>
                                    <ArrowRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0 }} />
                                </button>
                            </div>
                        </>
                    )}

                    {mode === 'create' && (
                        <>
                            <button className="btn btn-sm btn-ghost" style={{ marginBottom: '1.5rem', gap: '0.375rem' }} onClick={() => { setMode('choose'); setError(''); }}>
                                ← Back
                            </button>
                            <div style={{ marginBottom: '1.75rem' }}>
                                <h1 className="t-h1" style={{ marginBottom: '0.5rem' }}>Create organization</h1>
                                <p className="t-body">You'll become the admin and can invite students with a code.</p>
                            </div>
                            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <p className="label" style={{ marginBottom: '0.375rem' }}>Organization Name *</p>
                                    <input className="input" placeholder="e.g. Westfield College" value={orgName}
                                        onChange={e => setOrgName(e.target.value)} required autoFocus />
                                </div>
                                {error && (
                                    <div style={{ padding: '0.625rem 0.875rem', background: 'var(--danger-bg)', border: '1px solid var(--danger)', fontSize: '13px', fontWeight: 600, color: 'var(--danger)' }}>
                                        {error}
                                    </div>
                                )}
                                <button type="submit" className="btn btn-lg btn-primary hover-glow" style={{ width: '100%', gap: '0.5rem' }} disabled={loading}>
                                    {loading ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Creating…</> : <><Plus size={16} /> Create Organization</>}
                                </button>
                            </form>
                        </>
                    )}

                    {mode === 'join' && (
                        <>
                            <button className="btn btn-sm btn-ghost" style={{ marginBottom: '1.5rem', gap: '0.375rem' }} onClick={() => { setMode('choose'); setError(''); }}>
                                ← Back
                            </button>
                            <div style={{ marginBottom: '1.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <span className="badge badge-solid"><ShieldAlert size={10} /> Student</span>
                                </div>
                                <h1 className="t-h1" style={{ marginBottom: '0.5rem' }}>Join an organization</h1>
                                <p className="t-body">Enter the 8-character invite code from your admin.</p>
                            </div>
                            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <p className="label" style={{ marginBottom: '0.375rem' }}>Invite Code *</p>
                                    <input className="input t-mono" placeholder="e.g. a3f8b2d9" value={inviteCode}
                                        onChange={e => setInviteCode(e.target.value.toLowerCase())} required autoFocus
                                        maxLength={8} style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em', fontSize: '1.1rem' }} />
                                </div>
                                {error && (
                                    <div style={{ padding: '0.625rem 0.875rem', background: 'var(--danger-bg)', border: '1px solid var(--danger)', fontSize: '13px', fontWeight: 600, color: 'var(--danger)' }}>
                                        {error}
                                    </div>
                                )}
                                <button type="submit" className="btn btn-lg btn-primary hover-glow" style={{ width: '100%', gap: '0.5rem' }} disabled={loading}>
                                    {loading ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Joining…</> : <><LogIn size={16} /> Join Organization</>}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
};

export default OrgSetup;
