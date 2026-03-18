import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Search, Users, Award, ShieldAlert, AlertTriangle } from 'lucide-react';
import Navbar from '../../components/Layout/Navbar';
import { useResults } from '../../context/ResultContext';
import { useTests } from '../../context/TestContext';
import type { Submission } from '../../context/ResultContext';

// ── helpers ──────────────────────────────────────────────────────────────────

const countViolation = (sub: Submission, type: string) =>
    sub.integrityEvents.filter(e => e.type === type).length;

interface Row {
    studentName: string;
    testTitle: string;
    testId: string;
    score: number;
    totalPoints: number;
    scorePct: string;
    integrityScore: number;
    tabSwitches: number;
    fullscreenExits: number;
    focusLost: number;
    totalFlags: number;
    submittedAt: string;
    sub: Submission;
}

const buildRows = (submissions: Submission[], getTest: (id: string) => any): Row[] =>
    submissions.map(sub => {
        const test = getTest(sub.testId);
        const tabSwitches = countViolation(sub, 'TAB_SWITCH');
        const fullscreenExits = countViolation(sub, 'FULLSCREEN_EXIT');
        const focusLost = countViolation(sub, 'WINDOW_FOCUS_LOST');
        return {
            studentName: sub.studentName,
            testTitle: test?.title ?? sub.testId,
            testId: sub.testId,
            score: sub.score,
            totalPoints: sub.totalPoints,
            scorePct: sub.totalPoints > 0 ? `${((sub.score / sub.totalPoints) * 100).toFixed(1)}%` : '—',
            integrityScore: sub.integrityScore,
            tabSwitches,
            fullscreenExits,
            focusLost,
            totalFlags: sub.violationsCount,
            submittedAt: new Date(sub.submittedAt).toLocaleString(),
            sub,
        };
    });

// ── Excel download ─────────────────────────────────────────────────────────

const downloadExcel = (rows: Row[]) => {
    const headers = [
        'Student Name', 'Test', 'Score', 'Total Points', 'Score %',
        'Integrity %', 'Tab Switches', 'Fullscreen Exits', 'Window Focus Lost',
        'Total Flags', 'Submitted At',
    ];

    const escapeCell = (v: string | number) => {
        const s = String(v);
        return s.includes('<') || s.includes('>') || s.includes('&')
            ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            : s;
    };

    const trs = [
        `<tr>${headers.map(h => `<th style="background:#1a1a1a;color:#fff;font-weight:bold">${escapeCell(h)}</th>`).join('')}</tr>`,
        ...rows.map(r => `<tr>
            <td>${escapeCell(r.studentName)}</td>
            <td>${escapeCell(r.testTitle)}</td>
            <td>${r.score}</td>
            <td>${r.totalPoints}</td>
            <td>${escapeCell(r.scorePct)}</td>
            <td>${r.integrityScore}</td>
            <td>${r.tabSwitches}</td>
            <td>${r.fullscreenExits}</td>
            <td>${r.focusLost}</td>
            <td>${r.totalFlags}</td>
            <td>${escapeCell(r.submittedAt)}</td>
        </tr>`),
    ].join('');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:x="urn:schemas-microsoft-com:office:excel"
        xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8">
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
        <x:ExcelWorksheet><x:Name>Students</x:Name>
        <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        </head><body><table border="1">${trs}</table></body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etester-students-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
};

// ── Component ─────────────────────────────────────────────────────────────────

const SORT_KEYS = ['studentName', 'testTitle', 'score', 'scorePct', 'integrityScore', 'tabSwitches', 'totalFlags', 'submittedAt'] as const;
type SortKey = typeof SORT_KEYS[number];

