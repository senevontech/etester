import React, { useCallback, useEffect, useState } from 'react';
import {
    Users, UserPlus, Shield, ShieldCheck, GraduationCap,
    Search, Trash2, ChevronDown, X, Check, AlertTriangle,
    RefreshCw, Crown, Eye, EyeOff,
} from 'lucide-react';
import RoleShell from '../../components/Layout/RoleShell';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiOrgMember, ApiError } from '../../lib/api';

// ── types ─────────────────────────────────────────────────────────────────────

type MemberRole = 'admin' | 'subadmin' | 'student';

interface MembersResponse {
    members: ApiOrgMember[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<MemberRole, string> = {
    admin:    'Admin',
    subadmin: 'Sub-Admin',
    student:  'Student',
};

const ROLE_COLOR: Record<MemberRole, string> = {
    admin:    'var(--accent)',
    subadmin: '#8b5cf6',
    student:  'var(--success)',
};

const ROLE_BG: Record<MemberRole, string> = {
    admin:    'rgba(var(--accent-rgb, 99,102,241),0.12)',
    subadmin: 'rgba(139,92,246,0.12)',
    student:  'rgba(var(--success-rgb, 34,197,94),0.12)',
};

const RoleBadge: React.FC<{ role: MemberRole }> = ({ role }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
        background: ROLE_BG[role], color: ROLE_COLOR[role],
        letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>
        {role === 'admin' && <Crown size={9} />}
        {role === 'subadmin' && <Shield size={9} />}
        {role === 'student' && <GraduationCap size={9} />}
        {ROLE_LABEL[role]}
    </span>
);

// ── Invite Modal ───────────────────────────────────────────────────────────────

interface InviteModalProps {
    orgId: string;
    onClose: () => void;
    onMembersChanged: () => void;
}

const InviteModal: React.FC<InviteModalProps> = ({ orgId, onClose, onMembersChanged }) => {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
    const canCreate = name.trim().length > 0
        && email.trim().length > 0
        && password.length >= 6
        && password === confirmPassword
        && !loading;

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !name.trim() || !password.trim()) return;
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
            await apiRequest(`/orgs/${orgId}/members/create`, {
                method: 'POST',
                body: { email: email.trim(), name: name.trim(), password, role: 'subadmin' },
            });
            setSuccess(`Sub-Admin account created for ${email.trim()}.`);
            setEmail(''); setName(''); setPassword(''); setConfirmPassword('');
            onMembersChanged();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to create account.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px',
                width: '100%', maxWidth: '560px', overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
            }} onClick={e => e.stopPropagation()}>

                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <div style={{ width: '38px', height: '38px', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ShieldCheck size={17} style={{ color: '#8b5cf6' }} />
                        </div>
                        <div>
                            <p style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text)', fontFamily: 'Manrope', lineHeight: 1 }}>Add Sub-Admin</p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'Manrope', marginTop: '0.3rem' }}>Create a manager account for this organization.</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.35rem', borderRadius: '8px', display: 'flex' }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '1.5rem' }}>
                    <form onSubmit={handleCreate} style={{ display: 'grid', gap: '1rem' }}>
                        <div style={{ padding: '0.8rem 0.9rem', border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                            <Shield size={15} style={{ color: '#8b5cf6' }} />
                            <p style={{ color: '#8b5cf6', fontWeight: 800, fontSize: '13px', fontFamily: 'Manrope' }}>Role: Sub-Admin</p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.875rem' }}>
                            <div>
                                <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Full Name</label>
                                <input className="input" placeholder="e.g. Jane Smith" value={name} onChange={e => setName(e.target.value)} required />
                            </div>
                            <div>
                                <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Email Address</label>
                                <input className="input" type="email" placeholder="jane@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.875rem' }}>
                            <div>
                                <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input className="input" type={showPassword ? 'text' : 'password'} placeholder="Temporary password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} style={{ paddingRight: '2.6rem' }} />
                                    <button type="button" onClick={() => setShowPassword((value) => !value)} style={{ position: 'absolute', right: '0.45rem', top: '50%', transform: 'translateY(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}>
                                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Confirm Password</label>
                                <input className="input" type={showPassword ? 'text' : 'password'} placeholder="Retype password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
                                {passwordsMismatch && <p style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '0.35rem', fontFamily: 'Manrope' }}>Passwords do not match.</p>}
                            </div>
                        </div>

                            {error && (
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.625rem 0.75rem', background: 'var(--danger-bg)', border: '1px solid rgba(220,53,69,0.3)', borderRadius: '8px' }}>
                                    <AlertTriangle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                                    <p style={{ fontSize: '12px', color: 'var(--danger)', fontFamily: 'Manrope' }}>{error}</p>
                                </div>
                            )}
                            {success && (
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.625rem 0.75rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px' }}>
                                    <Check size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                    <p style={{ fontSize: '12px', color: 'var(--success)', fontFamily: 'Manrope' }}>{success}</p>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.25rem', borderTop: '1px solid var(--border)' }}>
                                <button
                                    type="button"
                                    className="btn btn-md btn-outline"
                                    onClick={onClose}
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!canCreate}
                                    style={{
                                        minWidth: '170px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        padding: '0.75rem 1rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: canCreate ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'var(--surface)',
                                        color: canCreate ? 'white' : 'var(--text-muted)',
                                        fontWeight: 900,
                                        fontSize: '13px',
                                        fontFamily: 'Manrope',
                                        cursor: canCreate ? 'pointer' : 'not-allowed',
                                        opacity: canCreate ? 1 : 0.7,
                                        boxShadow: canCreate ? '0 8px 22px rgba(99,102,241,0.28)' : 'none',
                                        transition: 'opacity 0.15s, box-shadow 0.15s, transform 0.15s',
                                    }}
                                >
                                    <UserPlus size={15} />
                                    {loading ? 'Creating...' : 'Create Sub-Admin'}
                                </button>
                            </div>
                        </form>
                </div>
            </div>
        </div>
    );
};

// ── Change Role Dropdown ───────────────────────────────────────────────────────

interface RoleDropdownProps {
    member: ApiOrgMember;
    orgId: string;
    currentUserId: string;
    onChanged: () => void;
}

const RoleDropdown: React.FC<RoleDropdownProps> = ({ member, orgId, currentUserId, onChanged }) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const isSelf = member.user_id === currentUserId;
    const roles: Array<'subadmin'> = ['subadmin'];

    const handleChange = async (newRole: 'subadmin') => {
        if (newRole === member.role) { setOpen(false); return; }
        setLoading(true);
        setOpen(false);
        try {
            await apiRequest(`/orgs/${orgId}/members/${member.user_id}/role`, {
                method: 'PATCH',
                body: { role: newRole },
            });
            onChanged();
        } catch {
            // ignore for now; members will be re-fetched
        } finally {
            setLoading(false);
        }
    };

    if (member.role === 'admin' || isSelf) {
        return <RoleBadge role={member.role as MemberRole} />;
    }

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => setOpen(p => !p)}
                disabled={loading}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                    background: ROLE_BG[member.role as MemberRole], color: ROLE_COLOR[member.role as MemberRole],
                    border: `1px solid ${ROLE_COLOR[member.role as MemberRole]}40`,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    cursor: 'pointer', transition: 'opacity 0.15s',
                }}
            >
                {member.role === 'subadmin' && <Shield size={9} />}
                {member.role === 'student' && <GraduationCap size={9} />}
                {ROLE_LABEL[member.role as MemberRole]}
                <ChevronDown size={10} />
            </button>

            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setOpen(false)} />
                    <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 101,
                        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px',
                        boxShadow: 'var(--shadow-lg)', overflow: 'hidden', minWidth: '140px',
                    }}>
                        {roles.map(r => (
                            <button key={r} onClick={() => void handleChange(r)} style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                                padding: '0.6rem 0.875rem', background: 'none', border: 'none',
                                color: member.role === r ? ROLE_COLOR[r] : 'var(--text)',
                                fontWeight: member.role === r ? 700 : 500, fontSize: '13px',
                                cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s',
                                fontFamily: 'Manrope',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                                {r === 'subadmin' ? <Shield size={13} style={{ color: ROLE_COLOR.subadmin }} /> : <GraduationCap size={13} style={{ color: ROLE_COLOR.student }} />}
                                {ROLE_LABEL[r]}
                                {member.role === r && <Check size={12} style={{ marginLeft: 'auto', color: ROLE_COLOR[r] }} />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const AdminUserManagement: React.FC = () => {
    const { activeOrg } = useOrg();
    const { user } = useAuth();

    const [members, setMembers] = useState<ApiOrgMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'subadmin' | 'admin'>('subadmin');
    const [showInvite, setShowInvite] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null); // userId awaiting confirm

    const fetchMembers = useCallback(async () => {
        if (!activeOrg?.id) return;
        setLoading(true);
        try {
            const data = await apiRequest<MembersResponse>(`/orgs/${activeOrg.id}/members`);
            setMembers(data.members ?? []);
        } catch {
            setMembers([]);
        } finally {
            setLoading(false);
        }
    }, [activeOrg?.id]);

    useEffect(() => { void fetchMembers(); }, [fetchMembers]);

    const handleRemove = async (userId: string) => {
        if (!activeOrg?.id) return;
        setDeletingId(userId);
        try {
            await apiRequest(`/orgs/${activeOrg.id}/members/${userId}`, { method: 'DELETE' });
            setMembers(prev => prev.filter(m => m.user_id !== userId));
        } catch {
            // ignore
        } finally {
            setDeletingId(null);
            setDeleteConfirm(null);
        }
    };

    const filtered = members.filter(m => {
        if (m.role !== activeTab) return false;
        if (search.trim()) {
            const q = search.toLowerCase();
            return (
                (m.profile?.name?.toLowerCase().includes(q) ?? false) ||
                (m.profile?.email?.toLowerCase().includes(q) ?? false)
            );
        }
        return true;
    });

    const stats = {
        total:    members.filter(m => m.role === 'admin' || m.role === 'subadmin').length,
        admins:   members.filter(m => m.role === 'admin').length,
        subadmins: members.filter(m => m.role === 'subadmin').length,
        students: members.filter(m => m.role === 'student').length,
    };

    return (
        <RoleShell role="admin" activeKey="users">
            <header style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: '56px', zIndex: 90, background: 'var(--bg)' }}>
                <div className="container" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '28px', height: '28px', background: 'rgba(var(--accent-rgb,99,102,241),0.12)', border: '1px solid rgba(var(--accent-rgb,99,102,241),0.25)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Crown size={13} style={{ color: 'var(--accent)' }} />
                        </div>
                        <div>
                            <p style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--text)', fontFamily: 'Manrope', lineHeight: 1 }}>User Management</p>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Manrope', lineHeight: 1, marginTop: '1px' }}>{activeOrg?.name}</p>
                        </div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <button
                        className="btn btn-sm"
                        style={{ gap: '0.375rem', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        onClick={() => void fetchMembers()}
                    >
                        <RefreshCw size={13} /> Refresh
                    </button>
                    <button
                        className="btn btn-sm btn-primary hover-glow"
                        style={{ gap: '0.375rem' }}
                        onClick={() => setShowInvite(true)}
                    >
                        <UserPlus size={13} /> Add Member
                    </button>
                </div>
            </header>

            <main className="container" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>

                {/* Stats */}
                <div className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.625rem', marginBottom: '1.5rem' }}>
                    {([
                        { icon: Users,       label: 'Total Members', value: stats.total,     color: 'var(--text)' },
                        { icon: Crown,       label: 'Admins',        value: stats.admins,    color: 'var(--accent)' },
                        { icon: ShieldCheck, label: 'Sub-Admins',    value: stats.subadmins, color: '#8b5cf6' },
                        { icon: GraduationCap, label: 'Students',    value: stats.students,  color: 'var(--success)' },
                    ] as const).map(({ icon: Icon, label, value, color }) => (
                        <div key={label} className="card hover-antigravity" style={{ padding: '0.875rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <div style={{ width: '32px', height: '32px', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon size={15} style={{ color }} />
                            </div>
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</p>
                                <p style={{ fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-0.03em', color, lineHeight: 1 }}>{value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="anim-fade-up" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px' }}>
                        {([
                            { key: 'subadmin', label: 'Sub-Admin', icon: ShieldCheck, count: stats.subadmins, color: '#8b5cf6' },
                            { key: 'admin', label: 'Admin', icon: Crown, count: stats.admins, color: 'var(--accent)' },
                        ] as const).map(({ key, label, icon: Icon, count, color }) => {
                            const active = activeTab === key;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setActiveTab(key)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.45rem',
                                        padding: '0.55rem 0.85rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: active ? 'var(--bg)' : 'transparent',
                                        color: active ? 'var(--text)' : 'var(--text-muted)',
                                        boxShadow: active ? 'var(--shadow-sm)' : 'none',
                                        fontWeight: active ? 850 : 700,
                                        cursor: 'pointer',
                                        fontFamily: 'Manrope',
                                    }}
                                >
                                    <Icon size={15} />
                                    {label}
                                    <span style={{ color }}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div style={{ position: 'relative', flex: '1 1 220px' }}>
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
                <div className="anim-fade-up" style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--bg)' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                            <div style={{ width: '28px', height: '28px', border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
                            <p className="t-body" style={{ color: 'var(--text-muted)' }}>Loading members…</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                            <Users size={40} style={{ margin: '0 auto 1rem', opacity: 0.25, color: 'var(--text-muted)', display: 'block' }} />
                            <p className="t-h3" style={{ color: 'var(--text-muted)' }}>No members found</p>
                            <p className="t-body" style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                {search ? 'Try adjusting your search.' : `No ${activeTab === 'admin' ? 'admin' : 'sub-admin'} members in this organization.`}
                            </p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'Manrope, sans-serif' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                                    {['Member', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                                        <th key={h} style={{
                                            padding: '0.625rem 1rem', textAlign: h === 'Actions' ? 'right' : 'left',
                                            fontWeight: 800, fontSize: '10px', letterSpacing: '0.07em',
                                            textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((m, i) => {
                                    const isSelf = m.user_id === user?.id;
                                    const isDeleting = deletingId === m.user_id;
                                    const confirmPending = deleteConfirm === m.user_id;
                                    const joinedDate = new Date(m.joined_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                                    const initials = (m.profile?.name ?? 'U')
                                        .split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

                                    return (
                                        <tr key={m.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', background: isSelf ? 'rgba(var(--accent-rgb,99,102,241),0.04)' : 'transparent', transition: 'background 0.12s' }}
                                            onMouseEnter={e => { if (!isSelf) e.currentTarget.style.background = 'var(--surface)'; }}
                                            onMouseLeave={e => { if (!isSelf) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            {/* Member */}
                                            <td style={{ padding: '0.875rem 1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{
                                                        width: '34px', height: '34px', borderRadius: '50%',
                                                        background: `hsl(${m.user_id.charCodeAt(0) * 13 % 360}, 55%, 48%)`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0, fontSize: '12px', fontWeight: 800, color: 'white',
                                                    }}>
                                                        {initials}
                                                    </div>
                                                    <div>
                                                        <p style={{ fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
                                                            {m.profile?.name ?? '—'}
                                                            {isSelf && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '6px' }}>(you)</span>}
                                                        </p>
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1 }}>
                                                            ID: {m.user_id.slice(0, 8)}…
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Email */}
                                            <td style={{ padding: '0.875rem 1rem', color: 'var(--text-2)', fontSize: '12px' }}>
                                                {m.profile?.email ?? '—'}
                                            </td>

                                            {/* Role */}
                                            <td style={{ padding: '0.875rem 1rem' }}>
                                                {activeOrg?.id && (
                                                    <RoleDropdown
                                                        member={m}
                                                        orgId={activeOrg.id}
                                                        currentUserId={user?.id ?? ''}
                                                        onChanged={fetchMembers}
                                                    />
                                                )}
                                            </td>

                                            {/* Joined */}
                                            <td style={{ padding: '0.875rem 1rem', color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                {joinedDate}
                                            </td>

                                            {/* Actions */}
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                                                {!isSelf && m.role !== 'admin' && (
                                                    confirmPending ? (
                                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Manrope' }}>Remove?</span>
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ padding: '3px 10px', fontSize: '11px', background: 'var(--danger)', color: 'white', border: 'none', gap: '4px' }}
                                                                onClick={() => void handleRemove(m.user_id)}
                                                                disabled={isDeleting}
                                                            >
                                                                {isDeleting ? '…' : 'Yes'}
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-ghost"
                                                                style={{ padding: '3px 10px', fontSize: '11px' }}
                                                                onClick={() => setDeleteConfirm(null)}
                                                            >
                                                                No
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setDeleteConfirm(m.user_id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px', borderRadius: '6px', transition: 'color 0.15s, background 0.15s' }}
                                                            title="Remove member"
                                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                    {filtered.length} member{filtered.length !== 1 ? 's' : ''}
                    {filtered.length !== members.length ? ` (filtered from ${members.length})` : ''}
                    {' '}&mdash; Use tabs to switch between sub-admins and admins.
                </p>
            </main>

            {showInvite && activeOrg && (
                <InviteModal
                    orgId={activeOrg.id}
                    onClose={() => setShowInvite(false)}
                    onMembersChanged={fetchMembers}
                />
            )}

            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </RoleShell>
    );
};

export default AdminUserManagement;
