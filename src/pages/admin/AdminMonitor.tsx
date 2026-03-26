import React, { useState, useEffect, useCallback } from 'react';
import { 
    Activity, 
    User, 
    Clock, 
    AlertTriangle, 
    Search, 
    RefreshCw,
    ExternalLink,
    ShieldAlert,
    Monitor
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
    violations?: { type: string; message: string; timestamp: string }[];
}

const AdminMonitor: React.FC = () => {
    const { activeOrg } = useOrg();
    const navigate = useNavigate();
    const [attempts, setAttempts] = useState<LiveAttempt[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');

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
        const interval = setInterval(() => {
            void fetchLiveAttempts();
        }, 10000); // Refresh every 10s
        return () => clearInterval(interval);
    }, [fetchLiveAttempts]);

    const filtered = attempts.filter(a => 
        a.student_name.toLowerCase().includes(search.toLowerCase()) ||
        a.test_title.toLowerCase().includes(search.toLowerCase())
    );

    const flaggedCount = attempts.filter(a => a.violation_score > 0).length;

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

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <div className="card" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--surface-raised)' }}>
                            <Monitor size={18} style={{ color: 'var(--text-muted)' }} />
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)' }}>Live Now</p>
                                <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{attempts.length}</p>
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
                            onChange={e => setSearch(e.target.value)}
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
                        {filtered.map(attempt => (
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

                                <div style={{ background: 'var(--bg-subtle)', padding: '0.875rem', borderRadius: '10px', marginBottom: '1.25rem' }}>
                                    <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Assessment</p>
                                    <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{attempt.test_title}</p>
                                </div>

                                {attempt.violations && attempt.violations.length > 0 && (
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Recent Incidents</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                            {attempt.violations.slice(-2).reverse().map((v, i) => (
                                                <div key={i} style={{ padding: '0.5rem', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: '6px', opacity: i === 1 ? 0.6 : 1 }}>
                                                    <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--danger)' }}>{v.type}</p>
                                                    <p style={{ fontSize: '10px', color: 'var(--text)' }}>{v.message}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
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
                                            <span className="t-micro">Violations</span>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', fontWeight: 800, color: attempt.violation_score > 0 ? 'var(--danger)' : 'inherit' }}>{attempt.violation_score}</p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>IP: {attempt.ip_address || 'Unknown'}</span>
                                    <button
                                        onClick={() => navigate(`/admin/test/${attempt.test_id}/results`)}
                                        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                                    >
                                        Inspect <ExternalLink size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
            <style>{`
                .anim-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default AdminMonitor;
