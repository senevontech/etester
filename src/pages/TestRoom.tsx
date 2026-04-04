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
import WebcamProctor, { type WebcamSnapshot } from '../components/Proctoring/WebcamProctor';
import { CodeQuestion, AnswerPayload, IntegrityEvent, QUESTION_CATEGORY_LABELS } from '../types';
import { executeCode } from '../utils/piston';
import { apiRequest, ApiError } from '../lib/api';

interface TerminalLog {
    type: 'info' | 'success' | 'error';
    text: string;
}

interface AttemptRecord {
    id: string;
    status: 'active' | 'in_progress' | 'submitted' | 'expired' | 'abandoned';
    expires_at: string;
    integrity_events: IntegrityEvent[];
    violations_count: number;
}

interface AttemptResponse {
    attempt: AttemptRecord;
}

interface EvidenceResponse {
    evidence: {
        id: string;
        captured_at: string;
    };
}

const formatTime = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const getQuestionChipLabel = (question: { category: keyof typeof QUESTION_CATEGORY_LABELS }) => QUESTION_CATEGORY_LABELS[question.category];

const TestRoom: React.FC = () => {
    const { testId } = useParams<{ testId: string }>();
    const navigate = useNavigate();
    const { theme } = useTheme();
    const { getTest } = useTests();
    const { user } = useAuth();
    const { submitTest } = useResults();

    const test = getTest(testId ?? '');
    const { violations, isFullscreen, tabSwitchCount, fullscreenExitCount } = useProctoring(true);

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
    const [tabWarningLevel, setTabWarningLevel] = useState<0 | 1 | 2>(0);
    const [cameraStatus, setCameraStatus] = useState<'pending' | 'online' | 'offline'>('pending');
    const [evidenceCount, setEvidenceCount] = useState(0);
    const [lastEvidenceAt, setLastEvidenceAt] = useState<string | null>(null);

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
        setEvidenceCount(0);
        setLastEvidenceAt(null);

        const startAttempt = async () => {
            try {
                const data = await apiRequest<AttemptResponse & { attempt: { answers: any[] } }>(`/tests/${test.id}/attempts`, {
                    method: 'POST',
                });

                if (cancelled) return;

                const attempt = data.attempt;
                setAttemptId(attempt.id);
                setAttemptExpired(attempt.status !== 'active' && attempt.status !== 'in_progress');
                setSyncedViolationsCount(attempt.integrity_events?.length ?? attempt.violations_count ?? 0);
                setTimeLeft(Math.max(0, Math.ceil((new Date(attempt.expires_at).getTime() - Date.now()) / 1000)));

                // Restore answers if they exist
                if (attempt.answers && attempt.answers.length > 0) {
                    const restored: Record<string, AnswerPayload> = {};
                    attempt.answers.forEach((ans: any) => {
                        restored[ans.questionId] = ans;
                    });
                    setAnswers(prev => ({ ...prev, ...restored }));
                    setLastSavedAnswers(JSON.stringify(restored));
                }
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

    // Sync hook-generated integrity events to the backend
    useEffect(() => {
        if (!attemptId || violations.length === 0 || attemptExpired || finishing) return;

        const unsynced = violations.slice(syncedViolationsCount);
        if (unsynced.length === 0) return;

        const syncViolations = async () => {
            try {
                await apiRequest(`/attempts/${attemptId}/integrity-events`, {
                    method: 'POST',
                    body: { events: unsynced },
                });
                setSyncedViolationsCount((prev) => prev + unsynced.length);
            } catch (err) {
                console.error('Failed to sync integrity events:', err);
            }
        };

        void syncViolations();
    }, [violations, attemptExpired, attemptId, finishing, syncedViolationsCount]);

    const [lastSavedAnswers, setLastSavedAnswers] = useState<string>('');

    const saveAnswers = async () => {
        if (!attemptId || attemptExpired || finishing) return;
        const currentAnswersStr = JSON.stringify(answers);
        if (currentAnswersStr === lastSavedAnswers) return;

        try {
            await apiRequest(`/attempts/${attemptId}/answers`, {
                method: 'PATCH',
                body: { answers: Object.values(answers) },
            });
            setLastSavedAnswers(currentAnswersStr);
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    };

    useEffect(() => {
        if (!attemptId || finishing || attemptExpired) return;
        
        const heartbeat = async () => {
            try {
                const data = await apiRequest<AttemptResponse>(`/attempts/${attemptId}/heartbeat`, {
                    method: 'POST',
                });
                const remaining = Math.max(0, Math.ceil((new Date(data.attempt.expires_at).getTime() - Date.now()) / 1000));
                setTimeLeft(remaining);
            } catch (error) {
                if (error instanceof ApiError && (error.status === 409 || error.status === 410)) {
                    setAttemptExpired(true);
                    setTimeLeft(0);
                    setSubmitError(error.message);
                }
            }
        };

        const hTimer = setInterval(() => void heartbeat(), 30000);
        const sTimer = setInterval(() => void saveAnswers(), 30000);

        return () => {
            clearInterval(hTimer);
            clearInterval(sTimer);
        };
    }, [attemptId, attemptExpired, finishing, answers, lastSavedAnswers]);

    const recordIntegrityEvent = async (type: string, details: any = {}, message?: string) => {
        if (!attemptId || attemptExpired || finishing) return;
        const occurredAt = new Date().toISOString();
        try {
            await apiRequest(`/attempts/${attemptId}/integrity-events`, {
                method: 'POST',
                body: {
                    type,
                    details,
                    message: message ?? String(type).replace(/_/g, ' '),
                    timestamp: occurredAt,
                    occurredAt,
                },
            });
        } catch (error) {
            console.error('Failed to record integrity event:', error);
        }
    };

    const uploadEvidenceSnapshot = async (snapshot: WebcamSnapshot) => {
        if (!attemptId || attemptExpired || finishing) return;

        try {
            const data = await apiRequest<EvidenceResponse>(`/attempts/${attemptId}/evidence`, {
                method: 'POST',
                body: {
                    kind: 'webcam_snapshot',
                    dataUrl: snapshot.dataUrl,
                    capturedAt: snapshot.capturedAt,
                    metadata: {
                        width: snapshot.width,
                        height: snapshot.height,
                        reason: snapshot.reason,
                    },
                },
            });
            setEvidenceCount((prev) => prev + 1);
            setLastEvidenceAt(data.evidence?.captured_at ?? snapshot.capturedAt);
        } catch (error) {
            console.error('Failed to upload evidence snapshot:', error);
        }
    };

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
                    response: question.type === 'text' || question.type === 'numeric' ? '' : undefined,
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

    const updateResponse = (response: string) => {
        if (!q) return;
        setAnswers((prev) => ({
            ...prev,
            [q.id]: { ...prev[q.id], response },
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

    const submit = async (reason?: string) => {
        if (!test || !user || !attemptId) return;
        if (finishing || attemptExpired) return;

        setSubmitError(reason ?? '');
        setFinishing(true);

        const finalAnswers = Object.values(answers).map((answer) => {
            const question = test.questions.find((item) => item.id === answer.questionId);
            if (!question) return answer;

            return {
                ...answer,
                language: question.type === 'code' ? answer.language ?? (question as CodeQuestion).language : answer.language,
                response: question.type === 'text' || question.type === 'numeric' ? (answer.response ?? '').trim() : answer.response,
            };
        });

        try {
            await submitTest(
                test.id,
                attemptId,
                finalAnswers,
                violations,
            );
        } catch (error) {
            setFinishing(false);
            setSubmitError(error instanceof Error ? error.message : 'Submission failed. Please try again.');
            return;
        }

        setTimeout(() => navigate('/progress'), 2200);
    };

    // Stable ref so enforcement effects always call the latest submit
    const submitRef = React.useRef(submit);
    useEffect(() => { submitRef.current = submit; });

    // Fullscreen exit enforcement
    useEffect(() => {
        if (fullscreenExitCount === 0) return;
        

        if (fullscreenExitCount === 1) {
            setShowFsWarning(true);
        } else {
            void submitRef.current('Attempt submitted after repeated fullscreen exits.');
        }
    }, [fullscreenExitCount]);

    // Tab-switch enforcement
    useEffect(() => {
        if (tabSwitchCount === 0) return;
        

        if (tabSwitchCount === 1) {
            setTabWarningLevel(1);
            const t = setTimeout(() => setTabWarningLevel(0), 5000);
            return () => clearTimeout(t);
        }
        if (tabSwitchCount === 2) {
            setTabWarningLevel(2);
            const t = setTimeout(() => setTabWarningLevel(0), 7000);
            return () => clearTimeout(t);
        }
        setTabWarningLevel(0);
        void submitRef.current('Attempt submitted for unauthorized tab switching after 3 violations.');
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
                                        : state?.type === 'code'
                                            ? Boolean(state.code && state.code !== (question as CodeQuestion).template)
                                            : Boolean(state?.response?.trim());
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
                                    <span className={`badge ${q.type === 'mcq' ? 'badge-success' : q.type === 'code' ? 'badge-warning' : 'badge-neutral'}`}>{getQuestionChipLabel(q)}</span>
                                    <span className="badge badge-neutral">{q.points} pts</span>
                                </div>
                                <h1 className="t-h2" style={{ marginBottom: '0.875rem', fontSize: '1.1rem' }}>{q.title}</h1>
                                {q.imageUrl && (
                                    <div style={{ marginBottom: '1rem', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface)' }}>
                                        <img src={q.imageUrl} alt={`${q.title} reference`} style={{ width: '100%', maxHeight: '280px', objectFit: 'contain', display: 'block', background: 'var(--bg-subtle)' }} />
                                    </div>
                                )}
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
                                {q.type === 'text' && (
                                    <div>
                                        <p className="label" style={{ marginBottom: '0.375rem' }}>Your Answer</p>
                                        <textarea
                                            className="input"
                                            rows={4}
                                            placeholder="Write a short answer"
                                            value={activeAns?.response ?? ''}
                                            onChange={(e) => updateResponse(e.target.value)}
                                            style={{ resize: 'vertical', fontFamily: 'Manrope, sans-serif' }}
                                        />
                                    </div>
                                )}
                                {q.type === 'numeric' && (
                                    <div>
                                        <p className="label" style={{ marginBottom: '0.375rem' }}>Your Answer</p>
                                        <input
                                            className="input"
                                            type="number"
                                            step="any"
                                            placeholder="Enter a numeric answer"
                                            value={activeAns?.response ?? ''}
                                            onChange={(e) => updateResponse(e.target.value)}
                                        />
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
                                <h2 className="t-h3" style={{ marginBottom: '0.5rem' }}>{q ? getQuestionChipLabel(q) : ''}</h2>
                                <p className="t-body">Use the panel on the left to answer this question.<br />Your response will be included in the submission.</p>
                            </div>
                        </div>
                    )}
                </div>

                <WebcamProctor
                    onViolation={(type, details) => void recordIntegrityEvent(type, details, type === 'camera_off' ? 'Camera access was denied, lost, or turned off.' : undefined)}
                    onSnapshotCaptured={(snapshot) => void uploadEvidenceSnapshot(snapshot)}
                    onCameraStatusChange={setCameraStatus}
                />
                <ProctorOverlay
                    violations={violations}
                    cameraStatus={cameraStatus}
                    evidenceCount={evidenceCount}
                    lastEvidenceAt={lastEvidenceAt}
                />
            </main>

            {submitError && (
                <div style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 1200, background: 'var(--bg)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: '10px', boxShadow: 'var(--shadow)' }}>
                    {submitError}
                </div>
            )}

            <AnimatePresence>
                {(showFsWarning || tabWarningLevel > 0) && (
                    <motion.div
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        style={{ position: 'fixed', top: '4.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 1300, width: 'min(520px, calc(100vw - 2rem))', background: 'var(--bg)', border: `1px solid ${tabWarningLevel === 2 ? 'var(--danger)' : 'var(--warning)'}`, borderRadius: '12px', boxShadow: 'var(--shadow-lg)', padding: '1rem 1.125rem' }}
                    >
                        {showFsWarning && (
                            <>
                                <p className="label" style={{ color: 'var(--warning)', marginBottom: '0.35rem' }}>Fullscreen Warning</p>
                                <p className="t-body">You exited fullscreen mode. Re-enter immediately. A second fullscreen exit will auto-submit the attempt.</p>
                            </>
                        )}
                        {!showFsWarning && tabWarningLevel === 1 && (
                            <>
                                <p className="label" style={{ color: 'var(--warning)', marginBottom: '0.35rem' }}>Tab Switch Warning</p>
                                <p className="t-body">Tab switching is not allowed during the exam. This is your first warning.</p>
                            </>
                        )}
                        {!showFsWarning && tabWarningLevel === 2 && (
                            <>
                                <p className="label" style={{ color: 'var(--danger)', marginBottom: '0.35rem' }}>Strict Warning</p>
                                <p className="t-body">One more tab switch will auto-submit this exam as an unauthorized attempt.</p>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

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

