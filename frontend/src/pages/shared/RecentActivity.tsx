import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import RoleShell from '../../components/Layout/RoleShell';
import { useOrg } from '../../context/OrgContext';
import { apiRequest } from '../../lib/api';

interface RecentActivityProps {
    role: 'admin' | 'subadmin';
}

interface AuditLogEntry {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    actor: {
        id: string;
        name: string;
        email: string;
    } | null;
}

const ACTION_LABELS: Record<string, string> = {
    'org.created': 'created the organization',
    'org.joined': 'joined the organization',
    'test.created': 'created a test',
    'test.updated': 'updated a test',
    'test.published': 'published a test',
    'test.unpublished': 'unpublished a test',
    'test.deleted': 'deleted a test',
    'question.created': 'added a question',
    'question.updated': 'updated a question',
    'question.deleted': 'deleted a question',
    'question.reordered': 'reordered questions',
    'attempt.started': 'started an attempt',
    'submission.created': 'submitted an attempt',
};

const getAuditSubject = (log: AuditLogEntry) => {
    const title = typeof log.metadata.title === 'string'
        ? log.metadata.title
        : typeof log.metadata.testTitle === 'string'
            ? log.metadata.testTitle
            : typeof log.metadata.organizationName === 'string'
                ? log.metadata.organizationName
                : null;

    if (title) return title;
    if (log.entity_type === 'question') return 'question';
    if (log.entity_type === 'test') return 'test';
    if (log.entity_type === 'organization') return 'organization';
    if (log.entity_type === 'submission') return 'submission';
    if (log.entity_type === 'attempt') return 'attempt';
    return log.entity_type;
};

const RecentActivity: React.FC<RecentActivityProps> = ({ role }) => {
    const { activeOrg } = useOrg();
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);

    useEffect(() => {
        if (!activeOrg?.id) {
            setAuditLogs([]);
            return;
        }

        let cancelled = false;
        setAuditLoading(true);

        const loadAuditLogs = async () => {
            try {
                const data = await apiRequest<{ logs: AuditLogEntry[] }>(`/orgs/${activeOrg.id}/audit-logs?limit=50`);
                if (!cancelled) setAuditLogs(data.logs ?? []);
            } catch {
                if (!cancelled) setAuditLogs([]);
            } finally {
                if (!cancelled) setAuditLoading(false);
            }
        };

        void loadAuditLogs();

        return () => {
            cancelled = true;
        };
    }, [activeOrg?.id]);

    return (
        <RoleShell role={role} activeKey="activity">
            <section className="anim-fade-up" style={{ marginBottom: '1.5rem' }}>
                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Recent Activity</p>
                <h1 className="t-h1" style={{ marginBottom: '0.5rem' }}>{activeOrg?.name ?? 'Organization'}</h1>
                <p className="t-body" style={{ color: 'var(--text-muted)', maxWidth: '680px' }}>
                    Review the latest organization events, including test changes, question edits, attempts, and submissions.
                </p>
            </section>

            <section className="card anim-fade-up" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
                    <h2 className="t-h3" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <Activity size={16} /> Audit Trail
                    </h2>
                    <span className="t-small" style={{ color: 'var(--text-muted)' }}>Latest 50 org events</span>
                </div>

                {auditLoading ? (
                    <p className="t-body" style={{ color: 'var(--text-muted)' }}>Loading recent activity...</p>
                ) : auditLogs.length === 0 ? (
                    <p className="t-body" style={{ color: 'var(--text-muted)' }}>No audit entries yet for this organization.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        {auditLogs.map((log) => (
                            <div key={log.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.75rem', paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
                                <div>
                                    <p className="t-small" style={{ color: 'var(--text)', fontWeight: 700, marginBottom: '0.15rem' }}>
                                        {(log.actor?.name || log.actor?.email || 'System')} {ACTION_LABELS[log.action] ?? log.action} <span style={{ color: 'var(--accent)' }}>{getAuditSubject(log)}</span>
                                    </p>
                                    <p className="t-small" style={{ color: 'var(--text-muted)' }}>
                                        {new Date(log.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <span className="badge badge-neutral" style={{ alignSelf: 'start' }}>{log.entity_type}</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </RoleShell>
    );
};

export default RecentActivity;
