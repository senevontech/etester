import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Table2, Users } from 'lucide-react';
import RoleShell from '../../components/Layout/RoleShell';
import { useOrg } from '../../context/OrgContext';

interface AssignmentManagementProps {
    role: 'admin' | 'subadmin';
}

const AssignmentManagement: React.FC<AssignmentManagementProps> = ({ role }) => {
    const navigate = useNavigate();
    const { activeOrg } = useOrg();

    const base = role === 'admin' ? '/admin' : '/subadmin';

    const cards = [
        {
            label: 'Groups',
            description: 'Create and maintain groups for targeted assignments.',
            icon: Users,
            onClick: () => navigate(`${base}/groups`),
        },
        {
            label: 'Students',
            description: 'Review student lists before assigning tests.',
            icon: Table2,
            onClick: () => navigate(`${base}/students`),
        },
    ];

    return (
        <RoleShell role={role} activeKey="assignments">
            <section className="anim-fade-up" style={{ marginBottom: '1.5rem' }}>
                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Assignment Management</p>
                <h1 className="t-h1" style={{ marginBottom: '0.5rem' }}>{activeOrg?.name ?? 'Organization'}</h1>
                <p className="t-body" style={{ color: 'var(--text-muted)', maxWidth: '680px' }}>
                    Manage the people and groups used for assigning exams. Test-level assignment controls remain available inside each test editor.
                </p>
            </section>

            <section className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {cards.map(({ label, description, icon: Icon, onClick }) => (
                    <button
                        key={label}
                        className="card hover-antigravity"
                        onClick={onClick}
                        style={{ padding: '1rem 1.125rem', display: 'flex', alignItems: 'center', gap: '0.85rem', textAlign: 'left', background: 'var(--bg)', cursor: 'pointer', border: '1px solid var(--border)' }}
                    >
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon size={18} style={{ color: 'var(--text-2)' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 800, color: 'var(--text)', marginBottom: '0.3rem' }}>{label}</p>
                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>{description}</p>
                        </div>
                        <ArrowRight size={15} style={{ color: 'var(--text-muted)' }} />
                    </button>
                ))}
            </section>

            <div className="card anim-fade-up" style={{ marginTop: '1rem', padding: '1rem 1.125rem' }}>
                <p className="t-small" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    Need to assign a specific test? Open <strong>{base}/tests</strong>, choose the test, and manage its assignments from the test editor.
                </p>
            </div>
        </RoleShell>
    );
};

export default AssignmentManagement;
