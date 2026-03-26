import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Globe, EyeOff, BarChart2, BookOpen, Clock, ChevronRight, Shield, Copy, Check, Users, Table2, Activity } from 'lucide-react';
import Navbar from '../../components/Layout/Navbar';
import { useTests } from '../../context/TestContext';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { Difficulty } from '../../context/TestContext';
import type { Test } from '../../context/TestContext';
import { apiRequest } from '../../lib/api';

const DIFF_BADGE: Record<Difficulty, string> = {
    Easy: 'badge-success', Medium: 'badge-warning', Hard: 'badge-danger',
};

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
    'org.invite_code_regenerated': 'rotated the invite code',
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

// ─── Create Test Modal ────────────────────────────────────────────────────────
interface CreateModalProps { onClose: () => void; onCreate: (id: string) => void; }

const CreateModal: React.FC<CreateModalProps> = ({ onClose, onCreate }) => {
    const { createTest } = useTests();
    const { activeOrg } = useOrg();
    const { user } = useAuth();
    const [form, setForm] = useState({ title: '', description: '', duration: 60, difficulty: 'Medium' as Difficulty, tags: '' });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim() || !activeOrg?.id || !user?.id) return;
        setLoading(true);
        const test = await createTest({
            title: form.title.trim(),
            description: form.description.trim(),
            duration: form.duration,
            difficulty: form.difficulty,
            tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
            orgId: activeOrg.id,
            createdBy: user.id,
            startAt: null
        });
        setLoading(false);
        if (test) onCreate(test.id);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
            <div className="anim-fade-up" style={{ background: 'var(--bg)', border: '1px solid var(--border)', width: '100%', maxWidth: '480px', boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 className="t-h3">New Assessment</h2>
                    <button className="icon-btn" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <p className="label" style={{ marginBottom: '0.375rem' }}>Title *</p>
                        <input className="input" placeholder="e.g. Advanced SQL Queries" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
                    </div>
                    <div>
                        <p className="label" style={{ marginBottom: '0.375rem' }}>Description</p>
                        <textarea className="input" placeholder="Short summary…" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical', fontFamily: 'Manrope, sans-serif' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <p className="label" style={{ marginBottom: '0.375rem' }}>Duration (min)</p>
                            <input className="input" type="number" min={5} max={360} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} />
                        </div>
                        <div>
                            <p className="label" style={{ marginBottom: '0.375rem' }}>Difficulty</p>
                            <select className="input" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value as Difficulty }))}>
                                {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map(d => <option key={d}>{d}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <p className="label" style={{ marginBottom: '0.375rem' }}>Tags (comma-separated)</p>
                        <input className="input" placeholder="e.g. SQL, Database, Backend" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                        <button type="button" className="btn btn-md btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-md btn-primary hover-glow" style={{ flex: 1 }} disabled={loading}>
                            {loading ? 'Creating…' : 'Create & Edit'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Test Row ─────────────────────────────────────────────────────────────────
interface TestRowProps { test: Test; onEdit: () => void; onDelete: () => void; onTogglePublish: () => void; }

const TestRow: React.FC<TestRowProps> = ({ test, onEdit, onDelete, onTogglePublish }) => (
    <div className="card hover-antigravity" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }} onClick={onEdit}>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                <span className="t-h3" style={{ color: 'var(--text)' }}>{test.title}</span>
                <span className={`badge ${DIFF_BADGE[test.difficulty]}`}>{test.difficulty}</span>
                <span className={`badge ${test.published ? 'badge-solid' : 'badge-neutral'}`}>{test.published ? 'Published' : 'Draft'}</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><BookOpen size={12} />{test.questions.length} questions</span>
                <span className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={12} />{test.duration} min</span>
            </div>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button className="btn btn-sm btn-ghost" onClick={onTogglePublish} title={test.published ? 'Unpublish' : 'Publish'} style={{ gap: '0.3rem' }}>
                {test.published ? <EyeOff size={13} /> : <Globe size={13} />}
                <span className="desktop-only">{test.published ? 'Unpublish' : 'Publish'}</span>
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onDelete} style={{ color: 'var(--danger)' }} title="Delete"><Trash2 size={13} /></button>
            <button className="btn btn-sm btn-outline" onClick={onEdit} style={{ gap: '0.375rem' }}><Edit2 size={12} /> Edit</button>
        </div>
        <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </div>
);

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { tests, deleteTest, publishTest, unpublishTest, loading } = useTests();
    const { activeOrg, generateNewInviteCode } = useOrg();
    const [showCreate, setShowCreate] = useState(false);
    const [copied, setCopied] = useState(false);
    const [publishError, setPublishError] = useState<string | null>(null);
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
                const data = await apiRequest<{ logs: AuditLogEntry[] }>(`/orgs/${activeOrg.id}/audit-logs?limit=12`);
                if (!cancelled) {
                    setAuditLogs(data.logs ?? []);
                }
            } catch {
                if (!cancelled) {
                    setAuditLogs([]);
                }
            } finally {
                if (!cancelled) {
                    setAuditLoading(false);
                }
            }
        };

        void loadAuditLogs();

        return () => {
            cancelled = true;
        };
    }, [activeOrg?.id, activeOrg?.invite_code, tests]);

    const handleTogglePublish = async (test: Test) => {
        setPublishError(null);
        try {
            if (test.published) {
                await unpublishTest(test.id);
            } else {
                await publishTest(test.id);
            }
        } catch (err: unknown) {
            setPublishError(err instanceof Error ? err.message : 'Failed to update publish status.');
        }
    };

    const copyInviteCode = () => {
        if (!activeOrg?.invite_code) return;
        navigator.clipboard.writeText(activeOrg.invite_code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const published = tests.filter(t => t.published).length;
    const totalQ = tests.reduce((acc, t) => acc + (t.questions?.length ?? 0), 0);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar />
            <main className="container" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>

                {/* Header */}
                <div className="anim-fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <div style={{ width: '24px', height: '24px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Shield size={13} color="var(--accent-fg)" strokeWidth={2.5} />
                            </div>
                            <span className="t-micro" style={{ color: 'var(--text-muted)' }}>{activeOrg?.name ?? 'Admin Panel'}</span>
                        </div>
                        <h1 className="t-h1">Assessments</h1>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-md btn-outline" style={{ gap: '0.5rem' }} onClick={() => navigate('/admin/monitor')}>
                            <Activity size={15} /> Live Monitor
                        </button>
                        <button className="btn btn-md btn-outline" style={{ gap: '0.5rem' }} onClick={() => navigate('/admin/students')}>
                            <Table2 size={15} /> Students
                        </button>
                        <button className="btn btn-md btn-outline" style={{ gap: '0.5rem' }} onClick={() => navigate('/admin/groups')}>
                            <Users size={15} /> Groups
                        </button>
                        <button className="btn btn-md btn-primary hover-glow" style={{ gap: '0.5rem' }} onClick={() => setShowCreate(true)}>
                            <Plus size={16} /> New Assessment
                        </button>
                    </div>
                </div>

                {/* Invite Code Banner */}
                {activeOrg && (
                    <div className="card anim-fade-up" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        <Users size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <p className="t-small" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>Student Invite Code</p>
                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>Share this code so students can join <strong>{activeOrg.name}</strong></p>
                        </div>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)', background: 'var(--bg-subtle)', padding: '0.375rem 0.875rem', border: '1px solid var(--border)' }}>
                            {activeOrg.invite_code}
                        </span>
                        <button className="btn btn-sm btn-outline" style={{ gap: '0.375rem', flexShrink: 0 }} onClick={copyInviteCode}>
                            {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                        </button>
                        <button className="btn btn-sm btn-ghost" style={{ flexShrink: 0 }} onClick={generateNewInviteCode} title="Generate new code">↺ Regenerate</button>
                    </div>
                )}

                {/* Stats */}
                <div className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.625rem', marginBottom: '1.5rem' }}>
                    {[
                        { icon: Activity, label: 'Live Sessions', value: 'Live', onClick: () => navigate('/admin/monitor'), color: 'var(--accent)' },
                        { icon: BookOpen, label: 'Total Tests', value: String(tests.length) },
                        { icon: Globe, label: 'Published', value: String(published) },
                        { icon: BarChart2, label: 'Total Questions', value: String(totalQ) },
                    ].map(({ icon: Icon, label, value, onClick, color }) => (
                        <div 
                            key={label} 
                            className="card hover-antigravity" 
                            style={{ padding: '0.875rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', cursor: onClick ? 'pointer' : 'default' }}
                            onClick={onClick}
                        >
                            <div style={{ width: '32px', height: '32px', background: 'var(--surface-raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon size={15} style={{ color: color || 'var(--text-2)' }} />
                            </div>
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</p>
                                <p style={{ fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-0.03em', color: color || 'var(--text)', lineHeight: 1 }}>{value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <section className="card anim-fade-up" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
                        <div>
                            <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Recent Activity</p>
                            <h2 className="t-h3" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <Activity size={16} /> Audit Trail
                            </h2>
                        </div>
                        <span className="t-small" style={{ color: 'var(--text-muted)' }}>Latest 12 org events</span>
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

                {/* Publish error banner */}
                {publishError && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem 1rem', background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)', marginBottom: '1rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', flex: 1 }}>{publishError}</span>
                        <button onClick={() => setPublishError(null)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', lineHeight: 1 }}>✕</button>
                    </div>
                )}

                {/* Tests list */}
                <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.375rem' }}>{tests.length} assessment{tests.length !== 1 ? 's' : ''}</p>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <div style={{ width: '28px', height: '28px', border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
                            <p className="t-body">Loading assessments…</p>
                        </div>
                    ) : tests.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                            <BookOpen size={48} className="antigravity" style={{ margin: '0 auto 1rem', color: 'var(--accent)', opacity: 0.8 }} />
                            <p className="t-h3">No assessments yet</p>
                            <p className="t-body" style={{ margin: '0.5rem 0 1.5rem' }}>Create your first assessment to get started.</p>
                            <button className="btn btn-md btn-primary hover-glow" onClick={() => setShowCreate(true)}>Create Assessment</button>
                        </div>
                    ) : (
                        tests.map(test => (
                            <TestRow
                                key={test.id}
                                test={test}
                                onEdit={() => navigate(`/admin/test/${test.id}`)}
                                onDelete={() => { if (confirm(`Delete "${test.title}"?`)) deleteTest(test.id); }}
                                onTogglePublish={() => handleTogglePublish(test)}
                            />
                        ))
                    )}
                </div>
            </main>

            {showCreate && (
                <CreateModal
                    onClose={() => setShowCreate(false)}
                    onCreate={(id) => { setShowCreate(false); navigate(`/admin/test/${id}`); }}
                />
            )}

            <style>{`@media(max-width:767px){.desktop-only{display:none}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
};

export default AdminDashboard;
