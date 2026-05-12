import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Globe, EyeOff, BarChart2, BookOpen, Clock, ChevronRight, Shield, Users, Table2, Activity, AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react';
import RoleShell from '../../components/Layout/RoleShell';
import ConfirmDialog from '../../components/Modals/ConfirmDialog';
import { useTests } from '../../context/TestContext';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import type { Test } from '../../context/TestContext';

// ─── Create Test Modal ────────────────────────────────────────────────────────
interface CreateModalProps { onClose: () => void; onCreate: (id: string) => void; }

const formatSchedule = (value?: string | null) => {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const getScheduleStatus = (test: Test) => {
    const now = Date.now();
    const startMs = test.startAt ? new Date(test.startAt).getTime() : Number.NaN;
    const endMs = test.endAt ? new Date(test.endAt).getTime() : Number.NaN;

    if (!test.startAt || !test.endAt || Number.isNaN(startMs) || Number.isNaN(endMs)) {
        return { label: 'Schedule needed', tone: 'warning' as const };
    }
    if (endMs < now) return { label: 'Ended', tone: 'neutral' as const };
    if (startMs > now) return { label: 'Upcoming', tone: 'neutral' as const };
    return { label: 'Open now', tone: 'success' as const };
};

const parseNegativeMarkValue = (value: string, fallback = 1) => {
    const parsed = Number(value.trim().replace(',', '.'));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0.01, Math.round(parsed * 100) / 100);
};