const AdminStudents: React.FC = () => {
    const navigate = useNavigate();
    const { submissions, loading } = useResults();
    const { getTest } = useTests();

    const [search, setSearch] = useState('');
    const [filterTest, setFilterTest] = useState('all');
    const [sortKey, setSortKey] = useState<SortKey>('submittedAt');
    const [sortAsc, setSortAsc] = useState(false);

    const allRows = useMemo(() => buildRows(submissions, getTest), [submissions, getTest]);

    const uniqueTests = useMemo(() => {
        const seen = new Map<string, string>();
        allRows.forEach(r => seen.set(r.testId, r.testTitle));
        return Array.from(seen.entries()).map(([id, title]) => ({ id, title }));
    }, [allRows]);

    const filtered = useMemo(() => {
        let rows = allRows;
        if (filterTest !== 'all') rows = rows.filter(r => r.testId === filterTest);
        if (search.trim()) {
            const q = search.toLowerCase();
            rows = rows.filter(r => r.studentName.toLowerCase().includes(q) || r.testTitle.toLowerCase().includes(q));
        }
        return [...rows].sort((a, b) => {
            const av = a[sortKey as keyof Row] as string | number;
            const bv = b[sortKey as keyof Row] as string | number;
            const cmp = typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av).localeCompare(String(bv));
            return sortAsc ? cmp : -cmp;
        });
    }, [allRows, search, filterTest, sortKey, sortAsc]);

    const handleSort = (key: SortKey) => {
        if (key === sortKey) setSortAsc(p => !p);
        else { setSortKey(key); setSortAsc(false); }
    };

    const SortIcon = ({ k }: { k: SortKey }) => (
        <span style={{ fontSize: '10px', color: sortKey === k ? 'var(--accent)' : 'var(--border-strong)', marginLeft: '4px' }}>
            {sortKey === k ? (sortAsc ? '↑' : '↓') : '↕'}
        </span>
    );

    const avgIntegrity = filtered.length > 0
        ? Math.round(filtered.reduce((s, r) => s + r.integrityScore, 0) / filtered.length)
        : 0;
    const totalFlags = filtered.reduce((s, r) => s + r.totalFlags, 0);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar />

            {/* Sub-header */}
            <header style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: '56px', zIndex: 90, background: 'var(--bg)' }}>
                <div className="container" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => navigate('/admin')} style={{ gap: '0.3rem' }}>
                        <ArrowLeft size={14} /> Dashboard
                    </button>
                    <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={15} style={{ color: 'var(--accent)' }} />
                        <span className="t-h3" style={{ fontSize: '0.9rem' }}>All Students</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    <button
                        className="btn btn-sm btn-primary hover-glow"
                        style={{ gap: '0.375rem' }}
                        onClick={() => downloadExcel(filtered)}
                        disabled={filtered.length === 0}
                    >
                        <Download size={13} /> Download Excel
                    </button>
                </div>
            </header>

            <main className="container" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>

                {/* Stats */}
                <div className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.625rem', marginBottom: '1.5rem' }}>
                    {[
                        { icon: Users, label: 'Submissions', value: String(filtered.length) },
                        { icon: Award, label: 'Avg Integrity', value: `${avgIntegrity}%`, warn: avgIntegrity < 80 },
                        { icon: ShieldAlert, label: 'Total Flags', value: String(totalFlags), warn: totalFlags > 0 },
                        { icon: AlertTriangle, label: 'Tab Switches', value: String(filtered.reduce((s, r) => s + r.tabSwitches, 0)), warn: true },
                    ].map(({ icon: Icon, label, value, warn }) => (
                        <div key={label} className="card hover-antigravity" style={{ padding: '0.875rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <div style={{ width: '32px', height: '32px', background: warn && parseInt(value) > 0 ? 'var(--danger-bg)' : 'var(--surface-raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon size={15} style={{ color: warn && parseInt(value) > 0 ? 'var(--danger)' : 'var(--text-2)' }} />
                            </div>
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</p>
                                <p style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-0.03em', color: warn && parseInt(value) > 0 ? 'var(--danger)' : 'var(--text)', lineHeight: 1 }}>{value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="anim-fade-up" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 220px' }}>
                        <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            className="input"
                            style={{ paddingLeft: '2.1rem' }}
                            placeholder="Search student or test…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <select className="input" style={{ width: 'auto', flex: '0 1 220px' }} value={filterTest} onChange={e => setFilterTest(e.target.value)}>
                        <option value="all">All Tests</option>
                        {uniqueTests.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                </div>

                {/* Table */}
                <div className="anim-fade-up" style={{ overflowX: 'auto', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <div style={{ width: '24px', height: '24px', border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
                            <p className="t-body">Loading…</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                            <Users size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                            <p className="t-h3">No submissions found</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'Manrope, sans-serif' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                                    {([
                                        ['studentName', 'Student'],
                                        ['testTitle', 'Test'],
                                        ['score', 'Score'],
                                        ['scorePct', '%'],
                                        ['integrityScore', 'Integrity'],
                                        ['tabSwitches', 'Tab Switches'],
                                        ['totalFlags', 'Fullscreen Exits'],
                                        ['totalFlags', 'Focus Lost'],
                                        ['totalFlags', 'Total Flags'],
                                        ['submittedAt', 'Submitted At'],
                                    ] as [SortKey, string][]).map(([key, label]) => (
                                        <th
                                            key={`${key}-${label}`}
                                            onClick={() => handleSort(key)}
                                            style={{ padding: '0.625rem 0.875rem', textAlign: 'left', fontWeight: 800, fontSize: '10px', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
                                        >
                                            {label}<SortIcon k={key} />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r, i) => {
                                    const flagged = r.totalFlags > 0;
                                    return (
                                        <tr
                                            key={r.sub.id}
                                            style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 1 ? 'var(--surface)' : 'transparent', cursor: 'pointer' }}
                                            onClick={() => navigate(`/admin/test/${r.testId}/results`)}
                                        >
                                            <td style={{ padding: '0.75rem 0.875rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.studentName}</td>
                                            <td style={{ padding: '0.75rem 0.875rem', color: 'var(--text-2)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.testTitle}</td>
                                            <td style={{ padding: '0.75rem 0.875rem', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--text)' }}>
                                                {r.score} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {r.totalPoints}</span>
                                            </td>
                                            <td style={{ padding: '0.75rem 0.875rem', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: r.sub.totalPoints > 0 && (r.sub.score / r.sub.totalPoints) >= 0.5 ? 'var(--success)' : 'var(--danger)' }}>
                                                {r.scorePct}
                                            </td>
                                            <td style={{ padding: '0.75rem 0.875rem' }}>
                                                <span style={{ fontWeight: 700, color: r.integrityScore < 80 ? 'var(--danger)' : 'var(--success)' }}>{r.integrityScore}%</span>
                                            </td>
                                            <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center' }}>
                                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: r.tabSwitches > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{r.tabSwitches}</span>
                                            </td>
                                            <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center' }}>
                                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: r.fullscreenExits > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{r.fullscreenExits}</span>
                                            </td>
                                            <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center' }}>
                                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: r.focusLost > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{r.focusLost}</span>
                                            </td>
                                            <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center' }}>
                                                {flagged
                                                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 700, color: 'var(--danger)' }}><AlertTriangle size={11} />{r.totalFlags}</span>
                                                    : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                                            </td>
                                            <td style={{ padding: '0.75rem 0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{r.submittedAt}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                    {filtered.length} row{filtered.length !== 1 ? 's' : ''}
                    {filtered.length !== submissions.length ? ` (filtered from ${submissions.length})` : ''}
                    &nbsp;&mdash; Click any row to view full test results. Click a column header to sort.
                </p>
            </main>

            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
};

export default AdminStudents;
