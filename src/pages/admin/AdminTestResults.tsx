import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResults } from '../../context/ResultContext';
import { useTests } from '../../context/TestContext';
import { ArrowLeft, User, ShieldAlert, Award, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import Navbar from '../../components/Layout/Navbar';

const AdminTestResults: React.FC = () => {
    const { testId } = useParams();
    const navigate = useNavigate();
    const { getTest } = useTests();
    const { getTestSubmissions } = useResults();

    const test = getTest(testId ?? '');
    const subs = getTestSubmissions(testId ?? '').sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    if (!test) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
            <p className="t-h2">Test not found</p>
            <button className="btn btn-primary btn-md hover-glow" onClick={() => navigate('/admin')}>Back to Admin</button>
        </div>
    );

    const avgScore = subs.length > 0 ? (subs.reduce((a, b) => a + b.score, 0) / subs.length) : 0;
    const avgIntegrity = subs.length > 0 ? (subs.reduce((a, b) => a + b.integrityScore, 0) / subs.length) : 0;
    const flags = subs.reduce((a, b) => a + b.violationsCount, 0);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar />

            <header style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', position: 'sticky', top: '56px', zIndex: 90 }}>
                <div className="container" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/admin/test/${test.id}`)} style={{ gap: '0.3rem' }}>
                        <ArrowLeft size={14} /> Editor
                    </button>
                    <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
                    <div>
                        <span className="t-h3" style={{ fontSize: '0.9rem', lineHeight: 1 }}>{test.title}</span>
                        <span className="t-micro" style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', lineHeight: 1 }}>Submissions</span>
                    </div>
                </div>
            </header>

            <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
                <div className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '2.5rem' }}>
                    {[
                        { label: 'Total Submissions', value: subs.length, icon: User },
                        { label: 'Avg Score', value: `${avgScore.toFixed(1)} / ${test.questions.reduce((a, b) => a + b.points, 0)}`, icon: Award },
                        { label: 'Avg Integrity', value: `${Math.round(avgIntegrity)}%`, icon: ShieldAlert },
                        { label: 'Total Flags', value: flags, icon: AlertTriangle, danger: flags > 0 },
                    ].map((s, i) => (
                        <div key={i} className="card hover-antigravity" style={{ padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: s.danger ? 'var(--danger-bg)' : 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <s.icon size={16} style={{ color: s.danger ? 'var(--danger)' : 'var(--text-2)' }} />
                            </div>
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{s.label}</p>
                                <p className="t-h2" style={{ color: s.danger ? 'var(--danger)' : 'var(--text)' }}>{s.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <section className="anim-fade-up">
                    <p className="label" style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Attempt Log</p>
                    {subs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                            <AlertTriangle size={48} className="antigravity" style={{ margin: '0 auto 1rem', color: 'var(--accent)', opacity: 0.8 }} />
                            <p className="t-h3">No submissions yet.</p>
                            <p className="t-body" style={{ marginTop: '0.5rem' }}>Once students complete this test, their scores and integrity data will appear here.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {subs.map(sub => (
                                <div key={sub.id} className="card hover-antigravity" style={{ padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-start' }}>
                                    <div style={{ flex: '1 1 200px' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                                            <span className="t-h3" style={{ color: 'var(--text)' }}>{sub.studentName}</span>
                                            <span className={`badge ${sub.integrityScore < 80 ? 'badge-danger' : 'badge-success'}`}>{sub.integrityScore}% Integrity</span>
                                        </div>
                                        <p className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            {new Date(sub.submittedAt).toLocaleString()}
                                            {sub.violationsCount > 0 && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>• {sub.violationsCount} Flags</span>}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <p className="label" style={{ color: 'var(--text-muted)' }}>Score</p>
                                            <p className="t-h2" style={{ color: 'var(--text)' }}>{sub.score} <span className="t-small" style={{ color: 'var(--text-muted)' }}>/ {sub.totalPoints}</span></p>
                                        </div>
                                    </div>
                                    <div style={{ flexBasis: '100%', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                        <p className="label" style={{ marginBottom: '0.5rem' }}>Question Breakdown</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                            {sub.answers.map(ans => {
                                                const qInfo = test.questions.find(qu => qu.id === ans.questionId);
                                                const isFullPoints = ans.pointsEarned === (qInfo?.points ?? 0);
                                                return (
                                                    <div key={ans.questionId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                                        {isFullPoints ? <CheckCircle2 size={13} style={{ color: 'var(--success)', flexShrink: 0 }} /> : <XCircle size={13} style={{ color: 'var(--warning)', flexShrink: 0 }} />}
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <p className="t-small" style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qInfo?.title || 'Unknown'}</p>
                                                            <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{ans.pointsEarned} pts</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    {sub.integrityEvents.length > 0 && (
                                        <div style={{ flexBasis: '100%', marginTop: '0.25rem' }}>
                                            <p className="label" style={{ marginBottom: '0.5rem' }}>Integrity Events</p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                {sub.integrityEvents.map((event, index) => (
                                                    <div key={`${sub.id}-event-${index}`} style={{ padding: '0.625rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                                        <p className="t-small" style={{ color: 'var(--text)', fontWeight: 700 }}>{event.type}</p>
                                                        <p className="t-small" style={{ color: 'var(--text-muted)' }}>{event.message}</p>
                                                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: '0.25rem' }}>
                                                            {event.occurredAt || event.timestamp}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};

export default AdminTestResults;
