import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Crown, Shield } from 'lucide-react';
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

const SuperAdminAnalytics: React.FC = () => {
    const [users, setUsers] = useState<SystemUser[]>([]);

    useEffect(() => {
        apiRequest<{ users: SystemUser[] }>('/superadmin/users').then((data) => setUsers(data.users));
    }, []);

    const analytics = useMemo(() => {
        const admins = users.filter((user) => user.role === 'admin').length;
        const superadmins = users.filter((user) => user.role === 'superadmin').length;
        const orgs = users.reduce((total, user) => total + Number(user.org_count ?? 0), 0);
        return { admins, superadmins, orgs };
    }, [users]);

    const rows = [
        { label: 'Admin Accounts', value: analytics.admins, icon: Crown, color: 'var(--accent)' },
        { label: 'Super Admin Accounts', value: analytics.superadmins, icon: Shield, color: '#f59e0b' },
        { label: 'Organizations Managed By Admins', value: analytics.orgs, icon: BarChart3, color: 'var(--success)' },
    ];

    return (
        <SuperAdminShell activeKey="analytics">
            <section style={{ padding: '2rem min(2rem, 5vw)' }}>
                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Analytics</p>
                <h1 className="t-display" style={{ marginBottom: '0.5rem' }}>Platform Analytics</h1>
                <p className="t-body" style={{ color: 'var(--text-muted)', maxWidth: '720px', marginBottom: '1.5rem' }}>
                    High-level platform access and organization coverage metrics for super admins.
                </p>

                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <Activity size={20} style={{ color: '#f59e0b' }} />
                        <h2 className="t-h2">Access Overview</h2>
                    </div>
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {rows.map(({ label, value, icon: Icon, color }) => (
                            <div key={label} style={{ display: 'grid', gridTemplateColumns: '42px 1fr 80px', alignItems: 'center', gap: '0.75rem', padding: '0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
                                <Icon size={18} style={{ color }} />
                                <span style={{ fontWeight: 800, color: 'var(--text)' }}>{label}</span>
                                <span style={{ textAlign: 'right', fontWeight: 900, fontSize: '1.25rem', color }}>{value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </SuperAdminShell>
    );
};

export default SuperAdminAnalytics;
