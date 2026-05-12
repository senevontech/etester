import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Crown, Shield, UserCog, Users } from 'lucide-react';
import SuperAdminShell from '../../components/Layout/SuperAdminShell';
import { apiRequest, type Role } from '../../lib/api';

interface SystemUser {
    id: string;
    name: string;
    email: string;
    role: Role;
    created_at: string;
    org_count?: number;
}

const SuperAdminDashboard: React.FC = () => {
    const [users, setUsers] = useState<SystemUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiRequest<{ users: SystemUser[] }>('/superadmin/users')
            .then((data) => setUsers(data.users))
            .finally(() => setLoading(false));
    }, []);

    const stats = useMemo(() => ({
        totalAdmins: users.length,
        admins: users.filter((user) => user.role === 'admin').length,
        superadmins: users.filter((user) => user.role === 'superadmin').length,
        organizations: users.reduce((total, user) => total + Number(user.org_count ?? 0), 0),
    }), [users]);

    const cards = [
        { label: 'Privileged Accounts', value: stats.totalAdmins, icon: UserCog, color: 'var(--text)' },
        { label: 'Admins', value: stats.admins, icon: Crown, color: 'var(--accent)' },
        { label: 'Super Admins', value: stats.superadmins, icon: Shield, color: '#f59e0b' },
        { label: 'Admin Organizations', value: stats.organizations, icon: BarChart3, color: 'var(--success)' },
    ];

    return (
        <SuperAdminShell activeKey="dashboard">
            <section style={{ padding: '2rem min(2rem, 5vw)' }}>
                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Super Admin Dashboard</p>
                <h1 className="t-display" style={{ marginBottom: '0.5rem' }}>Platform Control Center</h1>
                <p className="t-body" style={{ color: 'var(--text-muted)', maxWidth: '720px', marginBottom: '1.5rem' }}>
                    Monitor privileged access, review admin coverage, and jump into management workflows.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.9rem', marginBottom: '1.5rem' }}>
                    {cards.map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="card" style={{ padding: '1rem', display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon size={18} style={{ color }} />
                            </div>
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)' }}>{label}</p>
                                <p style={{ fontSize: '1.8rem', lineHeight: 1, fontWeight: 900, color }}>{loading ? '-' : value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <h2 className="t-h2">Recent Admin Accounts</h2>
                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>Latest privileged users created in the platform.</p>
                        </div>
                        <Users size={20} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                        {users.slice(0, 5).map((user) => (
                            <div key={user.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
                                <div>
                                    <p style={{ fontWeight: 800, color: 'var(--text)' }}>{user.name}</p>
                                    <p className="t-small" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
                                </div>
                                <span className="t-micro" style={{ color: user.role === 'superadmin' ? '#f59e0b' : 'var(--accent)' }}>{user.role}</span>
                            </div>
                        ))}
                        {!loading && users.length === 0 && <p className="t-small" style={{ color: 'var(--text-muted)' }}>No admin accounts found.</p>}
                    </div>
                </div>
            </section>
        </SuperAdminShell>
    );
};

export default SuperAdminDashboard;
