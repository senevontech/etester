import React, { useState } from 'react';
import { useResults } from '../context/ResultContext';
import { useAuth } from '../context/AuthContext';
import { useTests } from '../context/TestContext';
import Navbar from '../components/Layout/Navbar';
import {
    ShieldCheck, Calendar, Activity, CheckCircle2, Hash,
    AlertTriangle, ChevronDown, ChevronUp, XCircle, Monitor, Eye,
    Award, TrendingUp,
} from 'lucide-react';
import type { Submission } from '../context/ResultContext';
import { QUESTION_CATEGORY_LABELS } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

const countViolation = (sub: Submission, type: string) =>
    sub.integrityEvents.filter(e => e.type === type).length;

const scorePct = (sub: Submission) =>
    sub.totalPoints > 0 ? (sub.score / sub.totalPoints) * 100 : 0;

const pctColor = (pct: number) =>
    pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';

const integrityColor = (score: number) =>
    score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--danger)';

// ── Submission card ───────────────────────────────────────────────────────────

interface SubCardProps {
    sub: Submission;
    testTitle: string;
    questions: { id: string; title: string; points: number; type: string; category: keyof typeof QUESTION_CATEGORY_LABELS }[];
}

const SubCard: React.FC<SubCardProps> = ({ sub, testTitle, questions }) => {
    const [expanded, setExpanded] = useState(false);
    const pct = scorePct(sub);
    const tabSwitches = countViolation(sub, 'TAB_SWITCH');
    const fullscreenExits = countViolation(sub, 'FULLSCREEN_EXIT');
    const focusLost = countViolation(sub, 'WINDOW_FOCUS_LOST');
    const flagged = sub.violationsCount > 0;

    return (
        <div className="card" style={{ overflow: 'hidden' }}>
            {/* Main row */}
            <div
                style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', flexWrap: 'wrap' }}
                onClick={() => setExpanded(p => !p)}
            >
                {/* Score ring */}
                <div style={{
                    width: '52px', height: '52px', borderRadius: '50%', flexShrink: 0,
                    background: `conic-gradient(${pctColor(pct)} ${pct * 3.6}deg, var(--border) 0deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: pctColor(pct), fontFamily: 'JetBrains Mono, monospace' }}>
                            {Math.round(pct)}%
                        </span>
                    </div>
                </div>

                {/* Title + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="t-h3" style={{ marginBottom: '0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {testTitle}
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Calendar size={11} /> {new Date(sub.submittedAt).toLocaleString()}
                        </span>
                        <span className="t-small" style={{ color: integrityColor(sub.integrityScore), display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <ShieldCheck size={11} /> {sub.integrityScore}% integrity
                        </span>
                        {flagged && (
                            <span className="t-small" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <AlertTriangle size={11} /> {sub.violationsCount} flag{sub.violationsCount !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>

                {/* Score pill */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontWeight: 900, fontSize: '1.1rem', color: pctColor(pct), fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                        {sub.score} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>/ {sub.totalPoints}</span>
                    </p>
                    <p className="t-micro" style={{ color: 'var(--text-muted)', marginTop: '2px' }}>pts</p>
                </div>

                {/* Expand toggle */}
                <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>

                    {/* Integrity metrics row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0', borderBottom: '1px solid var(--border)' }}>
                        {[
                            { icon: Monitor, label: 'Tab Switches', value: tabSwitches, bad: tabSwitches > 0 },
                            { icon: Eye, label: 'Fullscreen Exits', value: fullscreenExits, bad: fullscreenExits > 0 },
                            { icon: Activity, label: 'Focus Lost', value: focusLost, bad: focusLost > 0 },
                            { icon: AlertTriangle, label: 'Total Flags', value: sub.violationsCount, bad: sub.violationsCount > 0 },
                        ].map(({ icon: Icon, label, value, bad }) => (
                            <div key={label} style={{ padding: '0.75rem 1rem', borderRight: '1px solid var(--border)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <Icon size={13} style={{ color: bad && value > 0 ? 'var(--danger)' : 'var(--text-muted)', flexShrink: 0 }} />
                                <div>
                                    <p style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1, marginBottom: '2px' }}>{label}</p>
                                    <p style={{ fontWeight: 900, fontSize: '1rem', color: bad && value > 0 ? 'var(--danger)' : 'var(--text)', lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>{value}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Question breakdown */}
                    {questions.length > 0 && (
                        <div style={{ padding: '1rem 1.25rem' }}>
                            <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.625rem' }}>Question Breakdown</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                {sub.answers.map(ans => {
                                    const q = questions.find(x => x.id === ans.questionId);
                                    const full = ans.pointsEarned === (q?.points ?? 0);
                                    const partial = !full && ans.pointsEarned > 0;
                                    return (
                                        <div key={ans.questionId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.625rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                            {full
                                                ? <CheckCircle2 size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                                : partial
                                                    ? <Activity size={13} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                                                    : <XCircle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <p className="t-small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>
                                                    {q?.title ?? 'Unknown'}
                                                </p>
                                                <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                                                    {ans.pointsEarned} / {q?.points ?? '?'} pts
                                                    <span style={{ marginLeft: '0.4rem', color: 'var(--text-placeholder)' }}>
                                                        [{q ? QUESTION_CATEGORY_LABELS[q.category] : ans.type}]
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Integrity events */}
                    {sub.integrityEvents.length > 0 && (
                        <div style={{ padding: '0 1.25rem 1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                            <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.625rem' }}>Integrity Event Log</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: '220px', overflowY: 'auto' }}>
                                {sub.integrityEvents.map((ev, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', alignItems: 'flex-start' }}>
                                        <AlertTriangle size={11} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
                                        <div>
                                            <p style={{ fontSize: '10px', fontWeight: 800, color: 'var(--danger)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{ev.type.replace(/_/g, ' ')}</p>
                                            <p className="t-small" style={{ color: 'var(--text-2)' }}>{ev.message}</p>
                                            <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: '1px' }}>{ev.occurredAt || ev.timestamp}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Main page ─────────────────────────────────────────────────────────────────

const Progress: React.FC = () => {
    const { user } = useAuth();
    const { getStudentSubmissions } = useResults();
    const { getTest } = useTests();

    if (!user) return null;

    const mySubmissions = getStudentSubmissions(user.id).sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );

    const avgScore = mySubmissions.length > 0
        ? mySubmissions.reduce((a, b) => a + scorePct(b), 0) / mySubmissions.length
        : 0;
    const avgIntegrity = mySubmissions.length > 0
        ? mySubmissions.reduce((a, b) => a + b.integrityScore, 0) / mySubmissions.length
        : 0;
    const bestPct = mySubmissions.length > 0
        ? Math.max(...mySubmissions.map(scorePct))
        : 0;
    const totalFlags = mySubmissions.reduce((a, b) => a + b.violationsCount, 0);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar activeTab="progress" />

            <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>

                {/* Header */}
                <section className="anim-fade-up" style={{ marginBottom: '2rem' }}>
                    <h1 className="t-h1" style={{ marginBottom: '0.4rem' }}>My Progress</h1>
                    <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                        Your full assessment history, scores, and integrity report.
                    </p>
                </section>

                {/* Stats */}
                <div className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.625rem', marginBottom: '2rem' }}>
                    {[
                        { icon: CheckCircle2, label: 'Tests Taken', value: String(mySubmissions.length) },
                        { icon: TrendingUp, label: 'Avg Score', value: `${avgScore.toFixed(0)}%` },
                        { icon: Award, label: 'Best Score', value: mySubmissions.length ? `${Math.round(bestPct)}%` : '—' },
                        { icon: ShieldCheck, label: 'Avg Integrity', value: mySubmissions.length ? `${Math.round(avgIntegrity)}%` : '—', warn: avgIntegrity < 80 && mySubmissions.length > 0 },
                        { icon: AlertTriangle, label: 'Total Flags', value: String(totalFlags), warn: totalFlags > 0 },
                    ].map(({ icon: Icon, label, value, warn }) => (
                        <div key={label} className="card hover-antigravity" style={{ padding: '0.875rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <div style={{ width: '32px', height: '32px', background: warn ? 'var(--danger-bg)' : 'var(--surface-raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon size={15} style={{ color: warn ? 'var(--danger)' : 'var(--text-2)' }} />
                            </div>
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</p>
                                <p style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-0.03em', color: warn ? 'var(--danger)' : 'var(--text)', lineHeight: 1 }}>{value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Score bar chart */}
                {mySubmissions.length > 1 && (
                    <div className="card anim-fade-up" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                        <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Score History</p>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px' }}>
                            {[...mySubmissions].reverse().map((sub) => {
                                const pct = scorePct(sub);
                                const test = getTest(sub.testId);
                                return (
                                    <div key={sub.id} title={`${test?.title ?? 'Test'}: ${Math.round(pct)}%`}
                                        style={{ flex: 1, minWidth: '8px', maxWidth: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                        <div style={{
                                            width: '100%', height: `${Math.max(4, pct * 0.76)}px`,
                                            background: pctColor(pct), borderRadius: '3px 3px 0 0',
                                            transition: 'height 0.3s ease',
                                        }} />
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ height: '1px', background: 'var(--border)', marginTop: '4px' }} />
                        <p className="t-micro" style={{ color: 'var(--text-muted)', marginTop: '6px' }}>
                            Each bar = one submission (oldest → newest) · Hover for details
                        </p>
                    </div>
                )}

                {/* Attempt History */}
                <section className="anim-fade-up">
                    <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        Attempt History &mdash; {mySubmissions.length} submission{mySubmissions.length !== 1 ? 's' : ''}
                    </p>

                    {mySubmissions.length === 0 ? (
                        <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <Hash size={48} className="antigravity" style={{ margin: '0 auto 1rem', color: 'var(--accent)', opacity: 0.8 }} />
                            <p className="t-h3" style={{ marginBottom: '0.5rem' }}>No history yet.</p>
                            <p className="t-body">Take an assessment from your dashboard to see progress here.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                            {mySubmissions.map(sub => {
                                const test = getTest(sub.testId);
                                const questions = (test?.questions ?? []).map(q => ({
                                    id: q.id,
                                    title: q.title,
                                    points: q.points,
                                    type: q.type,
                                    category: q.category,
                                }));
                                return (
                                    <SubCard
                                        key={sub.id}
                                        sub={sub}
                                        testTitle={test?.title ?? 'Unknown Assessment'}
                                        questions={questions}
                                    />
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
