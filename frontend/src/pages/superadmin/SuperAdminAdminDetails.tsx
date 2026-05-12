import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Building2, Crown, ShieldCheck, Users } from 'lucide-react';
import SuperAdminShell from '../../components/Layout/SuperAdminShell';
import { apiRequest, type Role } from '../../lib/api';

interface AdminDetail {
    admin: {
        id: string;
        name: string;
        email: string;
        role: Role;
        created_at: string;
        org_count: number;
    };
    summary: {
        organizations: number;
        subadmins: number;
        students: number;
        exams: number;
        attempts: number;
        submissions: number;
    };
    organizations: Array<{
        id: string;
        name: string;
        slug: string;
        created_at: string;
        subadmin_count: number;
        student_count: number;
        exam_count: number;
        attempt_count: number;
        submission_count: number;
    }>;
}

const SuperAdminAdminDetails: React.FC = () => {
    const { adminId } = useParams();
    const navigate = useNavigate();
    const [detail, setDetail] = useState<AdminDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!adminId) return;
        setLoading(true);
        apiRequest<AdminDetail>(`/superadmin/admins/${adminId}/details`)
            .then(setDetail)
            .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load admin details.'))
            .finally(() => setLoading(false));
    }, [adminId]);

    const statCards = detail ? [
        { label: 'Organizations', value: detail.summary.organizations, icon: Building2, color: 'var(--accent)' },
        { label: 'Sub Admins', value: detail.summary.subadmins, icon: ShieldCheck, color: '#8b5cf6' },
        { label: 'Exams Conducted', value: detail.summary.exams, icon: BarChart3, color: '#f59e0b' },
        { label: 'Student Attempts', value: detail.summary.attempts, icon: Users, color: 'var(--success)' },
        { label: 'Submitted Attempts', value: detail.summary.submissions, icon: Crown, color: 'var(--text)' },
    ] : [];

    return (
        <SuperAdminShell activeKey="admins">
            <section style={{ padding: '2rem min(2rem, 5vw)' }}>
                <button className="btn btn-md btn-outline" style={{ gap: '0.45rem', marginBottom: '1rem' }} onClick={() => navigate('/superadmin/admins')}>
                    <ArrowLeft size={15} /> Back to Admin Management
                </button>

                {loading ? (
                    <div className="card" style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading admin details...</div>
                ) : error || !detail ? (
                    <div className="card" style={{ padding: '2rem', color: 'var(--danger)' }}>{error ?? 'Admin details not found.'}</div>
                ) : (
                    <>
                        <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                            <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.45rem' }}>Admin Details</p>
                            <h1 className="t-display" style={{ marginBottom: '0.35rem' }}>{detail.admin.name}</h1>
                            <p className="t-body" style={{ color: 'var(--text-muted)' }}>{detail.admin.email}</p>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                                <span className="t-micro" style={{ color: detail.admin.role === 'superadmin' ? '#f59e0b' : 'var(--accent)' }}>{detail.admin.role}</span>
                                <span className="t-micro" style={{ color: 'var(--text-muted)' }}>Created {new Date(detail.admin.created_at).toLocaleDateString()}</span>
                                <span className="t-micro" style={{ color: 'var(--text-muted)' }}>ID {detail.admin.id.slice(0, 8)}</span>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
                            {statCards.map(({ label, value, icon: Icon, color }) => (
                                <div key={label} className="card" style={{ padding: '1rem', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                                    <Icon size={18} style={{ color }} />
                                    <div>
                                        <p className="t-micro" style={{ color: 'var(--text-muted)' }}>{label}</p>
                                        <p style={{ fontWeight: 900, fontSize: '1.55rem', lineHeight: 1, color }}>{value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="card" style={{ padding: '1.25rem' }}>
                            <h2 className="t-h2" style={{ marginBottom: '0.75rem' }}>Organizations Managed</h2>
                            {detail.organizations.length === 0 ? (
                                <p className="t-small" style={{ color: 'var(--text-muted)' }}>This admin is not managing any organization yet.</p>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                {['Organization', 'Sub Admins', 'Students', 'Exams', 'Attempts', 'Submissions'].map((heading) => (
                                                    <th key={heading} style={{ textAlign: heading === 'Organization' ? 'left' : 'right', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>{heading}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detail.organizations.map((org) => (
                                                <tr key={org.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.85rem 0.75rem' }}>
                                                        <p style={{ fontWeight: 800, color: 'var(--text)' }}>{org.name}</p>
                                                        <p className="t-small" style={{ color: 'var(--text-muted)' }}>{org.slug}</p>
                                                    </td>
                                                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>{org.subadmin_count}</td>
                                                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>{org.student_count}</td>
                                                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>{org.exam_count}</td>
                                                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>{org.attempt_count}</td>
                                                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>{org.submission_count}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </section>
        </SuperAdminShell>
    );
};

export default SuperAdminAdminDetails;
