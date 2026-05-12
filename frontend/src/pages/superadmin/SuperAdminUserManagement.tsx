import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Users, UserPlus, Shield, Sparkles,
    Search, Trash2, ChevronDown, X, Check, AlertTriangle,
    RefreshCw, Crown, GraduationCap, Building2, Eye, EyeOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError, type Role } from '../../lib/api';
import SuperAdminShell from '../../components/Layout/SuperAdminShell';
import { useNavigate } from 'react-router-dom';

// ── types ─────────────────────────────────────────────────────────────────────

interface SystemUser {
    id: string;
    name: string;
    email: string;
    role: Role;
    created_at: string;
    org_count?: number;
}

interface SystemUsersResponse {
    users: SystemUser[];
}

interface CreateUserResponse {
    user: SystemUser;
}

// ── constants ─────────────────────────────────────────────────────────────────

const ROLE_META: Record<Role, { label: string; color: string; bg: string; border: string; Icon: React.FC<{ size?: number }> }> = {
    superadmin: {
        label: 'Super Admin', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)',
        Icon: ({ size = 10 }) => <Sparkles size={size} />,
    },
    admin: {
        label: 'Admin', color: 'var(--accent)', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.35)',
        Icon: ({ size = 10 }) => <Crown size={size} />,
    },
    subadmin: {
        label: 'Sub-Admin', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)',
        Icon: ({ size = 10 }) => <Shield size={size} />,
    },
    student: {
        label: 'Student', color: 'var(--success)', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.3)',
        Icon: ({ size = 10 }) => <GraduationCap size={size} />,
    },
};

const RoleBadge: React.FC<{ role: Role; size?: 'sm' | 'md' }> = ({ role, size = 'sm' }) => {
    const m = ROLE_META[role];
    const { Icon } = m;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: size === 'md' ? '4px 10px' : '2px 8px',
            borderRadius: '20px',
            fontSize: size === 'md' ? '12px' : '11px',
            fontWeight: 700,
            background: m.bg, color: m.color,
            border: `1px solid ${m.border}`,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
        }}>
            <Icon size={size === 'md' ? 11 : 9} />
            {m.label}
        </span>
    );
};

// ── Top Navbar ─────────────────────────────────────────────────────────────────

// ── Create Admin Modal ─────────────────────────────────────────────────────────

interface CreateAdminModalProps {
    onClose: () => void;
    onCreated: (user: SystemUser) => void;
}

