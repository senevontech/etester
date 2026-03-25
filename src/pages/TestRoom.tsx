import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { ChevronLeft, ChevronRight, Play, Send, Settings, Terminal, Clock, ShieldCheck, Zap, CheckCircle2, TerminalSquare, LifeBuoy, House } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useTests } from '../context/TestContext';
import { useAuth } from '../context/AuthContext';
import { useResults } from '../context/ResultContext';
import { useProctoring } from '../hooks/useProctoring';
import ProctorOverlay from '../components/Proctoring/ProctorOverlay';
import { CodeQuestion, AnswerPayload, IntegrityEvent } from '../types';
import { executeCode } from '../utils/piston';
import { apiRequest, ApiError } from '../lib/api';

interface TerminalLog {
    type: 'info' | 'success' | 'error';
    text: string;
}

interface AttemptRecord {
    id: string;
    status: 'active' | 'submitted' | 'expired' | 'abandoned';
    expires_at: string;
    integrity_events: IntegrityEvent[];
    violations_count: number;
}

interface AttemptResponse {
    attempt: AttemptRecord;
}

const formatTime = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const TestRoom: React.FC = () => {
    const { testId } = useParams<{ testId: string }>();
    const navigate = useNavigate();
    const { theme } = useTheme();
    const { getTest } = useTests();
    const { user } = useAuth();
    const { submitTest } = useResults();

    const test = getTest(testId ?? '');
    const { violations, isFullscreen, tabSwitchCount, fullscreenExitCount, enterFullscreen } = useProctoring(true);

    const [idx, setIdx] = useState(0);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [finishing, setFinishing] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [attemptId, setAttemptId] = useState('');
    const [attemptLoading, setAttemptLoading] = useState(false);
    const [attemptExpired, setAttemptExpired] = useState(false);
    const [syncedViolationsCount, setSyncedViolationsCount] = useState(0);
    const [logs, setLogs] = useState<TerminalLog[]>([]);
    const [executing, setExecuting] = useState(false);
    const [answers, setAnswers] = useState<Record<string, AnswerPayload>>({});
    const [currentLang, setCurrentLang] = useState<string>('typescript');
    const [fullscreenReady, setFullscreenReady] = useState(false);
    const [showFsWarning, setShowFsWarning] = useState(false);
    const [showTabWarning, setShowTabWarning] = useState(false);

    const q = test?.questions[idx];
    const total = test?.questions.length ?? 0;
    const recordedViolationCount = Math.max(violations.length, syncedViolationsCount);
    const integrityScore = Math.max(0, 100 - recordedViolationCount * 5);

    // Enter fullscreen → unlock the test gate
    useEffect(() => {
        if (isFullscreen && !fullscreenReady) setFullscreenReady(true);
    }, [isFullscreen, fullscreenReady]);

    useEffect(() => {
        if (q && q.type === 'code') {
            setCurrentLang(q.language);
        }
    }, [q]);

    useEffect(() => {
        if (!test || !user) return;

        let cancelled = false;
        setAttemptLoading(true);
        setSubmitError('');

        const startAttempt = async () => {
            try {
                const data = await apiRequest<AttemptResponse>(`/tests/${test.id}/attempts`, {
                    method: 'POST',
                });

                if (cancelled) return;

                const attempt = data.attempt;
                setAttemptId(attempt.id);
                setAttemptExpired(attempt.status !== 'active');
                setSyncedViolationsCount(attempt.integrity_events?.length ?? attempt.violations_count ?? 0);
                setTimeLeft(Math.max(0, Math.ceil((new Date(attempt.expires_at).getTime() - Date.now()) / 1000)));
            } catch (error) {
                if (cancelled) return;
                setAttemptId('');
                setTimeLeft(0);
                setSubmitError(error instanceof Error ? error.message : 'Failed to start test attempt.');
            } finally {
                if (!cancelled) setAttemptLoading(false);
            }
        };

        void startAttempt();

        return () => {
            cancelled = true;
        };
    }, [test?.id, user?.id]);

    useEffect(() => {
        if (!attemptId || attemptExpired || finishing) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev === null) return prev;
                if (prev <= 1) {
                    clearInterval(timer);
                    void submit();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [attemptExpired, attemptId, finishing]);

    useEffect(() => {
        if (!attemptId || finishing || attemptExpired) return;

        let cancelled = false;

        const heartbeat = async () => {
            try {
                const data = await apiRequest<AttemptResponse>(`/attempts/${attemptId}/heartbeat`, {
                    method: 'POST',
                });

                if (cancelled) return;
                const remaining = Math.max(0, Math.ceil((new Date(data.attempt.expires_at).getTime() - Date.now()) / 1000));
                setTimeLeft(remaining);
            } catch (error) {
                if (cancelled) return;
                if (error instanceof ApiError && (error.status === 409 || error.status === 410)) {
                    setAttemptExpired(true);
                    setTimeLeft(0);
                    setSubmitError(error.message);
                }
            }
        };

        const timer = setInterval(() => {
            void heartbeat();
        }, 30000);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [attemptExpired, attemptId, finishing]);

    useEffect(() => {
        if (!attemptId || attemptExpired || violations.length <= syncedViolationsCount) return;

        let cancelled = false;

        const syncEvents = async () => {
            const events = violations.slice(syncedViolationsCount);
            if (events.length === 0) return;

            try {
                const data = await apiRequest<AttemptResponse>(`/attempts/${attemptId}/integrity-events`, {
                    method: 'POST',
                    body: { events },
                });

                if (cancelled) return;
                setSyncedViolationsCount(data.attempt.integrity_events?.length ?? data.attempt.violations_count ?? violations.length);
            } catch (error) {
                if (cancelled) return;
                if (error instanceof ApiError && (error.status === 409 || error.status === 410)) {
                    setAttemptExpired(true);
                    setTimeLeft(0);
                    setSubmitError(error.message);
                }
            }
        };

        void syncEvents();

        return () => {
            cancelled = true;
        };
    }, [attemptExpired, attemptId, syncedViolationsCount, violations]);

    useEffect(() => {
        if (!test) return;

        const initial: Record<string, AnswerPayload> = {};
        test.questions.forEach((question) => {
            if (!answers[question.id]) {
                initial[question.id] = {
                    questionId: question.id,
                    type: question.type,
                    pointsEarned: 0,
                    choice: undefined,
                    code: question.type === 'code' ? (question as CodeQuestion).template : undefined,
                    language: question.type === 'code' ? (question as CodeQuestion).language : undefined,
                };
            }
        });

        if (Object.keys(initial).length > 0) {
            setAnswers((prev) => ({ ...prev, ...initial }));
        }
    }, [answers, test]);

    const updateCode = (val: string) => {
        if (!q) return;
        setAnswers((prev) => ({
            ...prev,
            [q.id]: { ...prev[q.id], code: val },
        }));
    };

    const updateChoice = (choice: number) => {
        if (!q) return;
        setAnswers((prev) => ({
            ...prev,
            [q.id]: { ...prev[q.id], choice },
        }));
    };

    const runCode = async () => {
        if (!test || !q || q.type !== 'code') return;
        const ans = answers[q.id];
        if (!ans?.code) return;

        setLogs([{ type: 'info', text: 'Executing code...' }]);
        setExecuting(true);

        try {
            const res = await executeCode(test.id, q.id, currentLang, ans.code);
            if (res.run.code !== 0) {
                setLogs((prev) => [...prev, { type: 'error', text: res.run.stderr || res.run.output || 'Execution Failed' }]);
            } else {
                const providerMessage = res.provider ? `Execution provider: ${res.provider}` : 'Execution Completed.';
                setLogs((prev) => [...prev, { type: 'success', text: `${providerMessage}\n${res.run.output || 'No output'}`.trim() }]);
            }
        } catch (error) {
            setLogs((prev) => [...prev, { type: 'error', text: error instanceof Error ? error.message : 'Error executing code' }]);
        } finally {
            setExecuting(false);
        }
    };

    const submit = async () => {
        if (!test || !user || !attemptId) return;
        if (finishing || attemptExpired) return;

        setSubmitError('');
        setFinishing(true);

        const finalAnswers = Object.values(answers).map((answer) => {
            const question = test.questions.find((item) => item.id === answer.questionId);
            if (!question) return answer;

            return {
                ...answer,
                language: question.type === 'code' ? answer.language ?? (question as CodeQuestion).language : answer.language,
            };
        });

        const submission = await submitTest(
            test.id,
            attemptId,
            finalAnswers,
            violations,
        );

        if (!submission) {
            setFinishing(false);
            setSubmitError('Submission failed. Please try again.');
            return;
        }

        setTimeout(() => navigate('/progress'), 2200);
    };

    // Stable ref so enforcement effects always call the latest submit
    const submitRef = React.useRef(submit);
    useEffect(() => { submitRef.current = submit; });

    // Fullscreen exit enforcement: warn on 1st, auto-submit on 2nd
    useEffect(() => {
        if (fullscreenExitCount === 0) return;
        if (fullscreenExitCount === 1) {
            setShowFsWarning(true);
        } else {
            void submitRef.current();
        }
    }, [fullscreenExitCount]);

    // Dismiss fullscreen warning once they re-enter
    useEffect(() => {
        if (isFullscreen) setShowFsWarning(false);
    }, [isFullscreen]);

    // Tab-switch enforcement: warn on 1st, auto-submit on 2nd
    useEffect(() => {
        if (tabSwitchCount === 0) return;
        if (tabSwitchCount === 1) {
            setShowTabWarning(true);
            const t = setTimeout(() => setShowTabWarning(false), 6000);
            return () => clearTimeout(t);
        } else {
            void submitRef.current();
        }
    }, [tabSwitchCount]);

    if (!test || !user) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: '1rem' }}>
            <p className="t-h2">Assessment not found</p>
            <button className="btn btn-md btn-primary hover-glow" onClick={() => navigate('/')}>Back to Hub</button>
        </div>
    );

    if (total === 0) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: '1rem' }}>
            <p className="t-h2">No questions yet</p>
            <p className="t-body">This assessment has no questions. Contact your admin.</p>
            <button className="btn btn-md btn-outline" onClick={() => navigate('/')}>Back to Hub</button>
        </div>
    );

    if (attemptLoading || timeLeft === null) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid var(--border-strong)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <p className="t-body">Preparing secure attempt...</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );

    if (!attemptId && submitError) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: '1rem' }}>
            <p className="t-h2">Unable to start attempt</p>
            <p className="t-body" style={{ maxWidth: '420px', textAlign: 'center' }}>{submitError}</p>
            <button className="btn btn-md btn-primary hover-glow" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        </div>
    );

    const activeAns = q ? answers[q.id] : undefined;

    return (
        <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
            <header style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0, zIndex: 50, gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} onClick={() => navigate('/')}>
                        <div style={{ width: '26px', height: '26px', background: 'var(--accent)', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShieldCheck size={14} color="var(--accent-fg)" strokeWidth={2.5} />
                        </div>
                        <span style={{ fontWeight: 900, fontSize: '0.9rem', letterSpacing: '-0.025em', color: 'var(--text)' }}>Etester</span>
                    </div>
                    <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
                    <div>
                        <p style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text)', lineHeight: 1, marginBottom: '2px' }}>{test.title}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite' }} />
                            <p style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1 }}>Proctoring Active</p>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="btn btn-sm btn-ghost" style={{ gap: '0.375rem' }} onClick={() => navigate('/')}>
                        <House size={13} /> Home
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.3rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '7px' }}>
                        <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem', fontWeight: 700, color: (timeLeft ?? 0) < 300 ? 'var(--danger)' : 'var(--text)', letterSpacing: '0.02em' }}>
                            {formatTime(timeLeft ?? 0)}
                        </span>
                    </div>
                    <button onClick={() => void submit()} className="btn btn-sm btn-primary hover-glow" style={{ gap: '0.375rem' }} disabled={attemptExpired}>
                        Submit <Send size={12} />
                    </button>
                    <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
                    <LifeBuoy size={16} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} />
                    <Settings size={16} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} />
                </div>
            </header>

            <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <aside style={{ width: 'min(360px, 38%)', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg-subtle)', flexShrink: 0 }}>
                    <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                        <span className="t-micro" style={{ color: 'var(--text-muted)' }}>Question {idx + 1} / {total}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {test.questions.map((question, i) => {
                                    const state = answers[question.id];
                                    const isAnswered = state?.type === 'mcq'
                                        ? state.choice !== undefined
                                        : (state?.code && state.code !== (question as CodeQuestion).template);
                                    return (
                                        <button
                                            key={question.id}
                                            onClick={() => setIdx(i)}
                                            style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '50%',
                                                border: 'none',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s ease',
                                                background: i === idx ? 'var(--text)' : isAnswered ? 'var(--success)' : 'var(--border-strong)',
                                            }}
                                        />
                                    );
                                })}
                            </div>
                            <button className="icon-btn" onClick={() => setIdx((prev) => Math.max(0, prev - 1))} disabled={idx === 0} style={{ opacity: idx === 0 ? 0.35 : 1 }}>
                                <ChevronLeft size={15} />
                            </button>
                            <button className="icon-btn" onClick={() => setIdx((prev) => Math.min(total - 1, prev + 1))} disabled={idx === total - 1} style={{ opacity: idx === total - 1 ? 0.35 : 1 }}>
                                <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1rem' }}>
                        {q && (
                            <>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
                                    <span className={`badge ${q.type === 'mcq' ? 'badge-success' : 'badge-warning'}`}>{q.type === 'mcq' ? 'MCQ' : 'Coding'}</span>
                                    <span className="badge badge-neutral">{q.points} pts</span>
                                </div>
                                <h1 className="t-h2" style={{ marginBottom: '0.875rem', fontSize: '1.1rem' }}>{q.title}</h1>
                                <p className="t-body" style={{ marginBottom: '1.5rem', whiteSpace: 'pre-line' }}>{q.description}</p>

                                {q.type === 'code' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        {q.constraints.length > 0 && (
                                            <div>
                                                <p className="label" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}><Zap size={11} /> Constraints</p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                                    {q.constraints.filter(Boolean).map((constraint, i) => (
                                                        <div key={`${q.id}-constraint-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.625rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                                            <CheckCircle2 size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-2)' }}>{constraint}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {q.examples.length > 0 && (
                                            <div>
                                                <p className="label" style={{ marginBottom: '0.5rem' }}>Examples</p>
                                                {q.examples.filter((example) => example.input || example.output).map((example, i) => (
                                                    <div key={`${q.id}-example-${i}`} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                                        <div style={{ padding: '0.4rem 0.625rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                                                            <span className="label" style={{ color: 'var(--text-muted)', marginRight: '0.4rem' }}>in</span>
                                                            <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text)' }}>{example.input}</code>
                                                        </div>
                                                        <div style={{ padding: '0.4rem 0.625rem' }}>
                                                            <span className="label" style={{ color: 'var(--text-muted)', marginRight: '0.4rem' }}>out</span>
                                                            <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text)' }}>{example.output}</code>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {q.type === 'mcq' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {q.options.map((option, i) => (
                                            <div
                                                key={`${q.id}-option-${i}`}
                                                onClick={() => updateChoice(i)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${activeAns?.choice === i ? 'var(--text)' : 'var(--border)'}`, background: activeAns?.choice === i ? 'var(--surface)' : 'transparent', transition: 'all 0.15s ease' }}
                                            >
                                                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${activeAns?.choice === i ? 'var(--text)' : 'var(--border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    {activeAns?.choice === i && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text)' }} />}
                                                </div>
                                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-2)' }}>{option}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </aside>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {q?.type === 'code' ? (
                        <>
                            <div style={{ padding: '0.5rem 1rem', display: 'flex', justifyContent: 'flex-end', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                                <select
                                    className="input"
                                    style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                                    value={currentLang}
                                    onChange={(e) => {
                                        const nextLanguage = e.target.value;
                                        setCurrentLang(nextLanguage);
                                        if (!q || q.type !== 'code') return;
                                        setAnswers((prev) => ({
                                            ...prev,
                                            [q.id]: { ...prev[q.id], language: nextLanguage },
                                        }));
                                    }}
                                >
                                    {['typescript', 'javascript', 'python', 'java', 'cpp'].map((language) => (
                                        <option key={language} value={language}>{language}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <Editor
                                    height="100%"
                                    language={currentLang}
                                    theme={theme === 'dark' ? 'vs-dark' : 'light'}
                                    value={activeAns?.code ?? ''}
                                    onChange={(value) => updateCode(value ?? '')}
                                    options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'JetBrains Mono', fontLigatures: true, scrollBeyondLastLine: false, padding: { top: 16 }, cursorSmoothCaretAnimation: 'on', smoothScrolling: true }}
                                />
                            </div>
                            <div style={{ height: '220px', display: 'flex', flexDirection: 'column', flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                                <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Terminal size={13} style={{ color: 'var(--text-muted)' }} />
                                        <span className="t-micro" style={{ color: 'var(--text-muted)' }}>Output Console</span>
                                    </div>
                                    <button onClick={runCode} className="btn btn-sm btn-outline" style={{ gap: '0.375rem', fontSize: '11px' }} disabled={executing || attemptExpired}>
                                        {executing ? <><span style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} /> Running</>
                                            : <><Play size={11} style={{ fill: 'currentColor' }} /> Run Code</>}
                                    </button>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '0.625rem 1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {logs.length === 0
                                        ? <span style={{ color: 'var(--text-placeholder)', fontStyle: 'italic' }}>Hit Run to see output...</span>
                                        : logs.map((log, i) => (
                                            <div key={`${log.type}-${i}`} style={{ display: 'flex', gap: '0.75rem', paddingBottom: '0.2rem', borderBottom: i === logs.length - 1 ? 'none' : '1px solid var(--border)' }}>
                                                <span style={{ color: 'var(--text-placeholder)', flexShrink: 0, marginTop: '2px' }}>{new Date().toLocaleTimeString()}</span>
                                                <div style={{ color: log.type === 'success' ? 'var(--text-2)' : log.type === 'error' ? 'var(--danger)' : 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                                                    {log.text}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', textAlign: 'center' }}>
                            <div>
                                <TerminalSquare size={48} style={{ color: 'var(--border-strong)', margin: '0 auto 1rem' }} />
                                <h2 className="t-h3" style={{ marginBottom: '0.5rem' }}>Multiple Choice Question</h2>
                                <p className="t-body">Please select your answer from the panel on the left.<br />Your choice will be saved automatically.</p>
                            </div>
                        </div>
                    )}
                </div>

                <ProctorOverlay violations={violations} />
            </main>

            {submitError && (
                <div style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 1200, background: 'var(--bg)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: '10px', boxShadow: 'var(--shadow)' }}>
                    {submitError}
                </div>
            )}

            <AnimatePresence>
                {finishing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                        <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-strong)', borderTop: '3px solid var(--text)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <h2 className="t-h2">Submitting Attempt...</h2>
                        <p className="t-body">Integrity score: <strong>{integrityScore}%</strong></p>
                    </motion.div>
                )}
            </AnimatePresence>
            <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
        </div>
    );
};

export default TestRoom;
