import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, BookOpen, ShieldCheck } from 'lucide-react';
import RoleShell from '../../components/Layout/RoleShell';
import { useOrg } from '../../context/OrgContext';
import { useTests } from '../../context/TestContext';

const SubAdminOverview: React.FC = () => {
    const navigate = useNavigate();
    const { activeOrg, orgMembers } = useOrg();
    const { tests } = useTests();

    const cards = [
        { label: 'Test Management', value: String(tests.length), icon: BookOpen, onClick: () => navigate('/subadmin/tests') },
        { label: 'Assignment Management', value: String(orgMembers.filter((member) => member.role === 'student').length), icon: ShieldCheck, onClick: () => navigate('/subadmin/assignments') },
        { label: 'Interview Management', value: 'Live', icon: Activity, onClick: () => navigate('/subadmin/interviews') },
    ];

    return (
        <RoleShell role="subadmin" activeKey="dashboard">
            <section className="anim-fade-up" style={{ marginBottom: '1.5rem' }}>
                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Subadmin Dashboard</p>
                <h1 className="t-h1" style={{ marginBottom: '0.5rem' }}>{activeOrg?.name ?? 'Organization'}</h1>
                <p className="t-body" style={{ color: 'var(--text-muted)', maxWidth: '640px' }}>
                    Organize tests, assignments, and interview activity for your admin team from this workspace.
                </p>
            </section>

            <section className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {cards.map(({ label, value, icon: Icon, onClick }) => (
                    <button
                        key={label}
                        className="card hover-antigravity"
                        onClick={onClick}
                        style={{ padding: '1rem 1.125rem', display: 'flex', alignItems: 'center', gap: '0.85rem', textAlign: 'left', background: 'var(--bg)', cursor: 'pointer', border: '1px solid var(--border)' }}
                    >
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon size={17} style={{ color: 'var(--text-2)' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{label}</p>
                            <p style={{ fontWeight: 900, fontSize: '1.25rem', color: 'var(--text)' }}>{value}</p>
                        </div>
                        <ArrowRight size={15} style={{ color: 'var(--text-muted)' }} />
                    </button>
                ))}
            </section>
        </RoleShell>
    );
};

export default SubAdminOverview;