export const CreateAdminModal: React.FC<CreateAdminModalProps> = ({ onClose, onCreated }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const role = 'admin' as const;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => { nameRef.current?.focus(); }, []);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!name.trim() || !email.trim() || !password.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const data = await apiRequest<CreateUserResponse>('/superadmin/users', {
                method: 'POST',
                body: { name: name.trim(), email: email.trim(), password, role: 'admin' },
            });
            onCreated(data.user);
            onClose();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to create account.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '18px',
                width: '100%', maxWidth: '460px', overflow: 'hidden',
                boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{
                    padding: '1.5rem', borderBottom: '1px solid var(--border)',
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(249,115,22,0.04))',
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #f59e0b, #f97316)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <UserPlus size={18} style={{ color: 'white' }} />
                            </div>
                            <div>
                                <p style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text)', fontFamily: 'Manrope', lineHeight: 1 }}>Create Admin Account</p>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'Manrope', marginTop: '3px' }}>New privileged user for the platform</p>
                            </div>
                        </div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '6px' }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* Name */}
                    <div>
                        <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontFamily: 'Manrope' }}>Full Name</label>
                        <input ref={nameRef} className="input" placeholder="e.g. Priya Sharma" value={name} onChange={e => setName(e.target.value)} required />
                    </div>

                    {/* Email */}
                    <div>
                        <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontFamily: 'Manrope' }}>Email Address</label>
                        <input className="input" type="email" placeholder="priya@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>

                    {/* Password */}
                    <div>
                        <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontFamily: 'Manrope' }}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="input"
                                type={showPw ? 'text' : 'password'}
                                placeholder="Min. 8 characters"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                minLength={8}
                                style={{ paddingRight: '2.5rem' }}
                            />
                            <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.625rem 0.875rem', background: 'var(--danger-bg)', border: '1px solid rgba(220,53,69,0.3)', borderRadius: '8px' }}>
                            <AlertTriangle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                            <p style={{ fontSize: '12px', color: 'var(--danger)', fontFamily: 'Manrope' }}>{error}</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.625rem', marginTop: '0.25rem' }}>
                        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                padding: '0.625rem 1rem', borderRadius: '8px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                                background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: 'white',
                                fontWeight: 800, fontSize: '13px', fontFamily: 'Manrope', opacity: loading ? 0.7 : 1,
                                transition: 'opacity 0.15s',
                            }}
                        >
                            {loading ? 'Creating…' : <><UserPlus size={14} /> Create {ROLE_META[role].label}</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ── Role Change Dropdown ───────────────────────────────────────────────────────

interface RoleDropdownProps {
    user: SystemUser;
    currentUserId: string;
    onChanged: (userId: string, newRole: Role) => void;
}

const RoleDropdown: React.FC<RoleDropdownProps> = ({ user: target, currentUserId, onChanged }) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const isSelf = target.id === currentUserId;

    const changeableRoles: Role[] = ['admin'];

    const handleChange = async (newRole: Role) => {
        if (newRole === target.role) { setOpen(false); return; }
        setLoading(true);
        setOpen(false);
        try {
            await apiRequest(`/superadmin/users/${target.id}/role`, {
                method: 'PATCH',
                body: { role: newRole },
            });
            onChanged(target.id, newRole);
        } catch {
            // keep UI consistent; caller can refresh
        } finally {
            setLoading(false);
        }
    };

    if (isSelf) return <RoleBadge role={target.role} />;

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => setOpen(p => !p)}
                disabled={loading}
                title="Change role"
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                    background: ROLE_META[target.role].bg, color: ROLE_META[target.role].color,
                    border: `1px solid ${ROLE_META[target.role].border}`,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    cursor: 'pointer', transition: 'opacity 0.15s',
                }}
            >
                {React.createElement(ROLE_META[target.role].Icon, { size: 9 })}
                {ROLE_META[target.role].label}
                <ChevronDown size={10} />
            </button>

            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setOpen(false)} />
                    <div style={{
                        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 101,
                        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.25)', overflow: 'hidden', minWidth: '170px',
                    }}>
                        <p style={{ padding: '0.5rem 0.875rem', fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', fontFamily: 'Manrope' }}>Change Role</p>
                        {changeableRoles.map(r => {
                            const m = ROLE_META[r];
                            const { Icon } = m;
                            const active = target.role === r;
                            return (
                                <button key={r} onClick={() => void handleChange(r)} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                                    padding: '0.625rem 0.875rem', background: active ? m.bg : 'none',
                                    border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s',
                                    fontFamily: 'Manrope',
                                }}
                                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface)'; }}
                                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none'; }}
                                >
                                    <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: m.bg, border: `1px solid ${m.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Icon size={12} />
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '12px', fontWeight: active ? 800 : 600, color: active ? m.color : 'var(--text)', lineHeight: 1 }}>{m.label}</p>
                                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1, marginTop: '2px' }}>
                                            {r === 'admin' ? 'Manages an org' : 'Full platform access'}
                                        </p>
                                    </div>
                                    {active && <Check size={12} style={{ color: m.color, marginLeft: 'auto' }} />}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const SuperAdminUserManagement: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [users, setUsers] = useState<SystemUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiRequest<SystemUsersResponse>('/superadmin/users');
            setUsers((data.users ?? []).filter((account) => account.role === 'admin'));
        } catch {
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchUsers(); }, [fetchUsers]);

    const handleRoleChanged = (userId: string, newRole: Role) => {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    };

    const handleDelete = async (userId: string) => {
        setDeletingId(userId);
        try {
            await apiRequest(`/superadmin/users/${userId}`, { method: 'DELETE' });
            setUsers(prev => prev.filter(u => u.id !== userId));
        } catch {
            // ignore
        } finally {
            setDeletingId(null);
            setDeleteConfirm(null);
        }
    };

    const filtered = users.filter(u => {
        if (search.trim()) {
            const q = search.toLowerCase();
            return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        }
        return true;
    });

    const stats = {
        total:      users.length,
        admin:      users.filter(u => u.role === 'admin').length,
    };

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

    return (
        <SuperAdminShell activeKey="admins">
            {/* Page header */}
            <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(249,115,22,0.03) 100%)', borderBottom: '1px solid var(--border)' }}>
                <div className="container" style={{ padding: '2rem 1rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #f59e0b, #f97316)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Users size={20} style={{ color: 'white' }} />
                                </div>
                                <div>
                                    <h1 style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '-0.03em', color: 'var(--text)', fontFamily: 'Manrope', lineHeight: 1 }}>Admin Management</h1>
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'Manrope', marginTop: '3px' }}>Create and manage privileged platform accounts</p>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.625rem' }}>
                            <button
                                onClick={() => void fetchUsers()}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 0.875rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, fontFamily: 'Manrope' }}
                            >
                                <RefreshCw size={13} /> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <main className="container" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    {([
                        { icon: Users,    label: 'Total Admins', value: stats.total,      color: 'var(--text)',    gradient: false },
                        { icon: Crown,    label: 'Active Admins', value: stats.admin,      color: 'var(--accent)',  gradient: false },
                    ] as const).map(({ icon: Icon, label, value, color, gradient }) => (
                        <div key={label} style={{
                            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px',
                            padding: '1rem 1.125rem', display: 'flex', gap: '0.875rem', alignItems: 'center',
                            boxShadow: 'var(--shadow-sm)',
                        }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '9px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: gradient ? 'linear-gradient(135deg, #f59e0b22, #f9731622)' : 'var(--surface)', border: '1px solid var(--border)' }}>
                                <Icon size={16} style={{ color }} />
                            </div>
                            <div>
                                <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px', fontFamily: 'Manrope' }}>{label}</p>
                                <p style={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-0.04em', color, lineHeight: 1, fontFamily: 'Manrope' }}>{value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 240px' }}>
                        <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            className="input"
                            style={{ paddingLeft: '2.1rem' }}
                            placeholder="Search by name or email…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* Table */}
                <div style={{ border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', background: 'var(--bg)', boxShadow: 'var(--shadow-sm)' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
                            <div style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTop: '3px solid #f59e0b', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontFamily: 'Manrope' }}>Loading accounts…</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
                            <div style={{ width: '56px', height: '56px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                <Users size={24} style={{ color: 'var(--text-muted)' }} />
                            </div>
                            <p style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)', fontFamily: 'Manrope', marginBottom: '4px' }}>No accounts found</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'Manrope' }}>
                                {search ? 'Try adjusting your search.' : 'Create the first admin account.'}
                            </p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Manrope, sans-serif' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                                    {['Account', 'Email', 'Role', 'Organizations', 'Created', 'Actions'].map(h => (
                                        <th key={h} style={{
                                            padding: '0.75rem 1.125rem', textAlign: h === 'Actions' ? 'right' : 'left',
                                            fontWeight: 800, fontSize: '10px', letterSpacing: '0.08em',
                                            textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((u, i) => {
                                    const isSelf = u.id === user?.id;
                                    const isDeleting = deletingId === u.id;
                                    const confirmPending = deleteConfirm === u.id;
                                    const hue = u.id.charCodeAt(0) * 17 % 360;
                                    const initials = u.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

                                    return (
                                        <tr key={u.id}
                                            style={{
                                                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                                                background: isSelf ? 'rgba(245,158,11,0.04)' : 'transparent',
                                                transition: 'background 0.12s',
                                            }}
                                            onMouseEnter={e => { if (!isSelf) e.currentTarget.style.background = 'var(--surface)'; }}
                                            onMouseLeave={e => { if (!isSelf) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            {/* Account */}
                                            <td style={{ padding: '1rem 1.125rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{
                                                        width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                                                        background: u.role === 'superadmin'
                                                            ? 'linear-gradient(135deg, #f59e0b, #f97316)'
                                                            : `hsl(${hue}, 50%, 45%)`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '13px', fontWeight: 800, color: 'white',
                                                        boxShadow: u.role === 'superadmin' ? '0 2px 8px rgba(245,158,11,0.4)' : 'none',
                                                    }}>
                                                        {initials}
                                                    </div>
                                                    <div>
                                                        <p style={{ fontWeight: 700, color: 'var(--text)', lineHeight: 1, fontSize: '14px' }}>
                                                            {u.name}
                                                            {isSelf && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '6px' }}>(you)</span>}
                                                        </p>
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                                                            {u.id.slice(0, 8)}…
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Email */}
                                            <td style={{ padding: '1rem 1.125rem', color: 'var(--text-2)', fontSize: '13px' }}>
                                                {u.email}
                                            </td>

                                            {/* Role */}
                                            <td style={{ padding: '1rem 1.125rem' }}>
                                                <RoleDropdown
                                                    user={u}
                                                    currentUserId={user?.id ?? ''}
                                                    onChanged={handleRoleChanged}
                                                />
                                            </td>

                                            {/* Org count */}
                                            <td style={{ padding: '1rem 1.125rem' }}>
                                                {u.org_count !== undefined ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: u.org_count > 0 ? 'var(--text-2)' : 'var(--text-muted)', fontSize: '13px' }}>
                                                        <Building2 size={13} />
                                                        <span style={{ fontWeight: u.org_count > 0 ? 700 : 400 }}>{u.org_count}</span>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                                                )}
                                            </td>

                                            {/* Created */}
                                            <td style={{ padding: '1rem 1.125rem', color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                {formatDate(u.created_at)}
                                            </td>

                                            {/* Actions */}
                                            <td style={{ padding: '1rem 1.125rem', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={() => navigate(`/superadmin/admins/${u.id}`)}
                                                        style={{ padding: '5px 10px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '7px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'Manrope', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                                    >
                                                        <Eye size={13} /> Details
                                                    </button>
                                                    {!isSelf && (confirmPending ? (
                                                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Delete?</span>
                                                            <button
                                                                onClick={() => void handleDelete(u.id)}
                                                                disabled={isDeleting}
                                                                style={{ padding: '3px 10px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'Manrope' }}
                                                            >
                                                                {isDeleting ? '…' : 'Yes'}
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteConfirm(null)}
                                                                style={{ padding: '3px 10px', background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, fontFamily: 'Manrope' }}
                                                            >
                                                                No
                                                            </button>
                                                        </div>
                                                        ) : (
                                                        <button
                                                            onClick={() => setDeleteConfirm(u.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '5px 7px', borderRadius: '7px', transition: 'color 0.15s, background 0.15s', display: 'inline-flex', alignItems: 'center' }}
                                                            title="Delete account"
                                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '0.75rem', fontFamily: 'Manrope' }}>
                    {filtered.length} account{filtered.length !== 1 ? 's' : ''}
                    {filtered.length !== users.length ? ` (filtered from ${users.length})` : ''}
                    {' '}&mdash; Click a role badge to promote or demote. This affects global platform access.
                </p>
            </main>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </SuperAdminShell>
    );
};

export default SuperAdminUserManagement;
