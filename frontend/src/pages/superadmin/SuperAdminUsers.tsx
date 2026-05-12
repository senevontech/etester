import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Crown, Eye, EyeOff, KeyRound, Mail, Shield, Trash2, UserPlus, X } from 'lucide-react';
import SuperAdminShell from '../../components/Layout/SuperAdminShell';
import { ApiError, apiRequest, type Role } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface SystemUser {
    id: string;
    name: string;
    email: string;
    role: Role;
    created_at: string;
    org_count?: number;
}

const roleCopy = {
    admin: {
        title: 'Add Admin',
        label: 'Admin',
        text: 'Create an admin account for organization management.',
        color: 'var(--accent)',
    },
    superadmin: {
        title: 'Add Super Admin',
        label: 'Super Admin',
        text: 'Create a full platform access account.',
        color: '#f59e0b',
    },
} as const;

interface CreateUserModalProps {
    role: 'admin' | 'superadmin';
    onClose: () => void;
    onCreated: (user: SystemUser) => void;
}

type AccountAction = { type: 'delete' | 'reset'; user: SystemUser };

interface ConfirmAccountActionModalProps {
    action: AccountAction;
    onClose: () => void;
    onDeleted: (userId: string) => void;
}

const ConfirmAccountActionModal: React.FC<ConfirmAccountActionModalProps> = ({ action, onClose, onDeleted }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isDelete = action.type === 'delete';
    const passwordMismatch = !isDelete && confirmPassword.length > 0 && password !== confirmPassword;

    const handleConfirm = async () => {
        if (!isDelete && password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            if (isDelete) {
                await apiRequest(`/superadmin/users/${action.user.id}`, { method: 'DELETE' });
                onDeleted(action.user.id);
            } else {
                await apiRequest(`/superadmin/users/${action.user.id}/password`, {
                    method: 'PATCH',
                    body: { password },
                });
            }
            onClose();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Action failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
            <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '1.25rem' }} onClick={(event) => event.stopPropagation()}>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <AlertTriangle size={22} style={{ color: isDelete ? 'var(--danger)' : '#f59e0b', flexShrink: 0 }} />
                    <div>
                        <h2 className="t-h2">{isDelete ? 'Delete Account?' : 'Reset Password?'}</h2>
                        <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                            {isDelete
                                ? `This will permanently delete ${action.user.name}'s account.`
                                : `Set a new password for ${action.user.name}.`}
                        </p>
                    </div>
                </div>

                {!isDelete && (
                    <>
                        <div style={{ marginBottom: '0.85rem' }}>
                            <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>New Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="input"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="Minimum 8 characters"
                                    minLength={8}
                                    required
                                    autoFocus
                                    style={{ paddingRight: '2.6rem' }}
                                />
                                <button type="button" onClick={() => setShowPassword((value) => !value)} className="btn btn-sm btn-outline" aria-label={showPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: '0.45rem', top: '50%', transform: 'translateY(-50%)', padding: '0.25rem' }}>
                                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>Confirm Password</label>
                            <input
                                className="input"
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                placeholder="Retype password"
                                minLength={8}
                                required
                            />
                            {passwordMismatch && <p className="t-small" style={{ color: 'var(--danger)', marginTop: '0.35rem' }}>Passwords do not match.</p>}
                        </div>
                    </>
                )}

                {error && <p className="t-small" style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</p>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                    <button className="btn btn-md btn-outline" onClick={onClose}>Cancel</button>
                    <button
                        className={isDelete ? 'btn btn-md btn-danger' : 'btn btn-md btn-primary'}
                        onClick={() => void handleConfirm()}
                        disabled={loading || (!isDelete && (password.length < 8 || password !== confirmPassword))}
                        style={{ gap: '0.45rem' }}
                    >
                        {isDelete ? <Trash2 size={15} /> : <KeyRound size={15} />}
                        {loading ? 'Working...' : isDelete ? 'Delete Account' : 'Reset Password'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const CreateUserModal: React.FC<CreateUserModalProps> = ({ role, onClose, onCreated }) => {
    const meta = roleCopy[role];
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        setError(null);

        try {
            const data = await apiRequest<{ user: SystemUser }>('/superadmin/users', {
                method: 'POST',
                body: { name: name.trim(), email: email.trim(), password, role },
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
            <div className="card" style={{ width: '100%', maxWidth: '460px', padding: 0, overflow: 'hidden' }} onClick={(event) => event.stopPropagation()}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                        <h2 className="t-h2">{meta.title}</h2>
                        <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>{meta.text}</p>
                    </div>
                    <button className="btn btn-sm btn-outline" onClick={onClose} aria-label="Close" style={{ padding: '0.35rem' }}>
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'grid', gap: '0.9rem' }}>
                    <div>
                        <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>Role</label>
                        <div style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', color: meta.color, fontWeight: 900 }}>
                            {meta.label}
                        </div>
                    </div>

                    <div>
                        <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>Full Name</label>
                        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" required autoFocus />
                    </div>

                    <div>
                        <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>Email</label>
                        <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
                    </div>

                    <div>
                        <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="input"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="Minimum 8 characters"
                                minLength={8}
                                required
                                style={{ paddingRight: '2.6rem' }}
                            />
                            <button type="button" onClick={() => setShowPassword((value) => !value)} className="btn btn-sm btn-outline" aria-label={showPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: '0.45rem', top: '50%', transform: 'translateY(-50%)', padding: '0.25rem' }}>
                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="t-micro" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>Confirm Password</label>
                        <input
                            className="input"
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder="Retype password"
                            minLength={8}
                            required
                        />
                        {passwordMismatch && <p className="t-small" style={{ color: 'var(--danger)', marginTop: '0.35rem' }}>Passwords do not match.</p>}
                    </div>

                    {error && <p className="t-small" style={{ color: 'var(--danger)' }}>{error}</p>}

                    <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-md btn-outline" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-md btn-primary" disabled={loading || password.length < 8 || password !== confirmPassword} style={{ gap: '0.45rem' }}>
                            <UserPlus size={15} /> {loading ? 'Creating...' : meta.title}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const UserListSection: React.FC<{
    title: string;
    users: SystemUser[];
    tone: string;
    icon: React.ReactNode;
    currentUserId?: string;
    onAction: (action: AccountAction) => void;
}> = ({ title, users, tone, icon, currentUserId, onAction }) => (
    <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: tone }}>
                {icon}
            </div>
            <div>
                <h2 className="t-h2">{title}</h2>
                <p className="t-small" style={{ color: 'var(--text-muted)' }}>{users.length} created account{users.length === 1 ? '' : 's'}</p>
            </div>
        </div>

        <div style={{ display: 'grid', gap: '0.65rem' }}>
            {users.map((user) => (
                <div key={user.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center', padding: '0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
                    <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 850, color: 'var(--text)', marginBottom: '0.25rem' }}>{user.name}</p>
                        <p className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Mail size={13} /> {user.email}
                        </p>
                    </div>
                    <span className="t-micro" style={{ color: tone, whiteSpace: 'nowrap' }}>
                        {user.org_count ?? 0} orgs
                    </span>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-outline" style={{ gap: '0.35rem' }} onClick={() => onAction({ type: 'reset', user })}>
                            <KeyRound size={13} /> Reset Password
                        </button>
                        {user.id !== currentUserId && (
                            <button className="btn btn-sm btn-outline" style={{ gap: '0.35rem', color: 'var(--danger)' }} onClick={() => onAction({ type: 'delete', user })}>
                                <Trash2 size={13} /> Delete Account
                            </button>
                        )}
                    </div>
                </div>
            ))}
            {users.length === 0 && <p className="t-small" style={{ color: 'var(--text-muted)' }}>No accounts created yet.</p>}
        </div>
    </div>
);