const CreateModal: React.FC<CreateModalProps> = ({ onClose, onCreate }) => {
    const { createTest } = useTests();
    const { activeOrg } = useOrg();
    const { user } = useAuth();
    const [form, setForm] = useState({ title: '', description: '', duration: 60, startAt: '', endAt: '', tags: '', negativeMarkingEnabled: false, negativeMarkValue: '1', showAnswersAfterExam: false });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showAnswerConfirm, setShowAnswerConfirm] = useState(false);

    const startDate = form.startAt ? new Date(form.startAt) : null;
    const endDate = form.endAt ? new Date(form.endAt) : null;
    const hasInvalidWindow = Boolean(startDate && endDate && endDate.getTime() <= startDate.getTime());
    const estimatedWindow = startDate && endDate && !hasInvalidWindow
        ? Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000))
        : 0;
    const canSubmit = Boolean(form.title.trim() && form.startAt && form.endAt && !hasInvalidWindow && !loading);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!form.title.trim() || !form.startAt || !form.endAt || !activeOrg?.id || !user?.id) {
            setError('Add a title, exam start, and exam end date/time.');
            return;
        }
        if (hasInvalidWindow) {
            setError('Exam end date and time must be after the start date and time.');
            return;
        }

        setLoading(true);
        const test = await createTest({
            title: form.title.trim(),
            description: form.description.trim(),
            duration: form.duration,
            tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
            orgId: activeOrg.id,
            createdBy: user.id,
            startAt: new Date(form.startAt).toISOString(),
            endAt: new Date(form.endAt).toISOString(),
            negativeMarkingEnabled: form.negativeMarkingEnabled,
            negativeMarkValue: form.negativeMarkingEnabled ? parseNegativeMarkValue(form.negativeMarkValue) : 0,
            showAnswersAfterExam: form.showAnswersAfterExam,
        });
        setLoading(false);
        if (test) onCreate(test.id);
        else setError('Could not create the test. Please check the schedule and try again.');
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', overflowY: 'auto' }}>
            <div className="anim-fade-up" style={{ background: 'var(--bg)', border: '1px solid var(--border)', width: '100%', maxWidth: '480px', boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 className="t-h3">New Test</h2>
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
                    <div>
                        <p className="label" style={{ marginBottom: '0.375rem' }}>Duration (min)</p>
                        <input className="input" type="number" min={5} max={360} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                        <div>
                            <p className="label" style={{ marginBottom: '0.375rem' }}>Starts *</p>
                            <input
                                className="input"
                                type="datetime-local"
                                value={form.startAt}
                                onChange={e => setForm(f => {
                                    const nextStart = e.target.value;
                                    return {
                                        ...f,
                                        startAt: nextStart,
                                        endAt: f.endAt && nextStart && new Date(f.endAt).getTime() <= new Date(nextStart).getTime() ? '' : f.endAt,
                                    };
                                })}
                                required
                            />
                        </div>
                        <div>
                            <p className="label" style={{ marginBottom: '0.375rem' }}>Ends *</p>
                            <input
                                className="input"
                                type="datetime-local"
                                value={form.endAt}
                                min={form.startAt || undefined}
                                onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))}
                                required
                            />
                        </div>
                    </div>
                    {(form.startAt || form.endAt) && (
                        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', padding: '0.75rem', border: `1px solid ${hasInvalidWindow ? 'var(--danger)' : 'var(--border)'}`, background: hasInvalidWindow ? 'var(--danger-bg)' : 'var(--surface-raised)' }}>
                            <CalendarClock size={16} style={{ color: hasInvalidWindow ? 'var(--danger)' : 'var(--text-muted)', marginTop: '2px', flexShrink: 0 }} />
                            <div>
                                <p className="t-small" style={{ fontWeight: 800, color: hasInvalidWindow ? 'var(--danger)' : 'var(--text)' }}>
                                    {form.startAt ? formatSchedule(new Date(form.startAt).toISOString()) : 'Choose a start time'} to {form.endAt ? formatSchedule(new Date(form.endAt).toISOString()) : 'choose an end time'}
                                </p>
                                {!hasInvalidWindow && estimatedWindow > 0 && (
                                    <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                        Exam window: {estimatedWindow} min. Test duration: {form.duration} min.
                                    </p>
                                )}
                                {hasInvalidWindow && (
                                    <p className="t-small" style={{ color: 'var(--danger)', marginTop: '0.2rem' }}>End time must be after start time.</p>
                                )}
                            </div>
                        </div>
                    )}
                    <div>
                        <p className="label" style={{ marginBottom: '0.375rem' }}>Tags (comma-separated)</p>
                        <input className="input" placeholder="e.g. SQL, Database, Backend" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
                    </div>
                    <div style={{ padding: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <div>
                                <p className="label" style={{ marginBottom: '0.25rem' }}>Negative Marking</p>
                                <p className="t-small" style={{ color: 'var(--text-muted)', lineHeight: 1.45 }}>
                                    Enable deductions for wrong attempted answers.
                                </p>
                            </div>
                            <button
                                type="button"
                                className={`btn btn-sm ${form.negativeMarkingEnabled ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => setForm(f => ({ ...f, negativeMarkingEnabled: !f.negativeMarkingEnabled }))}
                            >
                                {form.negativeMarkingEnabled ? 'Disable' : 'Enable'}
                            </button>
                        </div>
                        {form.negativeMarkingEnabled && (
                            <div style={{ marginTop: '0.75rem' }}>
                                <p className="label" style={{ marginBottom: '0.375rem' }}>Deduct points per wrong answer</p>
                                <input
                                    className="input"
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]*[.,]?[0-9]*"
                                    value={form.negativeMarkValue}
                                    onChange={(e) => setForm(f => ({ ...f, negativeMarkValue: e.target.value }))}
                                />
                            </div>
                        )}
                    </div>
                    <div style={{ padding: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <div>
                                <p className="label" style={{ marginBottom: '0.25rem' }}>Show Answers After Exam</p>
                                <p className="t-small" style={{ color: 'var(--text-muted)', lineHeight: 1.45 }}>
                                    Let students review correct answers after they submit.
                                </p>
                            </div>
                            <button
                                type="button"
                                className={`btn btn-sm ${form.showAnswersAfterExam ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => {
                                    if (!form.showAnswersAfterExam) {
                                        setShowAnswerConfirm(true);
                                        return;
                                    }
                                    setForm(f => ({ ...f, showAnswersAfterExam: !f.showAnswersAfterExam }));
                                }}
                            >
                                {form.showAnswersAfterExam ? 'Disable' : 'Enable'}
                            </button>
                        </div>
                    </div>
                    {error && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <p className="t-small" style={{ fontWeight: 800 }}>{error}</p>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                        <button type="button" className="btn btn-md btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-md btn-primary hover-glow" style={{ flex: 1 }} disabled={!canSubmit}>
                            {loading ? 'Creating…' : 'Create & Edit'}
                        </button>
                    </div>
                </form>
            </div>
            <ConfirmDialog
                open={showAnswerConfirm}
                title="Show Answers After Exam?"
                message="Students will be able to review the correct answers after they submit this exam. They still cannot see answers before or during the exam."
                confirmLabel="Enable"
                onClose={() => setShowAnswerConfirm(false)}
                onConfirm={() => {
                    setForm(f => ({ ...f, showAnswersAfterExam: true }));
                    setShowAnswerConfirm(false);
                }}
            />
        </div>
    );
};

// ─── Test Row ─────────────────────────────────────────────────────────────────
interface TestRowProps { test: Test; onEdit: () => void; onDetails: () => void; onDelete: () => void; onTogglePublish: () => void; onToggleAnswers: () => void; }

const TestRow: React.FC<TestRowProps> = ({ test, onEdit, onDetails, onDelete, onTogglePublish, onToggleAnswers }) => (
    <div className="card hover-antigravity" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }} onClick={onEdit}>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                <span className="t-h3" style={{ color: 'var(--text)' }}>{test.title}</span>
                <span className={`badge ${test.published ? 'badge-solid' : 'badge-neutral'}`}>{test.published ? 'Published' : 'Draft'}</span>
                <span className="badge badge-neutral" style={{ color: getScheduleStatus(test).tone === 'success' ? 'var(--success)' : getScheduleStatus(test).tone === 'warning' ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {getScheduleStatus(test).label}
                </span>
                {test.negativeMarkingEnabled && (
                    <span className="badge badge-neutral" style={{ color: 'var(--danger)' }}>
                        -{test.negativeMarkValue || 1} negative
                    </span>
                )}
                {test.showAnswersAfterExam && (
                    <span className="badge badge-neutral" style={{ color: 'var(--success)' }}>
                        Answers after exam
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><BookOpen size={12} />{test.questions.length} questions</span>
                <span className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={12} />{test.duration} min</span>
                <span className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><CalendarClock size={12} />{formatSchedule(test.startAt)}</span>
                <span className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><CalendarClock size={12} />{formatSchedule(test.endAt)}</span>
            </div>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onTogglePublish} title={test.published ? 'Unpublish' : 'Publish'} style={{ gap: '0.3rem' }}>
                {test.published ? <EyeOff size={13} /> : <Globe size={13} />}
                <span className="desktop-only">{test.published ? 'Unpublish' : 'Publish'}</span>
            </button>
            <button type="button" className={`btn btn-sm ${test.showAnswersAfterExam ? 'btn-primary' : 'btn-outline'}`} onClick={onToggleAnswers} title="Show answers after exam" style={{ gap: '0.3rem' }}>
                <CheckCircle2 size={13} />
                <span className="desktop-only">Answers</span>
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onDelete} style={{ color: 'var(--danger)' }} title="Delete"><Trash2 size={13} /></button>
            <button type="button" className="btn btn-sm btn-outline" onClick={onDetails} style={{ gap: '0.375rem' }}><BarChart2 size={12} /> Details</button>
            <button type="button" className="btn btn-sm btn-outline" onClick={onEdit} style={{ gap: '0.375rem' }}><Edit2 size={12} /> Edit</button>
        </div>
        <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </div>
);

// ─── Main SubAdmin Dashboard ─────────────────────────────────────────────────────
const SubAdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { tests, deleteTest, publishTest, unpublishTest, updateTest, loading } = useTests();
    const { activeOrg } = useOrg();
    const { user } = useAuth();
    const basePath = user?.role === 'admin' ? '/admin' : '/subadmin';
    const [showCreate, setShowCreate] = useState(false);
    const [publishError, setPublishError] = useState<string | null>(null);
    const [answerConfirmTest, setAnswerConfirmTest] = useState<Test | null>(null);

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

    const handleToggleAnswers = async (test: Test) => {
        setPublishError(null);
        const nextEnabled = !test.showAnswersAfterExam;
        if (nextEnabled) {
            setAnswerConfirmTest(test);
            return;
        }

        try {
            await updateTest(test.id, { showAnswersAfterExam: nextEnabled });
        } catch (error) {
            setPublishError(error instanceof Error ? error.message : 'Could not update answer reveal.');
        }
    };

    const confirmEnableAnswers = async () => {
        if (!answerConfirmTest) return;
        const target = answerConfirmTest;
        setAnswerConfirmTest(null);
        try {
            await updateTest(target.id, { showAnswersAfterExam: true });
        } catch (error) {
            setPublishError(error instanceof Error ? error.message : 'Could not update answer reveal.');
        }
    };

    const published = tests.filter(t => t.published).length;
    const totalQ = tests.reduce((acc, t) => acc + (t.questions?.length ?? 0), 0);

    return (
        <RoleShell role={user?.role === 'admin' ? 'admin' : 'subadmin'} activeKey="tests">
            <main className="container" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>

                {/* Header */}
                <div className="anim-fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <div style={{ width: '24px', height: '24px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Shield size={13} color="var(--accent-fg)" strokeWidth={2.5} />
                            </div>
                            <span className="t-micro" style={{ color: 'var(--text-muted)' }}>{activeOrg?.name ?? 'Sub Admin Panel'}</span>
                        </div>
                        <h1 className="t-h1">Assessments</h1>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-md btn-outline" style={{ gap: '0.5rem' }} onClick={() => navigate(`${basePath}/monitor`)}>
                            <Activity size={15} /> Live Monitor
                        </button>
                        <button className="btn btn-md btn-outline" style={{ gap: '0.5rem' }} onClick={() => navigate(`${basePath}/students`)}>
                            <Table2 size={15} /> Students
                        </button>
                        <button className="btn btn-md btn-outline" style={{ gap: '0.5rem' }} onClick={() => navigate(`${basePath}/groups`)}>
                            <Users size={15} /> Groups
                        </button>
                        <button className="btn btn-md btn-primary hover-glow" style={{ gap: '0.5rem' }} onClick={() => setShowCreate(true)}>
                            <Plus size={16} /> New Test
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.625rem', marginBottom: '1.5rem' }}>
                    {[
                        { icon: Activity, label: 'Live Sessions', value: 'Live', onClick: () => navigate(`${basePath}/monitor`), color: 'var(--accent)' },
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
                            <p className="t-body" style={{ margin: '0.5rem 0 1.5rem' }}>Create your first test to get started.</p>
                            <button className="btn btn-md btn-primary hover-glow" onClick={() => setShowCreate(true)}>New Test</button>
                        </div>
                    ) : (
                        tests.map(test => (
                            <TestRow
                                key={test.id}
                                test={test}
                                onEdit={() => navigate(`${basePath}/test/${test.id}`)}
                                onDetails={() => navigate(`${basePath}/test/${test.id}/results`)}
                                onDelete={() => { if (confirm(`Delete "${test.title}"?`)) deleteTest(test.id); }}
                                onTogglePublish={() => handleTogglePublish(test)}
                                onToggleAnswers={() => handleToggleAnswers(test)}
                            />
                        ))
                    )}
                </div>
            </main>

            {showCreate && (
                <CreateModal
                    onClose={() => setShowCreate(false)}
                    onCreate={(id) => { setShowCreate(false); navigate(`${basePath}/test/${id}`); }}
                />
            )}
            <ConfirmDialog
                open={Boolean(answerConfirmTest)}
                title="Show Answers After Exam?"
                message={`Students will be able to review correct answers for "${answerConfirmTest?.title ?? 'this exam'}" after submission. Answers remain hidden before and during the exam.`}
                confirmLabel="Enable"
                onClose={() => setAnswerConfirmTest(null)}
                onConfirm={() => void confirmEnableAnswers()}
            />

            <style>{`@media(max-width:767px){.desktop-only{display:none}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </RoleShell>
    );
};

export default SubAdminDashboard;
