import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight } from 'lucide-react';
import RoleShell from '../../components/Layout/RoleShell';
import { useOrg } from '../../context/OrgContext';

interface InterviewManagementProps {
    role: 'admin' | 'subadmin';
}

const InterviewManagement: React.FC<InterviewManagementProps> = ({ role }) => {
    const navigate = useNavigate();
    const { activeOrg } = useOrg();
    const base = role === 'admin' ? '/admin' : '/subadmin';

    return (
        <RoleShell role={role} activeKey="interviews">
            <section className="anim-fade-up" style={{ marginBottom: '1.5rem' }}>
                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Interview Management</p>
                <h1 className="t-h1" style={{ marginBottom: '0.5rem' }}>{activeOrg?.name ?? 'Organization'}</h1>
                <p className="t-body" style={{ color: 'var(--text-muted)', maxWidth: '680px' }}>
                    Track live interview or assessment activity from one place. Open the monitor to watch real-time candidate sessions.
                </p>
            </section>

            <button
                className="card hover-antigravity anim-fade-up"
                onClick={() => navigate(`${base}/monitor`)}
                style={{ width: '100%', padding: '1rem 1.125rem', display: 'flex', alignItems: 'center', gap: '0.85rem', textAlign: 'left', background: 'var(--bg)', cursor: 'pointer', border: '1px solid var(--border)' }}
            >
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Activity size={18} style={{ color: 'var(--text-2)' }} />
                </div>
                <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 800, color: 'var(--text)', marginBottom: '0.3rem' }}>Open Live Monitor</p>
                    <p className="t-small" style={{ color: 'var(--text-muted)' }}>View active sessions, heartbeat activity, and integrity updates.</p>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--text-muted)' }} />
            </button>
        </RoleShell>
    );
};

export default InterviewManagement;