const SuperAdminUsers: React.FC = () => {
    const { user } = useAuth();
    const [users, setUsers] = useState<SystemUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [createRole, setCreateRole] = useState<'admin' | 'superadmin' | null>(null);
    const [activeTab, setActiveTab] = useState<'admin' | 'superadmin'>('admin');
    const [accountAction, setAccountAction] = useState<AccountAction | null>(null);

    useEffect(() => {
        apiRequest<{ users: SystemUser[] }>('/superadmin/users')
            .then((data) => setUsers(data.users))
            .finally(() => setLoading(false));
    }, []);

    const grouped = useMemo(() => ({
        superadmins: users.filter((user) => user.role === 'superadmin'),
        admins: users.filter((user) => user.role === 'admin'),
    }), [users]);

    const handleCreated = (createdUser: SystemUser) => {
        setUsers((current) => [createdUser, ...current]);
        setActiveTab(createdUser.role === 'superadmin' ? 'superadmin' : 'admin');
    };

    const handleDeleted = (userId: string) => {
        setUsers((current) => current.filter((account) => account.id !== userId));
    };

    const activeUsers = activeTab === 'admin' ? grouped.admins : grouped.superadmins;
    const activeMeta = roleCopy[activeTab];

    return (
        <SuperAdminShell activeKey="users">
            <section style={{ padding: '2rem min(2rem, 5vw)' }}>
                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>User Management</p>
                <h1 className="t-display" style={{ marginBottom: '0.5rem' }}>Created Platform Users</h1>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                    <p className="t-body" style={{ color: 'var(--text-muted)', maxWidth: '760px' }}>
                        Switch between Admin and Super Admin tabs to view or create accounts.
                    </p>
                    <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-md btn-primary" style={{ gap: '0.45rem' }} onClick={() => setCreateRole(activeTab)}>
                            <UserPlus size={15} /> {activeMeta.title}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'inline-flex', gap: '4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px', marginBottom: '1rem' }}>
                    {([
                        { key: 'admin', label: 'Admin', icon: Crown, count: grouped.admins.length },
                        { key: 'superadmin', label: 'Super Admin', icon: Shield, count: grouped.superadmins.length },
                    ] as const).map(({ key, label, icon: Icon, count }) => {
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
                                }}
                            >
                                <Icon size={15} />
                                {label}
                                <span style={{ color: key === 'superadmin' ? '#f59e0b' : 'var(--accent)' }}>{count}</span>
                            </button>
                        );
                    })}
                </div>

                {loading ? (
                    <div className="card" style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading users...</div>
                ) : (
                    <UserListSection
                        title={activeTab === 'admin' ? 'Admins' : 'Super Admins'}
                        users={activeUsers}
                        tone={activeMeta.color}
                        icon={activeTab === 'admin' ? <Crown size={18} /> : <Shield size={18} />}
                        currentUserId={user?.id}
                        onAction={setAccountAction}
                    />
                )}

                {createRole && (
                    <CreateUserModal
                        role={createRole}
                        onClose={() => setCreateRole(null)}
                        onCreated={handleCreated}
                    />
                )}

                {accountAction && (
                    <ConfirmAccountActionModal
                        action={accountAction}
                        onClose={() => setAccountAction(null)}
                        onDeleted={handleDeleted}
                    />
                )}
            </section>
        </SuperAdminShell>
    );
};

export default SuperAdminUsers;
