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
import WebcamProctor from '../components/Proctoring/WebcamProctor';
import AudioProctor from '../components/Proctoring/AudioProctor';
import { CodeQuestion, AnswerPayload, IntegrityEvent, QUESTION_CATEGORY_LABELS } from '../types';
import { executeCode } from '../utils/piston';
import { apiRequest, ApiError } from '../lib/api';

const DEFAULT_SECURITY_SETTINGS = {
    webcam: true,
    microphone: true,
    tabSwitch: true,
    fullscreen: true,
    laptopOnly: false,
};

const isMobileLikeDevice = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isTouchMac = /macintosh/.test(userAgent) && navigator.maxTouchPoints > 1;
    return isTouchMac || /android|iphone|ipad|ipod|tablet|mobile|windows phone|opera mini|silk\//.test(userAgent);
};

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

const getQuestionChipLabel = (question: { category: keyof typeof QUESTION_CATEGORY_LABELS }) => QUESTION_CATEGORY_LABELS[question.category];

const TestRoom: React.FC = () => {
    const { testId } = useParams<{ testId: string }>();
    const navigate = useNavigate();
    const { theme } = useTheme();
    const { getTest, refetch: refetchTests } = useTests();
    const { user } = useAuth();
    const { submitTest } = useResults();

    const test = getTest(testId ?? '');
    const security = test?.securitySettings ?? DEFAULT_SECURITY_SETTINGS;
    const isMobileOrTablet = isMobileLikeDevice();
    const blockedByDevicePolicy = security.laptopOnly && isMobileOrTablet;
    const fullscreenSupported = Boolean(document.documentElement.requestFullscreen);
    const fullscreenRequired = security.fullscreen && !(isMobileOrTablet && !security.laptopOnly && !fullscreenSupported);
    const { violations, isFullscreen, tabSwitchCount, fullscreenExitCount, enterFullscreen } = useProctoring(true, {
        tabSwitch: security.tabSwitch,
        fullscreen: fullscreenRequired,
    });

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
    const [fsWarningLevel, setFsWarningLevel] = useState<0 | 1 | 2>(0);
    const [tabWarningLevel, setTabWarningLevel] = useState<0 | 1 | 2>(0);
    const [faceWarningLevel, setFaceWarningLevel] = useState<0 | 1 | 2>(0);
    const [noiseWarningLevel, setNoiseWarningLevel] = useState<0 | 1 | 2>(0);
    const [autoSubmitReason, setAutoSubmitReason] = useState<string | null>(null);
    const [autoSubmitCountdown, setAutoSubmitCountdown] = useState(3);

    const q = test?.questions[idx];
    const total = test?.questions.length ?? 0;
    const recordedViolationCount = Math.max(violations.length, syncedViolationsCount);
    const integrityScore = Math.max(0, 100 - recordedViolationCount * 5);

    // Enter fullscreen → unlock the test gate
    useEffect(() => {
        if (!fullscreenRequired && !fullscreenReady) {
            setFullscreenReady(true);
            return;
        }
        if (isFullscreen && !fullscreenReady) setFullscreenReady(true);
    }, [isFullscreen, fullscreenReady, fullscreenRequired]);

    useEffect(() => {
        if (q && q.type === 'code') {
            setCurrentLang(q.language);
        }
    }, [q]);

    useEffect(() => {
        if (!test || !user) return;
        if (blockedByDevicePolicy) return;

        let cancelled = false;
        setAttemptLoading(true);
        setSubmitError('');

        const startAttempt = async () => {
            try {
                const accessCode = sessionStorage.getItem(`etester-exam-code:${test.id}`) ?? '';
                const assignmentCode = sessionStorage.getItem(`etester-assignment-code:${test.id}`) ?? '';
                const data = await apiRequest<AttemptResponse & { attempt: { answers: any[] } }>(`/tests/${test.id}/attempts`, {
                    method: 'POST',
                    body: { accessCode, assignmentCode },
                });

                if (cancelled) return;

                const attempt = data.attempt;
                setAttemptId(attempt.id);
                setAttemptExpired(attempt.status !== 'active');
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
    }, [test?.id, user?.id, blockedByDevicePolicy]);

    // Sync violations to backend when they occur
    useEffect(() => {
        if (!attemptId || violations.length === 0) return;

        const unsynced = violations.slice(syncedViolationsCount);
        if (unsynced.length === 0) return;

        const syncViolations = async () => {
            for (const v of unsynced) {
                try {
                    await apiRequest(`/attempts/${attemptId}/violations`, {
                        method: 'POST',
                        body: { type: v.type, message: v.message }
                    });
                    setSyncedViolationsCount(prev => prev + 1);
                } catch (err) {
                    console.error('Failed to sync violation:', err);
                }
            }
        };

        void syncViolations();
    }, [violations, attemptId, syncedViolationsCount]);

    // Heartbeat to keep session alive and sync IP/UA
    useEffect(() => {
        if (!attemptId || attemptExpired) return;

        const interval = setInterval(() => {
            void apiRequest(`/attempts/${attemptId}/heartbeat`, { method: 'POST' })
                .catch(err => {
                    if (err instanceof ApiError && err.status === 410) {
                        setAttemptExpired(true);
                    }
                });
        }, 30000);

        return () => clearInterval(interval);
    }, [attemptId, attemptExpired]);

    useEffect(() => {
        if (!attemptId || attemptExpired || finishing) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev === null) return prev;
                if (prev <= 1) {
                    clearInterval(timer);
                    void submit('Time expired.');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [attemptExpired, attemptId, finishing]);

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

    const logViolation = React.useCallback(async (type: string, details: any = {}) => {
        if (!attemptId || attemptExpired || finishing) return;
        try {
            await apiRequest(`/attempts/${attemptId}/logs`, {
                method: 'POST',
                body: { type, details },
            });
            setSyncedViolationsCount(prev => prev + 1);
        } catch (error) {
            console.error('Failed to log violation:', error);
        }
    }, [attemptId, attemptExpired, finishing]);

    // Camera/face events are logged to backend for audit but do NOT count
    // toward the integrity score shown to the student.
    const logCameraEvent = React.useCallback(async (type: string, details: any = {}) => {
        if (!attemptId || attemptExpired || finishing) return;
        try {
            await apiRequest(`/attempts/${attemptId}/logs`, {
                method: 'POST',
                body: { type, details },
            });
        } catch (error) {
            console.error('Failed to log camera event:', error);
        }
    }, [attemptId, attemptExpired, finishing]);

    const handleCameraEvent = React.useCallback((type: string, details: any = {}) => {
        void logCameraEvent(type, details);
    }, [logCameraEvent]);

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
        setAnswers((prev) => {
            const current = prev[q.id]?.choice;
            return {
                ...prev,
                [q.id]: { ...prev[q.id], choice: current === choice ? undefined : choice },
            };
        });
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
                reason ?? null,
            );
            await refetchTests();
        } catch (error) {
            setFinishing(false);
            setSubmitError(error instanceof Error ? error.message : 'Submission failed. Please try again.');
            return;
        }

        setTimeout(() => navigate('/dashboard'), 2200);
    };

    // Stable ref so enforcement effects always call the latest submit
    const submitRef = React.useRef(submit);
    useEffect(() => { submitRef.current = submit; });

    // Auto-submit countdown: when a violation limit is hit, count down 3s then submit
    useEffect(() => {
        if (!autoSubmitReason) return;
        setAutoSubmitCountdown(3);

        const tick = setInterval(() => {
            setAutoSubmitCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(tick);
                    void submitRef.current(autoSubmitReason);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(tick);
    }, [autoSubmitReason]);

    // Fullscreen exit enforcement — 2 warnings, 3rd exit auto-submits
    useEffect(() => {
        if (!fullscreenRequired) return;
        if (fullscreenExitCount === 0) return;
        void logViolation('fullscreen_exit', { count: fullscreenExitCount });
        if (fullscreenExitCount === 1) {
            setFsWarningLevel(1);
        } else if (fullscreenExitCount === 2) {
            setFsWarningLevel(2);
        } else {
            setFsWarningLevel(0);
            setAutoSubmitReason('Exited fullscreen mode 3 times.');
        }
    }, [fullscreenExitCount, logViolation, fullscreenRequired]);

    // Clear fullscreen warning when candidate re-enters fullscreen
    useEffect(() => {
        if (!fullscreenRequired) return;
        if (isFullscreen) setFsWarningLevel(0);
    }, [isFullscreen, fullscreenRequired]);

    // Tab-switch enforcement
    useEffect(() => {
        if (!security.tabSwitch) return;
        if (tabSwitchCount === 0) return;
        
        void logViolation('tab_switch', { count: tabSwitchCount });

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
        setAutoSubmitReason('Switched tabs or left the exam window 3 times.');
    }, [tabSwitchCount, logViolation, security.tabSwitch]);

    // Multiple-face enforcement
    const handleFaceViolation = React.useCallback((warningNumber: number) => {
        if (!security.webcam) return;
        void logViolation('multiple_faces', { warningNumber });
        if (warningNumber === 1) {
            setFaceWarningLevel(1);
            window.setTimeout(() => setFaceWarningLevel(0), 6000);
            return;
        }
        if (warningNumber === 2) {
            setFaceWarningLevel(2);
            window.setTimeout(() => setFaceWarningLevel(0), 7000);
            return;
        }
        setFaceWarningLevel(0);
        setAutoSubmitReason('Multiple faces detected 3 times.');
    }, [logViolation, security.webcam]);

    const handleNoiseViolation = React.useCallback((warningNumber: number) => {
        if (!security.microphone) return;
        void logViolation('loud_noise', { warningNumber });
        if (warningNumber === 1) {
            setNoiseWarningLevel(1);
            window.setTimeout(() => setNoiseWarningLevel(0), 6000);
            return;
        }
        if (warningNumber === 2) {
            setNoiseWarningLevel(2);
            window.setTimeout(() => setNoiseWarningLevel(0), 7000);
            return;
        }
        setNoiseWarningLevel(0);
        setAutoSubmitReason('Repeated loud noise was detected 3 times.');
    }, [logViolation, security.microphone]);

    if (!test || !user) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: '1rem' }}>
            <p className="t-h2">Assessment not found</p>
            <button className="btn btn-md btn-primary hover-glow" onClick={() => navigate('/')}>Back to Hub</button>
        </div>
    );

    if (blockedByDevicePolicy) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
            <p className="t-h2">Desktop or Laptop Required</p>
            <p className="t-body" style={{ maxWidth: '420px', textAlign: 'center' }}>
                This exam is configured to run only on laptop/desktop devices. Please open it from a computer browser.
            </p>
            <button className="btn btn-md btn-primary hover-glow" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        </div>
    );

    if (total === 0) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: '1rem' }}>
            <p className="t-h2">No questions yet</p>
            <p className="t-body">This assessment has no questions. Contact your subadmin.</p>
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
        <div className="test-room-shell" style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
            <header className="test-room-header" style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0, zIndex: 50, gap: '1rem' }}>
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

                <div className="test-room-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="btn btn-sm btn-ghost test-room-home" style={{ gap: '0.375rem' }} onClick={() => navigate('/')}>
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

            <main className="test-room-main" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* ── Left Question Nav Sidebar ── */}
                <nav className="test-room-nav" style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                        <p style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.625rem', fontFamily: 'Manrope' }}>Question Panel</p>
                        {/* Progress bar */}
                        {(() => {
                            const answeredCount = test.questions.filter(question => {
                                const s = answers[question.id];
                                if (!s) return false;
                                return s.type === 'mcq' ? s.choice !== undefined
                                    : s.type === 'code' ? Boolean(s.code && s.code !== (question as CodeQuestion).template && s.code.trim())
                                    : Boolean(s.response?.trim());
                            }).length;
                            const pct = Math.round((answeredCount / total) * 100);
                            return (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope' }}>{answeredCount} / {total} answered</span>
                                        <span style={{ fontSize: '11px', fontWeight: 700, color: answeredCount === total ? 'var(--success)' : 'var(--text-muted)', fontFamily: 'Manrope' }}>{pct}%</span>
                                    </div>
                                    <div style={{ height: '5px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', borderRadius: '99px', background: answeredCount === total ? 'var(--success)' : 'var(--accent)', width: `${pct}%`, transition: 'width 0.3s ease' }} />
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* Question grid */}
                    <div className="test-room-nav-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0.875rem' }}>
                        <div className="test-room-question-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '1rem' }}>
                            {test.questions.map((question, i) => {
                                const state = answers[question.id];
                                const isAnswered = state?.type === 'mcq'
                                    ? state.choice !== undefined
                                    : state?.type === 'code'
                                        ? Boolean(state.code && state.code !== (question as CodeQuestion).template && state.code.trim())
                                        : Boolean(state?.response?.trim());
                                const isCurrent = i === idx;

                                let bg = 'var(--surface)';
                                let borderColor = 'var(--border)';
                                let color = 'var(--text-muted)';
                                if (isCurrent) { bg = 'var(--accent)'; borderColor = 'var(--accent)'; color = 'white'; }
                                else if (isAnswered) { bg = 'color-mix(in srgb, var(--success) 15%, transparent)'; borderColor = 'var(--success)'; color = 'var(--success)'; }

                                return (
                                    <button
                                        key={question.id}
                                        onClick={() => setIdx(i)}
                                        title={`Q${i + 1}: ${question.title}`}
                                        style={{
                                            aspectRatio: '1',
                                            borderRadius: '8px',
                                            border: `1.5px solid ${borderColor}`,
                                            background: bg,
                                            color,
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            fontFamily: 'Manrope',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'all 0.15s ease',
                                            position: 'relative',
                                        }}
                                    >
                                        {i + 1}
                                        {isAnswered && !isCurrent && (
                                            <div style={{ position: 'absolute', top: '3px', right: '3px', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--success)' }} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0.75rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            {[
                                { color: 'var(--accent)', label: 'Current' },
                                { color: 'var(--success)', label: 'Answered' },
                                { color: 'var(--border-strong)', label: 'Not answered' },
                            ].map(({ color, label }) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: color, flexShrink: 0 }} />
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'Manrope' }}>{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </nav>

                {/* ── Main content area ── */}
                {q?.type === 'code' ? (
                    /* Code question: split question-panel | editor */
                    <div className="test-room-code-layout" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                        {/* Question pane */}
                        <div className="test-room-code-question" style={{ width: '42%', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                    <span className="badge badge-warning">{getQuestionChipLabel(q)}</span>
                                    <span className="badge badge-neutral">{q.points} pts</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'Manrope', alignSelf: 'center' }}>Q{idx + 1} of {total}</span>
                                </div>
                                <h1 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.75rem', lineHeight: 1.4, fontFamily: 'Manrope' }}>{q.title}</h1>
                                {q.imageUrl && (
                                    <div style={{ marginBottom: '1rem', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                                        <img src={q.imageUrl} alt="" style={{ width: '100%', maxHeight: '220px', objectFit: 'contain', display: 'block', background: 'var(--bg-subtle)' }} />
                                    </div>
                                )}
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '1.25rem', whiteSpace: 'pre-line', fontFamily: 'Manrope' }}>{q.description}</p>
                                {q.constraints.length > 0 && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <p className="label" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}><Zap size={11} /> Constraints</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                            {q.constraints.filter(Boolean).map((c, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.625rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                                    <CheckCircle2 size={11} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                                    <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-2)' }}>{c}</code>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {q.examples.filter(e => e.input || e.output).length > 0 && (
                                    <div>
                                        <p className="label" style={{ marginBottom: '0.5rem' }}>Examples</p>
                                        {q.examples.filter(e => e.input || e.output).map((example, i) => (
                                            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                                <div style={{ padding: '0.35rem 0.625rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                                                    <span className="label" style={{ color: 'var(--text-muted)', marginRight: '0.4rem' }}>in</span>
                                                    <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text)' }}>{example.input}</code>
                                                </div>
                                                <div style={{ padding: '0.35rem 0.625rem' }}>
                                                    <span className="label" style={{ color: 'var(--text-muted)', marginRight: '0.4rem' }}>out</span>
                                                    <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text)' }}>{example.output}</code>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Code nav footer */}
                            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                <button className="btn btn-sm btn-outline" style={{ flex: 1, gap: '0.375rem' }} onClick={() => setIdx(p => Math.max(0, p - 1))} disabled={idx === 0}>
                                    <ChevronLeft size={13} /> Prev
                                </button>
                                <button className="btn btn-sm btn-outline" style={{ flex: 1, gap: '0.375rem' }} onClick={() => setIdx(p => Math.min(total - 1, p + 1))} disabled={idx === total - 1}>
                                    Next <ChevronRight size={13} />
                                </button>
                            </div>
                        </div>

                        {/* Editor + Terminal pane */}
                        <div className="test-room-code-workspace" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <TerminalSquare size={13} style={{ color: 'var(--text-muted)' }} />
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'Manrope' }}>Code Editor</span>
                                </div>
                                <select
                                    className="input"
                                    style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                                    value={currentLang}
                                    onChange={(e) => {
                                        const nextLanguage = e.target.value;
                                        setCurrentLang(nextLanguage);
                                        if (!q || q.type !== 'code') return;
                                        setAnswers(prev => ({ ...prev, [q.id]: { ...prev[q.id], language: nextLanguage } }));
                                    }}
                                >
                                    {['typescript', 'javascript', 'python', 'java', 'cpp'].map(lang => (
                                        <option key={lang} value={lang}>{lang}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="test-room-editor-area" style={{ flex: 1, overflow: 'hidden' }}>
                                <Editor
                                    height="100%"
                                    language={currentLang}
                                    theme={theme === 'dark' ? 'vs-dark' : 'light'}
                                    value={activeAns?.code ?? ''}
                                    onChange={(value) => updateCode(value ?? '')}
                                    options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'JetBrains Mono', fontLigatures: true, scrollBeyondLastLine: false, padding: { top: 16 }, cursorSmoothCaretAnimation: 'on', smoothScrolling: true }}
                                />
                            </div>
                            <div className="test-room-terminal" style={{ height: '200px', display: 'flex', flexDirection: 'column', flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                                <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Terminal size={13} style={{ color: 'var(--text-muted)' }} />
                                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'Manrope' }}>Output Console</span>
                                    </div>
                                    <button onClick={runCode} className="btn btn-sm btn-outline" style={{ gap: '0.375rem', fontSize: '11px' }} disabled={executing || attemptExpired}>
                                        {executing
                                            ? <><span style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} /> Running</>
                                            : <><Play size={11} style={{ fill: 'currentColor' }} /> Run Code</>}
                                    </button>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '0.625rem 1rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {logs.length === 0
                                        ? <span style={{ color: 'var(--text-placeholder)', fontStyle: 'italic' }}>Hit Run to see output...</span>
                                        : logs.map((log, i) => (
                                            <div key={`${log.type}-${i}`} style={{ display: 'flex', gap: '0.75rem', paddingBottom: '0.2rem', borderBottom: i === logs.length - 1 ? 'none' : '1px solid var(--border)' }}>
                                                <span style={{ color: 'var(--text-placeholder)', flexShrink: 0 }}>{new Date().toLocaleTimeString()}</span>
                                                <div style={{ color: log.type === 'error' ? 'var(--danger)' : 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{log.text}</div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* MCQ / Text / Numeric: centered content card */
                    <div className="test-room-standard-question" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1.5rem', background: 'var(--bg)' }}>
                        {q && (
                            <div style={{ width: '100%', maxWidth: '780px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {/* Question card */}
                                <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '16px', padding: '2rem', boxShadow: 'var(--shadow-sm)' }}>
                                    {/* Meta row */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <span className={`badge ${q.type === 'mcq' ? 'badge-success' : 'badge-neutral'}`}>{getQuestionChipLabel(q)}</span>
                                            <span className="badge badge-neutral">{q.points} pts</span>
                                        </div>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', fontFamily: 'Manrope', letterSpacing: '0.04em' }}>
                                            Question {idx + 1} <span style={{ color: 'var(--border-strong)' }}>/</span> {total}
                                        </span>
                                    </div>

                                    {/* Question title */}
                                    <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.875rem', lineHeight: 1.45, fontFamily: 'Manrope' }}>{q.title}</h1>

                                    {/* Image */}
                                    {q.imageUrl && (
                                        <div style={{ marginBottom: '1rem', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                                            <img src={q.imageUrl} alt="" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', display: 'block', background: 'var(--surface)' }} />
                                        </div>
                                    )}

                                    {/* Description */}
                                    <p style={{ fontSize: '0.9375rem', color: 'var(--text-2)', lineHeight: 1.75, whiteSpace: 'pre-line', fontFamily: 'Manrope' }}>{q.description}</p>
                                </div>

                                {/* Answer card */}
                                <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.75rem', boxShadow: 'var(--shadow-sm)' }}>
                                    <p style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1rem', fontFamily: 'Manrope' }}>Your Answer</p>

                                    {q.type === 'mcq' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                            {q.options.map((option, i) => {
                                                const selected = activeAns?.choice === i;
                                                return (
                                                    <div
                                                        key={`${q.id}-option-${i}`}
                                                        onClick={() => updateChoice(i)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '1rem',
                                                            padding: '0.875rem 1.125rem', borderRadius: '10px', cursor: 'pointer',
                                                            border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                                                            background: selected ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-subtle))' : 'var(--surface)',
                                                            transition: 'all 0.15s ease',
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                                                            border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-strong)'}`,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            {selected && <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--accent)' }} />}
                                                        </div>
                                                        <span style={{ fontSize: '0.9375rem', fontWeight: selected ? 700 : 500, color: selected ? 'var(--text)' : 'var(--text-2)', fontFamily: 'Manrope', lineHeight: 1.5 }}>{option}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {q.type === 'text' && (
                                        <textarea
                                            className="input"
                                            rows={5}
                                            placeholder="Write your answer here..."
                                            value={activeAns?.response ?? ''}
                                            onChange={(e) => updateResponse(e.target.value)}
                                            style={{ resize: 'vertical', fontFamily: 'Manrope, sans-serif', fontSize: '0.9375rem', lineHeight: 1.6 }}
                                        />
                                    )}

                                    {q.type === 'numeric' && (
                                        <input
                                            className="input"
                                            type="number"
                                            step="any"
                                            placeholder="Enter a numeric answer"
                                            value={activeAns?.response ?? ''}
                                            onChange={(e) => updateResponse(e.target.value)}
                                            style={{ fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}
                                        />
                                    )}
                                </div>

                                {/* Prev / Next navigation */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '1.5rem' }}>
                                    <button
                                        className="btn btn-md btn-outline"
                                        style={{ gap: '0.5rem', minWidth: '120px' }}
                                        onClick={() => setIdx(p => Math.max(0, p - 1))}
                                        disabled={idx === 0}
                                    >
                                        <ChevronLeft size={15} /> Previous
                                    </button>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'Manrope' }}>
                                        {idx + 1} of {total}
                                    </span>
                                    {idx < total - 1 ? (
                                        <button
                                            className="btn btn-md btn-primary hover-glow"
                                            style={{ gap: '0.5rem', minWidth: '120px' }}
                                            onClick={() => setIdx(p => Math.min(total - 1, p + 1))}
                                        >
                                            Next <ChevronRight size={15} />
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-md btn-primary hover-glow"
                                            style={{ gap: '0.5rem', minWidth: '120px' }}
                                            onClick={() => void submit()}
                                            disabled={attemptExpired}
                                        >
                                            Submit <Send size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {security.webcam && (
                    <WebcamProctor
                        onViolation={handleCameraEvent}
                        onFaceViolation={handleFaceViolation}
                    />
                )}
                {security.microphone && (
                    <AudioProctor
                        onViolation={handleCameraEvent}
                        onNoiseViolation={handleNoiseViolation}
                    />
                )}
                <ProctorOverlay violations={violations} />
            </main>

            {submitError && (
                <div style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 1200, background: 'var(--bg)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: '10px', boxShadow: 'var(--shadow)' }}>
                    {submitError}
                </div>
            )}

            {/* Unified top warning banner — face warnings take priority */}
            {/* Unified top warning banner */}
            <AnimatePresence>
                {(faceWarningLevel > 0 || fsWarningLevel > 0 || tabWarningLevel > 0 || noiseWarningLevel > 0) && (
                    <motion.div
                        key={`warn-${faceWarningLevel}-${fsWarningLevel}-${tabWarningLevel}-${noiseWarningLevel}`}
                        initial={{ opacity: 0, y: -16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        style={{
                            position: 'fixed',
                            top: '4.5rem',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 1300,
                            width: 'min(520px, calc(100vw - 2rem))',
                            background: 'var(--bg)',
                            border: `1px solid ${faceWarningLevel === 2 || fsWarningLevel === 2 || tabWarningLevel === 2 || noiseWarningLevel === 2 ? 'var(--danger)' : 'var(--warning)'}`,
                            borderRadius: '12px',
                            boxShadow: 'var(--shadow-lg)',
                            padding: '1rem 1.125rem',
                            pointerEvents: 'auto',
                        }}
                    >
                        {/* Face warnings (highest priority) */}
                        {faceWarningLevel === 1 && (
                            <>
                                <p className="label" style={{ color: 'var(--warning)', marginBottom: '0.35rem' }}>Multiple Faces Detected — Warning 1 of 3</p>
                                <p className="t-body">Only one person is allowed during the exam. Two more detections will auto-submit your attempt.</p>
                            </>
                        )}
                        {faceWarningLevel === 2 && (
                            <>
                                <p className="label" style={{ color: 'var(--danger)', marginBottom: '0.35rem' }}>Multiple Faces Detected — Warning 2 of 3</p>
                                <p className="t-body">One more detection of multiple faces will immediately auto-submit this exam.</p>
                            </>
                        )}

                        {/* Fullscreen warnings */}
                        {faceWarningLevel === 0 && fsWarningLevel === 1 && (
                            <>
                                <p className="label" style={{ color: 'var(--warning)', marginBottom: '0.35rem' }}>Fullscreen Warning — 1 of 2</p>
                                <p className="t-body" style={{ marginBottom: '0.75rem' }}>You exited fullscreen mode. Return to fullscreen immediately. One more exit will auto-submit your attempt.</p>
                                <button className="btn btn-sm btn-primary hover-glow" onClick={() => void enterFullscreen()}>
                                    Return to Fullscreen
                                </button>
                            </>
                        )}
                        {faceWarningLevel === 0 && fsWarningLevel === 2 && (
                            <>
                                <p className="label" style={{ color: 'var(--danger)', marginBottom: '0.35rem' }}>Final Fullscreen Warning — 2 of 2</p>
                                <p className="t-body" style={{ marginBottom: '0.75rem' }}>You have exited fullscreen twice. Exiting again will immediately auto-submit this exam.</p>
                                <button className="btn btn-sm btn-primary hover-glow" onClick={() => void enterFullscreen()}>
                                    Return to Fullscreen
                                </button>
                            </>
                        )}

                        {/* Tab-switch warnings */}
                        {faceWarningLevel === 0 && fsWarningLevel === 0 && tabWarningLevel === 1 && (
                            <>
                                <p className="label" style={{ color: 'var(--warning)', marginBottom: '0.35rem' }}>Tab Switch Warning</p>
                                <p className="t-body">Tab switching is not allowed during the exam. This is your first warning.</p>
                            </>
                        )}
                        {faceWarningLevel === 0 && fsWarningLevel === 0 && tabWarningLevel === 2 && (
                            <>
                                <p className="label" style={{ color: 'var(--danger)', marginBottom: '0.35rem' }}>Strict Warning</p>
                                <p className="t-body">One more tab switch will auto-submit this exam as an unauthorized attempt.</p>
                            </>
                        )}

                        {faceWarningLevel === 0 && fsWarningLevel === 0 && tabWarningLevel === 0 && noiseWarningLevel === 1 && (
                            <>
                                <p className="label" style={{ color: 'var(--warning)', marginBottom: '0.35rem' }}>Noise Warning 1 of 3</p>
                                <p className="t-body">Loud background noise was detected through your microphone. Please keep your environment quiet.</p>
                            </>
                        )}
                        {faceWarningLevel === 0 && fsWarningLevel === 0 && tabWarningLevel === 0 && noiseWarningLevel === 2 && (
                            <>
                                <p className="label" style={{ color: 'var(--danger)', marginBottom: '0.35rem' }}>Noise Warning 2 of 3</p>
                                <p className="t-body">One more loud noise event will auto-submit this exam. Keep the room quiet and avoid speaking.</p>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Auto-submit countdown overlay */}
            <AnimatePresence>
                {autoSubmitReason && !finishing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem' }}>
                        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 900, color: 'white', fontFamily: 'Manrope' }}>{autoSubmitCountdown}</span>
                        </div>
                        <h2 className="t-h2" style={{ color: 'white', textAlign: 'center' }}>Exam Auto-Submitting</h2>
                        <p className="t-body" style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', maxWidth: '340px' }}>{autoSubmitReason}</p>
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
        @media (max-width: 900px) {
          .test-room-shell {
            height: 100dvh !important;
          }
          .test-room-header {
            height: auto !important;
            min-height: 56px !important;
            padding: 0.5rem 0.75rem !important;
            align-items: flex-start !important;
          }
          .test-room-header > div:first-child {
            min-width: 0 !important;
            flex: 1 !important;
          }
          .test-room-header > div:first-child > div:last-child {
            min-width: 0 !important;
          }
          .test-room-header > div:first-child > div:last-child p:first-child {
            max-width: 44vw !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }
          .test-room-actions {
            gap: 0.4rem !important;
            flex-wrap: wrap !important;
            justify-content: flex-end !important;
          }
          .test-room-home,
          .test-room-actions > svg,
          .test-room-actions > div[style*="width: 1px"] {
            display: none !important;
          }
          .test-room-main {
            flex-direction: column !important;
            overflow: auto !important;
          }
          .test-room-nav {
            width: 100% !important;
            max-height: 190px !important;
            border-right: 0 !important;
            border-bottom: 1px solid var(--border) !important;
          }
          .test-room-nav-scroll {
            overflow-x: auto !important;
            overflow-y: hidden !important;
            padding: 0.75rem !important;
          }
          .test-room-question-grid {
            display: flex !important;
            gap: 0.5rem !important;
            min-width: max-content !important;
            margin-bottom: 0.75rem !important;
          }
          .test-room-question-grid button {
            width: 38px !important;
            height: 38px !important;
            aspect-ratio: auto !important;
            flex: 0 0 auto !important;
          }
          .test-room-code-layout {
            flex-direction: column !important;
            overflow: visible !important;
          }
          .test-room-code-question {
            width: 100% !important;
            max-height: none !important;
            border-right: 0 !important;
            border-bottom: 1px solid var(--border) !important;
            overflow: visible !important;
          }
          .test-room-code-question > div:first-child {
            max-height: none !important;
            overflow: visible !important;
            padding: 1rem !important;
          }
          .test-room-code-workspace {
            min-height: 620px !important;
            overflow: visible !important;
          }
          .test-room-editor-area {
            height: 360px !important;
            min-height: 360px !important;
            flex: 0 0 360px !important;
          }
          .test-room-terminal {
            height: 180px !important;
          }
          .test-room-standard-question {
            padding: 1rem 0.75rem 8rem !important;
            overflow: visible !important;
          }
          .test-room-standard-question > div {
            gap: 1rem !important;
          }
          .test-room-standard-question [style*="padding: 2rem"],
          .test-room-standard-question [style*="padding: 1.75rem"] {
            padding: 1rem !important;
          }
        }
      `}</style>
        </div>
    );
};

export default TestRoom;
