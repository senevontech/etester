import React, { useCallback, useEffect, useState } from 'react';
import {
    Activity,
    User,
    Clock,
    AlertTriangle,
    Search,
    RefreshCw,
    ExternalLink,
    ShieldAlert,
    Monitor,
    Images,
    X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { apiRequest } from '../../lib/api';
import Navbar from '../../components/Layout/Navbar';

interface LiveAttempt {
    id: string;
    student_name: string;
    student_email: string;
    test_title: string;
    test_id: string;
    status: string;
    started_at: string;
    last_heartbeat_at: string;
    violation_score: number;
    ip_address: string;
    violations?: { type: string; message: string; timestamp: string; occurredAt?: string }[];
    evidence_count: number;
    latest_evidence_captured_at?: string;
    latest_evidence_preview?: string;
}

interface AttemptEvidence {
    id: string;
    kind: string;
    mime_type: string;
    image_data: string;
    byte_size: number;
    sha256: string;
    captured_at: string;
    metadata?: Record<string, unknown>;
}

const AdminMonitor: React.FC = () => {
    const { activeOrg } = useOrg();
    const navigate = useNavigate();
    const [attempts, setAttempts] = useState<LiveAttempt[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedAttempt, setSelectedAttempt] = useState<LiveAttempt | null>(null);
    const [evidence, setEvidence] = useState<AttemptEvidence[]>([]);
    const [evidenceLoading, setEvidenceLoading] = useState(false);
    const [evidenceError, setEvidenceError] = useState('');

    const fetchLiveAttempts = useCallback(async (showLoading = false) => {
        if (!activeOrg?.id) return;
        if (showLoading) setLoading(true);
        setRefreshing(true);
        try {
            const data = await apiRequest<{ attempts: LiveAttempt[] }>(`/orgs/${activeOrg.id}/live-attempts`);
            setAttempts(data.attempts);
        } catch (error) {
            console.error('Failed to fetch live attempts:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeOrg?.id]);

    useEffect(() => {
        void fetchLiveAttempts(true);
        const interval = window.setInterval(() => {
            void fetchLiveAttempts();
        }, 10000);
        return () => window.clearInterval(interval);
    }, [fetchLiveAttempts]);

    const openEvidenceReview = useCallback(async (attempt: LiveAttempt) => {
        setSelectedAttempt(attempt);
        setEvidence([]);
        setEvidenceError('');
        setEvidenceLoading(true);
        try {
            const data = await apiRequest<{ evidence: AttemptEvidence[] }>(`/attempts/${attempt.id}/evidence?limit=12`);
            setEvidence(data.evidence ?? []);
        } catch (error) {
            console.error('Failed to fetch attempt evidence:', error);
            setEvidenceError(error instanceof Error ? error.message : 'Unable to load evidence right now.');
        } finally {
            setEvidenceLoading(false);
        }
    }, []);

    const filtered = attempts.filter((attempt) =>
        attempt.student_name.toLowerCase().includes(search.toLowerCase()) ||
        attempt.test_title.toLowerCase().includes(search.toLowerCase())
    );

    const flaggedCount = attempts.filter((attempt) => attempt.violation_score > 0).length;
    const reviewedCount = attempts.filter((attempt) => attempt.evidence_count > 0).length;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar activeTab="admin" />

            <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)', marginBottom: '0.5rem' }}>
                            <Activity size={18} />
                            <span className="t-micro" style={{ fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Live Supervision</span>
                        </div>
                        <h1 className="t-hero" style={{ fontSize: '2.5rem' }}>Active Sessions</h1>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div className="card" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--surface-raised)' }}>
                            <Monitor size={18} style={{ color: 'var(--text-muted)' }} />
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)' }}>Live Now</p>
                                <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{attempts.length}</p>
                            </div>
                        </div>
                        <div className="card" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: reviewedCount > 0 ? 'var(--surface-raised)' : 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                            <Images size={18} style={{ color: reviewedCount > 0 ? 'var(--text)' : 'var(--text-muted)' }} />
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)' }}>With Evidence</p>
                                <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{reviewedCount}</p>
                            </div>
                        </div>
                        <div className="card" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: flaggedCount > 0 ? 'var(--danger-bg)' : 'var(--surface-raised)', border: flaggedCount > 0 ? '1px solid var(--danger)' : '1px solid var(--border)' }}>
                            <ShieldAlert size={18} style={{ color: flaggedCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }} />
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)' }}>Flagged</p>
                                <p style={{ fontWeight: 800, fontSize: '1.1rem', color: flaggedCount > 0 ? 'var(--danger)' : 'inherit' }}>{flaggedCount}</p>
                            </div>
                        </div>
                    </div>
                </header>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            className="input"
                            placeholder="Filter by student or test..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            style={{ paddingLeft: '2.5rem' }}
                        />
                    </div>
                    <button
                        className={`btn btn-sm btn-outline ${refreshing ? 'loading' : ''}`}
                        onClick={() => void fetchLiveAttempts(true)}
                        style={{ gap: '0.5rem' }}
                    >
                        <RefreshCw size={14} className={refreshing ? 'anim-spin' : ''} />
                        {refreshing ? 'Syncing...' : 'Refresh'}
                    </button>
                </div>

                {loading ? (
                    <div style={{ padding: '4rem', textAlign: 'center' }}>
                        <div className="anim-spin" style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto' }} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="card" style={{ padding: '4rem', textAlign: 'center', background: 'var(--bg-subtle)', border: '2px dashed var(--border)' }}>
                        <Monitor size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.3 }} />
                        <h3 className="t-h3">No active sessions</h3>
                        <p className="t-body" style={{ color: 'var(--text-muted)' }}>There are no students currently taking a test in this organization.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
                        {filtered.map((attempt) => (
                            <div key={attempt.id} className="card anim-fade-up" style={{ padding: '1.25rem', border: attempt.violation_score > 0 ? '1px solid var(--danger)' : '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <User size={20} />
                                        </div>
                                        <div>
                                            <p style={{ fontWeight: 800, fontSize: '0.95rem' }}>{attempt.student_name}</p>
                                            <p className="t-micro" style={{ color: 'var(--text-muted)' }}>{attempt.student_email}</p>
                                        </div>
                                    </div>
                                    <span className={`badge ${attempt.violation_score > 0 ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '10px' }}>
                                        {attempt.violation_score > 0 ? 'FLAGGED' : 'ACTIVE'}
                                    </span>
                                </div>

                                <div style={{ background: 'var(--bg-subtle)', padding: '0.875rem', borderRadius: '10px', marginBottom: '1rem' }}>
                                    <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Assessment</p>
                                    <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{attempt.test_title}</p>
                                </div>

                                <div style={{ marginBottom: '1rem' }}>
                                    <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Latest Evidence</p>
                                    {attempt.latest_evidence_preview ? (
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.625rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
                                            <img
                                                src={attempt.latest_evidence_preview}
                                                alt={`${attempt.student_name} evidence preview`}
                                                style={{ width: '92px', height: '68px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }}
                                            />
                                            <div style={{ minWidth: 0 }}>
                                                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>{attempt.evidence_count} snapshot{attempt.evidence_count === 1 ? '' : 's'}</p>
                                                <p className="t-small" style={{ color: 'var(--text-muted)', lineHeight: 1.45 }}>
                                                    Last capture {attempt.latest_evidence_captured_at ? new Date(attempt.latest_evidence_captured_at).toLocaleTimeString() : 'pending'}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '0.75rem', borderRadius: '10px', border: '1px dashed var(--border)', background: 'var(--bg-subtle)' }}>
                                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>No server-backed evidence uploaded yet for this attempt.</p>
                                        </div>
                                    )}
                                </div>

                                {attempt.violations && attempt.violations.length > 0 && (
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Recent Incidents</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                            {attempt.violations.slice(-2).reverse().map((violation, index) => (
                                                <div key={`${attempt.id}-violation-${index}`} style={{ padding: '0.5rem', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: '6px', opacity: index === 1 ? 0.6 : 1 }}>
                                                    <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--danger)' }}>{violation.type}</p>
                                                    <p style={{ fontSize: '10px', color: 'var(--text)' }}>{violation.message}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            <Clock size={12} />
                                            <span className="t-micro">Started</span>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{new Date(attempt.started_at).toLocaleTimeString()}</p>
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: attempt.violation_score > 0 ? 'var(--danger)' : 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            <AlertTriangle size={12} />
                                            <span className="t-micro">Flags</span>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', fontWeight: 800, color: attempt.violation_score > 0 ? 'var(--danger)' : 'inherit' }}>{attempt.violation_score}</p>
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            <Images size={12} />
                                            <span className="t-micro">Evidence</span>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', fontWeight: 800 }}>{attempt.evidence_count}</p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border)', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>IP: {attempt.ip_address || 'Unknown'}</span>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <button className="btn btn-sm btn-outline" style={{ gap: '0.375rem' }} onClick={() => void openEvidenceReview(attempt)}>
                                            <Images size={12} /> Review Evidence
                                        </button>
                                        <button
                                            onClick={() => navigate(`/admin/test/${attempt.test_id}/results`)}
                                            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                                        >
                                            Inspect <ExternalLink size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {selectedAttempt && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(12, 17, 24, 0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
                    <div className="card" style={{ width: 'min(1000px, 100%)', maxHeight: '90vh', overflow: 'hidden', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                            <div>
                                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Evidence Review</p>
                                <h3 className="t-h3" style={{ marginBottom: '0.2rem' }}>{selectedAttempt.student_name} - {selectedAttempt.test_title}</h3>
                                <p className="t-small" style={{ color: 'var(--text-muted)' }}>Recent webcam captures stored on the server for review.</p>
                            </div>
                            <button className="icon-btn" onClick={() => setSelectedAttempt(null)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto' }}>
                            {evidenceLoading ? (
                                <div style={{ padding: '3rem 0', textAlign: 'center' }}>
                                    <div className="anim-spin" style={{ width: '28px', height: '28px', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 1rem' }} />
                                    <p className="t-body">Loading evidence...</p>
                                </div>
                            ) : evidenceError ? (
                                <div style={{ padding: '1rem', borderRadius: '10px', border: '1px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                                    {evidenceError}
                                </div>
                            ) : evidence.length === 0 ? (
                                <div style={{ padding: '3rem 0', textAlign: 'center' }}>
                                    <Images size={40} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.35 }} />
                                    <p className="t-h3">No evidence uploaded yet</p>
                                    <p className="t-body" style={{ color: 'var(--text-muted)' }}>This attempt has not produced any stored webcam captures so far.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.9rem' }}>
                                    {evidence.map((item) => (
                                        <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--surface)' }}>
                                            <img src={item.image_data} alt={`Evidence ${item.id}`} style={{ width: '100%', height: '165px', objectFit: 'cover', display: 'block', background: 'var(--bg-subtle)' }} />
                                            <div style={{ padding: '0.75rem' }}>
                                                <p className="t-small" style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{new Date(item.captured_at).toLocaleString()}</p>
                                                <p className="t-small" style={{ color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{Math.round(item.byte_size / 1024)} KB</p>
                                                <p className="t-micro" style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>{item.sha256.slice(0, 16)}...</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .anim-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default AdminMonitor;
