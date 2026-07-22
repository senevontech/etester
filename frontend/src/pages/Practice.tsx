import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { BookOpenCheck, CheckCircle2, Code2, History, Play, RotateCcw, Search, Send, Target } from 'lucide-react';
import Navbar from '../components/Layout/Navbar';
import { useOrg } from '../context/OrgContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../lib/api';
import { executeCode } from '../utils/piston';
import { QUESTION_CATEGORY_LABELS, QUESTION_CATEGORIES, type AnswerPayload, type QuestionCategory, type QuestionType } from '../types';

type PracticeQuestion = {
    id: string;
    test_id: string;
    test_title: string;
    org_id: string;
    type: QuestionType;
    category: QuestionCategory;
    title: string;
    description: string;
    image_url?: string | null;
    points: number;
    options?: string[] | null;
    answer?: number | null;
    accepted_answers?: string[] | null;
    case_sensitive?: boolean;
    numeric_answer?: number | null;
    numeric_tolerance?: number;
    template?: string | null;
    language?: string | null;
    constraints?: string[] | null;
    examples?: { input: string; output: string }[] | null;
    test_cases?: { id?: string; input: string; output: string; hidden: boolean }[] | null;
    test_tags?: string[];
};

type PracticeSession = {
    id: string;
    org_id: string;
    test_id?: string | null;
    category?: string | null;
    answers: AnswerPayload[];
    score: number;
    total_points: number;
    question_count: number;
    completed_at: string;
    org_name?: string;
    test_title?: string;
};

type PracticeResponse = {
    questions: PracticeQuestion[];
    sessions: PracticeSession[];
};

type PracticeSubmitResponse = {
    session: PracticeSession;
    answers: AnswerPayload[];
    questions: PracticeQuestion[];
};

type RunLog = {
    status: 'idle' | 'running' | 'success' | 'error';
    message: string;
};

const CATEGORY_OPTIONS: Array<'all' | QuestionCategory> = ['all', ...QUESTION_CATEGORIES];
const PRACTICE_LIMIT = 20;

