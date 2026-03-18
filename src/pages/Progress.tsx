import React from 'react';
import { useResults } from '../context/ResultContext';
import { useAuth } from '../context/AuthContext';
import { useTests } from '../context/TestContext';
import Navbar from '../components/Layout/Navbar';
import { ShieldCheck, Calendar, Activity, CheckCircle2, ChevronRight, Hash } from 'lucide-react';

const Progress: React.FC = () => {
    const { user } = useAuth();
    const { getStudentSubmissions } = useResults();
    const { getTest } = useTests();

    if (!user) return null;

    const mySubmissions = getStudentSubmissions(user.id).sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    const averageScore = mySubmissions.length > 0
        ? mySubmissions.reduce((a, b) => a + (b.score / b.totalPoints) * 100, 0) / mySubmissions.length
        : 0;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar activeTab="progress" />

            <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
                <section className="anim-fade-up" style={{ marginBottom: '2rem' }}>
                    <h1 className="t-h1" style={{ marginBottom: '0.75rem' }}>My Progress</h1>
                    <p className="t-body" style={{ color: 'var(--text-muted)' }}>Review your past assessments and performance analytics.</p>
                </section>

                {/* Stats */}
                <div className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '2.5rem' }}>
                    {[
                        { icon: CheckCircle2, label: 'Assessments Done', value: mySubmissions.length },
                        { icon: Activity, label: 'Average Score', value: `${averageScore.toFixed(0)}%` },
                        { icon: ShieldCheck, label: 'Avg. Integrity', value: mySubmissions.length ? `${Math.round(mySubmissions.reduce((a, b) => a + b.integrityScore, 0) / mySubmissions.length)}%` : '—' },
                    ].map(({ icon: Icon, label, value }, i) => (
                        <div key={i} className="card hover-antigravity" style={{ padding: '1rem 1.25rem', display: 'flex', gap: '0.875rem', alignItems: 'center' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon size={16} style={{ color: 'var(--text-2)' }} />
                            </div>
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.1rem' }}>{label}</p>
                                <p style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1 }}>{value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Submissions List */}
                <section className="anim-fade-up">
                    <p className="label" style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Attempt History</p>
                    {mySubmissions.length === 0 ? (
                        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <Hash size={48} className="antigravity" style={{ margin: '0 auto 1rem', color: 'var(--accent)', opacity: 0.8 }} />
                            <p className="t-h3" style={{ marginBottom: '0.5rem' }}>No history yet.</p>
                            <p className="t-body">Take an assessment from your dashboard to see progress here.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {mySubmissions.map((sub) => {
                                const percentage = (sub.score / sub.totalPoints) * 100;
                                let colorClass = 'badge-neutral';
                                if (percentage >= 80) colorClass = 'badge-success';
                                else if (percentage < 50) colorClass = 'badge-danger';
                                else colorClass = 'badge-warning';

                                const test = getTest(sub.testId);

                                return (
                                    <div key={sub.id} className="card hover-antigravity" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                                                <span className="t-h3" style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{test?.title || 'Unknown Assessment'}</span>
                                                <span className={`badge ${colorClass}`}>{sub.score} / {sub.totalPoints} pts</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                                <span className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Calendar size={12} /> {new Date(sub.submittedAt).toLocaleDateString()}</span>
                                                <span className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ShieldCheck size={12} /> {sub.integrityScore}% integrity</span>
                                            </div>
                                        </div>
                                        <div>
                                            <ChevronRight size={18} style={{ color: 'var(--border-strong)' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};

export default Progress;
