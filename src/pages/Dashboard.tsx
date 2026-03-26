import React, { useState } from 'react';
import Navbar from '../components/Layout/Navbar';
import TestCard from '../components/Cards/TestCard';
import { Search, SlidersHorizontal, ShieldCheck, BarChart2, Award, Shield } from 'lucide-react';
import { useTests } from '../context/TestContext';
import { useOrg } from '../context/OrgContext';
import { useResults } from '../context/ResultContext';
import { useAuth } from '../context/AuthContext';
import { Difficulty } from '../types';

type Filter = 'All' | Difficulty;

const Dashboard: React.FC = () => {
    const { tests } = useTests();
    const { activeOrg } = useOrg();
    const { user } = useAuth();
    const { getStudentSubmissions } = useResults();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('All');
    const [activeTab, setActiveTab] = useState<'Active' | 'Upcoming' | 'Completed'>('Active');

    const mySubmissions = user ? getStudentSubmissions(user.id) : [];
    const completedTestIds = new Set(mySubmissions.map(s => s.testId));

    const avgScore = mySubmissions.length > 0
        ? mySubmissions.reduce((a, b) => a + (b.totalPoints > 0 ? (b.score / b.totalPoints) * 100 : 0), 0) / mySubmissions.length
        : 0;
    const avgIntegrity = mySubmissions.length > 0
        ? mySubmissions.reduce((a, b) => a + b.integrityScore, 0) / mySubmissions.length
        : 0;

    const STATS = [
        { icon: ShieldCheck, label: 'Avg Integrity', value: mySubmissions.length ? `${Math.round(avgIntegrity)}%` : '—', sub: 'All time' },
        { icon: Award, label: 'Avg Score', value: mySubmissions.length ? `${avgScore.toFixed(0)}%` : '—', sub: 'Across tests' },
        { icon: BarChart2, label: 'Completed', value: String(mySubmissions.length), sub: 'Assessments' },
    ];

    // Categorize tests
    const now = new Date();
    const published = tests.filter(t => t.published);
    
    const activeTests = published.filter(t => !completedTestIds.has(t.id) && (!t.startAt || new Date(t.startAt) <= now));
    const upcomingTests = published.filter(t => !completedTestIds.has(t.id) && t.startAt && new Date(t.startAt) > now);
    const completedTests = published.filter(t => completedTestIds.has(t.id));

    const getVisibleTests = () => {
        let list = activeTests;
        if (activeTab === 'Upcoming') list = upcomingTests;
        if (activeTab === 'Completed') list = completedTests;

        return list.filter(t => {
            const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
                t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
            const matchFilter = filter === 'All' || t.difficulty === filter;
            return matchSearch && matchFilter;
        });
    };

    const visible = getVisibleTests();

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar activeTab="dashboard" />

            <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>

                {/* ── Hero ────────────────────────────────────────────────── */}
                <section className="anim-fade-up" style={{ marginBottom: '2.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <span className="badge badge-solid"><ShieldCheck size={10} /> Proctored</span>
                    </div>
                    <h1 className="t-hero" style={{ color: 'var(--text)', marginBottom: '0.75rem' }}>
                        {activeOrg?.name ?? 'Your Assessment Hub'}
                    </h1>
                    <p className="t-body" style={{ maxWidth: '480px' }}>
                        High-stakes certification tests with enforced integrity monitoring,
                        real-time proctoring, and instant results.
                    </p>
                </section>

                {/* ── Stats ───────────────────────────────────────────────── */}
                <section className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '2.5rem' }}>
                    {STATS.map(({ icon: Icon, label, value, sub }) => (
                        <div key={label} className="card hover-antigravity" style={{ padding: '1rem 1.25rem', display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--surface-raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon size={16} style={{ color: 'var(--text-2)' }} />
                            </div>
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{label}</p>
                                <p style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--text)', marginBottom: '0.25rem' }}>{value}</p>
                                <p className="t-small" style={{ color: 'var(--text-muted)' }}>{sub}</p>
                            </div>
                        </div>
                    ))}
                </section>

                {/* ── Search & Filters ────────────────────────────────────── */}
                <section className="anim-fade-up" style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-placeholder)', pointerEvents: 'none' }} />
                        <input id="search-input" type="text" className="input" placeholder="Search assessments by name or tag…"
                            style={{ paddingLeft: '2.5rem' }} value={search}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} />
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: '10px', padding: '0.25rem', border: '1px solid var(--border)' }}>
                            {(['Active', 'Upcoming', 'Completed'] as const).map(tab => (
                                <button key={tab} onClick={() => setActiveTab(tab)}
                                    className="btn btn-sm"
                                    style={{ 
                                        borderRadius: '8px',
                                        background: activeTab === tab ? 'var(--surface-raised)' : 'transparent',
                                        color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                                        border: 'none',
                                        boxShadow: activeTab === tab ? 'var(--shadow-sm)' : 'none',
                                        padding: '0.5rem 1rem'
                                    }}>
                                    {tab} ({tab === 'Active' ? activeTests.length : tab === 'Upcoming' ? upcomingTests.length : completedTests.length})
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto' }}>
                            {(['All', 'Easy', 'Medium', 'Hard'] as Filter[]).map(f => (
                                <button key={f} onClick={() => setFilter(f)}
                                    className={`btn btn-sm ${filter === f ? 'btn-primary hover-glow' : 'btn-outline'}`}
                                    style={{ flexShrink: 0 }}>{f}</button>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Section heading ─────────────────────────────────────── */}
                <div className="anim-fade-up" style={{ marginBottom: '1rem' }}>
                    <p className="t-micro" style={{ color: 'var(--text-muted)' }}>
                        {visible.length} {activeTab.toLowerCase()} assessment{visible.length !== 1 ? 's' : ''} found
                    </p>
                </div>

                {/* ── Grid ────────────────────────────────────────────────── */}
                {visible.length > 0 ? (
                    <div className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
                        {visible.map(test => <TestCard key={test.id} {...test} date={new Date(test.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} />)}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                        <Shield size={48} className="antigravity" style={{ margin: '0 auto 1rem', color: 'var(--accent)', opacity: 0.8 }} />
                        <p className="t-h3">No {activeTab.toLowerCase()} assessments</p>
                        <p className="t-body" style={{ marginTop: '0.5rem' }}>
                            {activeTab === 'Active' ? 'Check Upcoming or Completed tabs for other tests.' : 'No tests found in this category.'}
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;