const formatDateTime = (value?: string | null) => {
    if (!value) return 'Not available';
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

const percent = (score: number, total: number) => total > 0 ? Math.round((score / total) * 100) : 0;

const createInitialAnswer = (question: PracticeQuestion): AnswerPayload => ({
    questionId: question.id,
    type: question.type,
    pointsEarned: 0,
    code: question.type === 'code' ? question.template ?? '' : undefined,
    language: question.type === 'code' ? question.language ?? 'typescript' : undefined,
    response: question.type === 'text' || question.type === 'numeric' ? '' : undefined,
});

const Practice: React.FC = () => {
    const { activeOrg } = useOrg();
    const { theme } = useTheme();
    const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
    const [sessions, setSessions] = useState<PracticeSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<'all' | QuestionCategory>('all');
    const [activeQuestions, setActiveQuestions] = useState<PracticeQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, AnswerPayload>>({});
    const [startedAt, setStartedAt] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<PracticeSubmitResponse | null>(null);
    const [runLogs, setRunLogs] = useState<Record<string, RunLog>>({});

    const activeOrgId = activeOrg?.id ?? '';

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const query = activeOrgId ? `?orgId=${encodeURIComponent(activeOrgId)}` : '';
                const data = await apiRequest<PracticeResponse>(`/student/practice${query}`);
                if (cancelled) return;
                setQuestions(data.questions ?? []);
                setSessions(data.sessions ?? []);
            } catch (err) {
                if (cancelled) return;
                setQuestions([]);
                setSessions([]);
                setError(err instanceof Error ? err.message : 'Failed to load practice questions.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [activeOrgId]);

    const filteredQuestions = useMemo(() => {
        const q = search.trim().toLowerCase();
        return questions.filter((question) => {
            if (category !== 'all' && question.category !== category) return false;
            if (!q) return true;
            return question.title.toLowerCase().includes(q)
                || question.description.toLowerCase().includes(q)
                || question.test_title.toLowerCase().includes(q)
                || (question.test_tags ?? []).some((tag) => tag.toLowerCase().includes(q));
        });
    }, [category, questions, search]);

    const stats = useMemo(() => {
        const byCategory = QUESTION_CATEGORIES.map((item) => ({
            category: item,
            count: questions.filter((question) => question.category === item).length,
        }));
        const avgScore = sessions.length
            ? Math.round(sessions.reduce((total, session) => total + percent(session.score, session.total_points), 0) / sessions.length)
            : 0;
        return { byCategory, avgScore };
    }, [questions, sessions]);

    const startPractice = () => {
        if (loading) {
            setError('Practice questions are still loading. Please try again in a moment.');
            return;
        }

        const selected = filteredQuestions.slice(0, PRACTICE_LIMIT);
        if (selected.length === 0) {
            setError(
                questions.length === 0
                    ? 'No practice questions are available yet. Ask an admin or subadmin to publish a test and enable Student Practice.'
                    : 'No questions match your current search or category filter.'
            );
            return;
        }

        const initialAnswers = Object.fromEntries(selected.map((question) => [question.id, createInitialAnswer(question)]));
        setActiveQuestions(selected);
        setAnswers(initialAnswers);
        setStartedAt(new Date().toISOString());
        setResult(null);
        setError('');
        setRunLogs({});
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const updateAnswer = (question: PracticeQuestion, patch: Partial<AnswerPayload>) => {
        setAnswers((prev) => ({
            ...prev,
            [question.id]: {
                ...prev[question.id],
                questionId: question.id,
                type: question.type,
                pointsEarned: 0,
                ...patch,
            },
        }));
    };

    const runCode = async (question: PracticeQuestion) => {
        const current = answers[question.id];
        if (!current?.code?.trim()) return;

        setRunLogs((prev) => ({ ...prev, [question.id]: { status: 'running', message: 'Running sample cases...' } }));
        try {
            const run = await executeCode(question.test_id, question.id, current.language ?? question.language ?? 'typescript', current.code);
            const output = run.run.stderr || run.run.stdout || run.run.output || 'No output';
            setRunLogs((prev) => ({
                ...prev,
                [question.id]: {
                    status: run.run.code === 0 ? 'success' : 'error',
                    message: output,
                },
            }));
        } catch (err) {
            setRunLogs((prev) => ({
                ...prev,
                [question.id]: {
                    status: 'error',
                    message: err instanceof Error ? err.message : 'Code execution failed.',
                },
            }));
        }
    };

    const submitPractice = async () => {
        if (activeQuestions.length === 0) return;
        setSubmitting(true);
        setError('');
        try {
            const data = await apiRequest<PracticeSubmitResponse>('/practice/sessions', {
                method: 'POST',
                body: {
                    orgId: activeOrgId,
                    startedAt,
                    answers: activeQuestions.map((question) => answers[question.id] ?? createInitialAnswer(question)),
                },
            });
            setResult(data);
            setSessions((prev) => [data.session, ...prev].slice(0, 12));
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not submit practice session.');
        } finally {
            setSubmitting(false);
        }
    };

    const resetPractice = () => {
        setActiveQuestions([]);
        setAnswers({});
        setResult(null);
        setRunLogs({});
    };

    const resultByQuestion = new Map((result?.answers ?? []).map((answer) => [answer.questionId, answer]));
    const reviewQuestions = result?.questions ?? activeQuestions;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar activeTab="practice" />

            <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
                <section className="anim-fade-up" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <span className="badge badge-solid"><BookOpenCheck size={10} /> Practice</span>
                    </div>
                    <h1 className="t-h1" style={{ marginBottom: '0.45rem' }}>Student Practice</h1>
                    <p className="t-body" style={{ color: 'var(--text-muted)', maxWidth: '640px' }}>
                        Practice questions enabled by your organization. These sessions do not affect official exam scores or proctoring records.
                    </p>
                </section>

                {error && (
                    <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', border: '1px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 800 }}>
                        {error}
                    </div>
                )}

                {result ? (
                    <section className="card anim-fade-up" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                            <div>
                                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Practice Summary</p>
                                <h2 className="t-h1">{result.session.score} / {result.session.total_points}</h2>
                                <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                    {percent(result.session.score, result.session.total_points)}% across {result.session.question_count} question{result.session.question_count === 1 ? '' : 's'}
                                </p>
                            </div>
                            <button className="btn btn-md btn-primary" style={{ gap: '0.45rem' }} onClick={resetPractice}>
                                <RotateCcw size={15} /> New Practice
                            </button>
                        </div>
                    </section>
                ) : activeQuestions.length === 0 && (
                    <section className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        <div className="card" style={{ padding: '1rem' }}>
                            <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Available</p>
                            <p className="t-h1">{questions.length}</p>
                        </div>
                        <div className="card" style={{ padding: '1rem' }}>
                            <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Practice Sessions</p>
                            <p className="t-h1">{sessions.length}</p>
                        </div>
                        <div className="card" style={{ padding: '1rem' }}>
                            <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Average Practice Score</p>
                            <p className="t-h1">{sessions.length ? `${stats.avgScore}%` : '-'}</p>
                        </div>
                    </section>
                )}

                {activeQuestions.length === 0 && !result && (
                    <section className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '1rem', alignItems: 'start' }}>
                        <div>
                            <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px auto', gap: '0.75rem', alignItems: 'center' }}>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={15} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-placeholder)' }} />
                                        <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Search practice questions..." value={search} onChange={(event) => setSearch(event.target.value)} />
                                    </div>
                                    <select className="input" value={category} onChange={(event) => setCategory(event.target.value as 'all' | QuestionCategory)}>
                                        {CATEGORY_OPTIONS.map((item) => (
                                            <option key={item} value={item}>{item === 'all' ? 'All categories' : QUESTION_CATEGORY_LABELS[item]}</option>
                                        ))}
                                    </select>
                                    <button className="btn btn-md btn-primary" style={{ gap: '0.45rem', whiteSpace: 'nowrap' }} onClick={startPractice} disabled={loading}>
                                        <Play size={15} /> {filteredQuestions.length > 0 ? `Start (${Math.min(filteredQuestions.length, PRACTICE_LIMIT)})` : 'Start'}
                                    </button>
                                </div>
                            </div>

                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                                    <div style={{ width: '30px', height: '30px', border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
                                    <p className="t-body">Loading practice questions...</p>
                                </div>
                            ) : filteredQuestions.length > 0 ? (
                                <div style={{ display: 'grid', gap: '0.625rem' }}>
                                    {filteredQuestions.slice(0, 60).map((question) => (
                                        <div key={question.id} className="card hover-antigravity" style={{ padding: '1rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                                                    <span className="badge badge-neutral">{QUESTION_CATEGORY_LABELS[question.category]}</span>
                                                    <span className="badge badge-neutral">{question.points} pts</span>
                                                </div>
                                                <h3 className="t-h3" style={{ overflowWrap: 'anywhere' }}>{question.title}</h3>
                                                <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>{question.test_title}</p>
                                            </div>
                                            {question.type === 'code' ? <Code2 size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} /> : <Target size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                                    <BookOpenCheck size={44} style={{ margin: '0 auto 1rem', color: 'var(--accent)' }} />
                                    <p className="t-h3">No practice questions available</p>
                                    <p className="t-body" style={{ marginTop: '0.4rem' }}>Ask your admin or subadmin to enable Student Practice on a published test.</p>
                                </div>
                            )}
                        </div>

                        <aside style={{ display: 'grid', gap: '0.75rem' }}>
                            <div className="card" style={{ padding: '1rem' }}>
                                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Categories</p>
                                {stats.byCategory.filter((item) => item.count > 0).map((item) => (
                                    <button
                                        key={item.category}
                                        className="hover-surface"
                                        onClick={() => setCategory(item.category)}
                                        style={{ width: '100%', border: '1px solid var(--border)', background: category === item.category ? 'var(--surface-raised)' : 'transparent', padding: '0.55rem 0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', cursor: 'pointer' }}
                                    >
                                        <span className="t-small" style={{ fontWeight: 800, color: 'var(--text)' }}>{QUESTION_CATEGORY_LABELS[item.category]}</span>
                                        <span className="badge badge-neutral">{item.count}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="card" style={{ padding: '1rem' }}>
                                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                    <History size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} /> Recent Sessions
                                </p>
                                {sessions.length > 0 ? sessions.map((session) => (
                                    <div key={session.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                            <p className="t-small" style={{ fontWeight: 900, color: 'var(--text)' }}>{percent(session.score, session.total_points)}%</p>
                                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>{session.score}/{session.total_points}</p>
                                        </div>
                                        <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>{session.question_count} questions - {formatDateTime(session.completed_at)}</p>
                                    </div>
                                )) : (
                                    <p className="t-small" style={{ color: 'var(--text-muted)' }}>No practice sessions yet.</p>
                                )}
                            </div>
                        </aside>
                    </section>
                )}

                {activeQuestions.length > 0 && !result && (
                    <section className="anim-fade-up" style={{ display: 'grid', gap: '0.9rem' }}>
                        <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                            <div>
                                <p className="label" style={{ color: 'var(--text-muted)' }}>Practice Session</p>
                                <h2 className="t-h3">{activeQuestions.length} question{activeQuestions.length === 1 ? '' : 's'}</h2>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button className="btn btn-md btn-outline" onClick={resetPractice} disabled={submitting}>
                                    Cancel
                                </button>
                                <button className="btn btn-md btn-primary" style={{ gap: '0.45rem' }} onClick={submitPractice} disabled={submitting}>
                                    <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Practice'}
                                </button>
                            </div>
                        </div>

                        {activeQuestions.map((question, index) => {
                            const answer = answers[question.id] ?? createInitialAnswer(question);
                            const runLog = runLogs[question.id];
                            return (
                                <article key={question.id} className="card" style={{ padding: '1.1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.85rem' }}>
                                        <span className="badge badge-neutral">Q{index + 1}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                                                <span className="badge badge-neutral">{QUESTION_CATEGORY_LABELS[question.category]}</span>
                                                <span className="badge badge-neutral">{question.points} pts</span>
                                                <span className="badge badge-neutral">{question.test_title}</span>
                                            </div>
                                            <h3 className="t-h3" style={{ overflowWrap: 'anywhere' }}>{question.title}</h3>
                                            {question.description && <p className="t-body" style={{ color: 'var(--text-muted)', marginTop: '0.45rem', whiteSpace: 'pre-wrap' }}>{question.description}</p>}
                                        </div>
                                    </div>

                                    {question.image_url && (
                                        <img src={question.image_url} alt={`${question.title} reference`} style={{ width: '100%', maxHeight: '260px', objectFit: 'contain', border: '1px solid var(--border)', background: 'var(--bg-subtle)', marginBottom: '0.85rem' }} />
                                    )}

                                    {question.type === 'mcq' && (
                                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                                            {(question.options ?? []).map((option, optionIndex) => {
                                                const selected = answer.choice === optionIndex;
                                                return (
                                                    <button key={`${question.id}-${optionIndex}`} onClick={() => updateAnswer(question, { choice: selected ? undefined : optionIndex })} style={{ textAlign: 'left', padding: '0.75rem 0.85rem', border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, background: selected ? 'var(--surface-raised)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontWeight: selected ? 800 : 600 }}>
                                                        {option}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {question.type === 'text' && (
                                        <textarea className="input" rows={4} placeholder="Write your answer..." value={answer.response ?? ''} onChange={(event) => updateAnswer(question, { response: event.target.value })} />
                                    )}

                                    {question.type === 'numeric' && (
                                        <input className="input" type="number" step="any" placeholder="Enter numeric answer" value={answer.response ?? ''} onChange={(event) => updateAnswer(question, { response: event.target.value })} />
                                    )}

                                    {question.type === 'code' && (
                                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                                            <div style={{ height: '320px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                                <Editor
                                                    theme={theme === 'dark' ? 'vs-dark' : 'light'}
                                                    language={answer.language ?? question.language ?? 'typescript'}
                                                    value={answer.code ?? ''}
                                                    onChange={(value) => updateAnswer(question, { code: value ?? '', language: answer.language ?? question.language ?? 'typescript' })}
                                                    options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <select className="input" style={{ maxWidth: '180px' }} value={answer.language ?? question.language ?? 'typescript'} onChange={(event) => updateAnswer(question, { language: event.target.value })}>
                                                    {['typescript', 'javascript', 'python'].map((language) => <option key={language} value={language}>{language}</option>)}
                                                </select>
                                                <button className="btn btn-sm btn-outline" style={{ gap: '0.35rem' }} onClick={() => void runCode(question)} disabled={runLog?.status === 'running'}>
                                                    <Play size={13} /> Run
                                                </button>
                                            </div>
                                            {runLog && (
                                                <pre style={{ margin: 0, padding: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: runLog.status === 'error' ? 'var(--danger)' : 'var(--text)', whiteSpace: 'pre-wrap', overflowX: 'auto', fontSize: '0.78rem' }}>{runLog.message}</pre>
                                            )}
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </section>
                )}

                {result && (
                    <section className="anim-fade-up" style={{ display: 'grid', gap: '0.75rem' }}>
                        {reviewQuestions.map((question, index) => {
                            const graded = resultByQuestion.get(question.id);
                            const correct = Number(graded?.pointsEarned || 0) >= Number(question.points || 0);
                            return (
                                <article key={question.id} className="card" style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                        {correct ? <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} /> : <Target size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                                                <h3 className="t-h3">Q{index + 1}. {question.title}</h3>
                                                <span className="badge badge-neutral">{graded?.pointsEarned ?? 0}/{question.points} pts</span>
                                            </div>
                                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>{QUESTION_CATEGORY_LABELS[question.category]} - {question.test_title}</p>
                                            {question.type === 'mcq' && question.answer !== undefined && question.answer !== null && (
                                                <p className="t-small" style={{ color: 'var(--success)', marginTop: '0.5rem', fontWeight: 800 }}>
                                                    Correct answer: {(question.options ?? [])[question.answer] ?? `Option ${question.answer + 1}`}
                                                </p>
                                            )}
                                            {question.type === 'text' && (question.accepted_answers ?? []).length > 0 && (
                                                <p className="t-small" style={{ color: 'var(--success)', marginTop: '0.5rem', fontWeight: 800 }}>
                                                    Accepted: {(question.accepted_answers ?? []).join(', ')}
                                                </p>
                                            )}
                                            {question.type === 'numeric' && question.numeric_answer !== undefined && question.numeric_answer !== null && (
                                                <p className="t-small" style={{ color: 'var(--success)', marginTop: '0.5rem', fontWeight: 800 }}>
                                                    Answer: {question.numeric_answer} {question.numeric_tolerance ? `(tolerance ${question.numeric_tolerance})` : ''}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                )}
            </main>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @media (max-width: 900px) {
                    main.container section[style*="300px"],
                    main.container section[style*="minmax(0, 1fr) 300px"] {
                        grid-template-columns: 1fr !important;
                    }
                    main.container div[style*="220px auto"] {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default Practice;
