import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ShieldCheck, 
    Camera, 
    Mic,
    Maximize, 
    CheckCircle2, 
    AlertCircle, 
    Wifi, 
    ChevronRight,
    ArrowLeft
} from 'lucide-react';
import { useTests } from '../context/TestContext';
import Navbar from '../components/Layout/Navbar';

const DEFAULT_SECURITY_SETTINGS = {
    webcam: true,
    microphone: true,
    tabSwitch: true,
    fullscreen: true,
    laptopOnly: false,
};

const isMobileLikeDevice = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    return /android|iphone|ipad|ipod|mobile|windows phone|opera mini|silk\//.test(userAgent);
};

const PreTestGate: React.FC = () => {
    const { testId } = useParams<{ testId: string }>();
    const navigate = useNavigate();
    const { tests } = useTests();
    const [agreed, setAgreed] = useState(false);
    const [examCode, setExamCode] = useState('');
    const [assignmentCode, setAssignmentCode] = useState('');
    const [webcamStatus, setWebcamStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const [micStatus, setMicStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const [fsStatus, setFsStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const [internetStatus, setInternetStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const [webcamMessage, setWebcamMessage] = useState('Checking camera access...');
    const videoRef = useRef<HTMLVideoElement>(null);

    const test = tests.find(t => t.id === testId);
    const security = test?.securitySettings ?? DEFAULT_SECURITY_SETTINGS;
    const requiresExamCode = Boolean(test?.hasAccessCode || test?.accessCode);
    const blockedByDevicePolicy = security.laptopOnly && isMobileLikeDevice();

    useEffect(() => {
        if (!test) return;

        let stream: MediaStream | null = null;
        let micStream: MediaStream | null = null;

        const checkHardware = async () => {
            if (!security.webcam) {
                setWebcamStatus('success');
                setWebcamMessage('Camera not required for this exam.');
            } else {
                try {
                    if (!navigator.mediaDevices?.getUserMedia) {
                        throw new Error('This browser does not support camera access.');
                    }
                    stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    setWebcamStatus('success');
                    setWebcamMessage('Camera is active.');
                    if (videoRef.current) videoRef.current.srcObject = stream;
                } catch (err) {
                    setWebcamStatus('error');
                    const message = err instanceof Error ? err.message : 'Camera access was blocked.';
                    setWebcamMessage(message);
                }
            }

            if (!security.microphone) {
                setMicStatus('success');
            } else {
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    setMicStatus('success');
                } catch {
                    setMicStatus('error');
                } finally {
                    micStream?.getTracks().forEach((track) => track.stop());
                }
            }

            // Simple internet check
            setInternetStatus(navigator.onLine ? 'success' : 'error');
            
            // Initial fullscreen check
            if (!security.fullscreen) {
                setFsStatus('success');
            } else {
                setFsStatus(document.fullscreenElement ? 'success' : 'pending');
            }
        };

        void checkHardware();

        const handleFsChange = () => {
            if (!security.fullscreen) {
                setFsStatus('success');
                return;
            }
            setFsStatus(document.fullscreenElement ? 'success' : 'pending');
        };

        document.addEventListener('fullscreenchange', handleFsChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFsChange);
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
            if (micStream) {
                micStream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [test, security.webcam, security.microphone, security.fullscreen]);

    const enterFullscreen = async () => {
        if (!security.fullscreen) {
            setFsStatus('success');
            return;
        }
        try {
            await document.documentElement.requestFullscreen();
            setFsStatus('success');
        } catch (err) {
            setFsStatus('error');
        }
    };

    const handleStart = () => {
        const checksPassed = (!security.webcam || webcamStatus === 'success')
            && (!security.microphone || micStatus === 'success')
            && (!security.fullscreen || fsStatus === 'success');
        const hasExamCode = !requiresExamCode || Boolean(examCode.trim());

        if (!checksPassed || !agreed || !hasExamCode || !isExamOpen || blockedByDevicePolicy) return;
        sessionStorage.setItem(`etester-exam-code:${testId}`, examCode.trim());
        sessionStorage.setItem(`etester-assignment-code:${testId}`, assignmentCode.trim());
        navigate(`/test/${testId}`);
    };

    const startWarning = useMemo(() => {
        if (blockedByDevicePolicy) return 'This exam allows only laptop/desktop devices.';
        if (!agreed) return 'Accept the proctoring rules before starting.';
        if (security.webcam && webcamStatus !== 'success') return `Camera check failed: ${webcamMessage}`;
        if (security.microphone && micStatus !== 'success') return 'Enable microphone permission to start the assessment.';
        if (security.fullscreen && fsStatus !== 'success') return 'Enable fullscreen to start the assessment.';
        if (requiresExamCode && !examCode.trim()) return 'Enter the exam code to start.';
        return '';
    }, [agreed, blockedByDevicePolicy, security.webcam, security.microphone, security.fullscreen, fsStatus, webcamMessage, webcamStatus, micStatus, requiresExamCode, examCode]);

    if (!test) return null;

    const now = new Date();
    const startAt = test.startAt ? new Date(test.startAt) : null;
    const endAt = test.endAt ? new Date(test.endAt) : null;
    const isBeforeStart = Boolean(startAt && now < startAt);
    const isAfterEnd = Boolean(endAt && now > endAt);
    const isExamOpen = !isBeforeStart && !isAfterEnd;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar activeTab="dashboard" />
            
            <main className="container anim-fade-up" style={{ paddingTop: '3rem', paddingBottom: '4rem', maxWidth: '800px' }}>
                <button 
                    onClick={() => navigate('/')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', cursor: 'pointer', fontWeight: 700 }}
                >
                    <ArrowLeft size={16} /> Back to Dashboard
                </button>

                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '300px' }}>
                        <h1 className="t-hero" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Ready to start?</h1>
                        <p className="t-body" style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                            You are about to start <strong>{test.title}</strong>. Please complete the system checks and agree to the rules to proceed.
                        </p>

                        {(startAt || endAt) && (
                            <div className="card" style={{ padding: '1rem', marginBottom: '1rem', borderColor: isExamOpen ? 'var(--border)' : 'var(--warning)' }}>
                                <p className="label" style={{ marginBottom: '0.35rem' }}>Exam Schedule</p>
                                <p className="t-small" style={{ color: 'var(--text)', fontWeight: 800 }}>
                                    {startAt?.toLocaleString() ?? 'Start not set'} - {endAt?.toLocaleString() ?? 'End not set'}
                                </p>
                                {!isExamOpen && (
                                    <p className="t-small" style={{ color: 'var(--warning)', marginTop: '0.4rem', fontWeight: 800 }}>
                                        {isBeforeStart ? 'This exam has not started yet.' : 'This exam window has ended.'}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                            <h3 className="t-h3" style={{ marginBottom: '1.25rem' }}>Rules & Instructions</h3>
                            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {security.webcam && (
                                    <li style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    <ShieldCheck size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                    <span>Webcam monitoring is enabled for this exam.</span>
                                    </li>
                                )}
                                {security.microphone && (
                                    <li style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                        <Mic size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                        <span>Microphone monitoring is enabled for this exam.</span>
                                    </li>
                                )}
                                {security.fullscreen && (
                                    <li style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    <Maximize size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                    <span>Fullscreen is mandatory. Leaving fullscreen will flag your attempt.</span>
                                    </li>
                                )}
                                {security.tabSwitch && (
                                    <li style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    <AlertCircle size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                    <span>Do not switch tabs or use external resources. Multiple violations may lead to automatic failure.</span>
                                    </li>
                                )}
                                {security.laptopOnly && (
                                    <li style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                        <Wifi size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                        <span>This exam can be started only from a laptop or desktop browser.</span>
                                    </li>
                                )}
                            </ul>
                        </div>

                        <label style={{ display: 'flex', gap: '0.75rem', cursor: 'pointer', alignItems: 'center', padding: '1rem', border: '1px solid var(--border)', borderRadius: '12px', background: agreed ? 'var(--surface-raised)' : 'transparent', transition: 'all 0.2s' }}>
                            <input 
                                type="checkbox" 
                                checked={agreed} 
                                onChange={e => setAgreed(e.target.checked)}
                                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} 
                            />
                            <span className="t-small" style={{ fontWeight: 700 }}>I understand and agree to the proctoring rules.</span>
                        </label>

                        <div style={{ marginTop: '1rem' }}>
                            <p className="label" style={{ marginBottom: '0.4rem' }}>Assignment Code</p>
                            <input
                                className="input"
                                type="text"
                                placeholder="Enter the assignment code shared for you or your group"
                                value={assignmentCode}
                                onChange={(e) => setAssignmentCode(e.target.value)}
                            />
                        </div>

                        <div style={{ marginTop: '1rem' }}>
                            <p className="label" style={{ marginBottom: '0.4rem' }}>Exam Code</p>
                            <input
                                className="input"
                                type="text"
                                placeholder={requiresExamCode ? 'Enter the exam code shared by your sub-admin' : 'Exam code is not required for this test'}
                                value={examCode}
                                onChange={(e) => setExamCode(e.target.value)}
                                disabled={!requiresExamCode}
                            />
                        </div>
                    </div>

                    <div style={{ width: '300px' }}>
                        <div className="card" style={{ padding: '1.25rem', height: '100%' }}>
                            <h3 className="t-micro" style={{ textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem', fontWeight: 800 }}>System Checks</h3>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Webcam Check */}
                                <div style={{ background: 'var(--bg)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                                    {security.webcam && webcamStatus === 'success' ? (
                                        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ height: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                                            <Camera size={32} opacity={0.3} />
                                            <p className="t-micro">{security.webcam ? 'Webcam Required' : 'Webcam Optional'}</p>
                                        </div>
                                    )}
                                    <div style={{ position: 'absolute', bottom: '0.75rem', right: '0.75rem' }}>
                                        {webcamStatus === 'success' ? <CheckCircle2 color="var(--success)" /> : security.webcam ? <AlertCircle color="var(--danger)" /> : <CheckCircle2 color="var(--success)" />}
                                    </div>
                                </div>
                                {security.webcam && webcamStatus === 'error' && (
                                    <div style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                                        <p className="label" style={{ marginBottom: '0.25rem' }}>Camera Access Required</p>
                                        <p className="t-small">{webcamMessage} Allow camera permission in your browser, then refresh this page.</p>
                                    </div>
                                )}

                                {/* Fullscreen Check */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: fsStatus === 'success' ? 'var(--success-bg)' : 'transparent' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Maximize size={16} />
                                        <span className="t-small" style={{ fontWeight: 700 }}>Fullscreen</span>
                                    </div>
                                    {fsStatus === 'success' || !security.fullscreen ? (
                                        <CheckCircle2 size={18} color="var(--success)" />
                                    ) : (
                                        <button className="btn btn-sm btn-outline" onClick={enterFullscreen}>Enable</button>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: micStatus === 'success' ? 'var(--success-bg)' : 'transparent' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Mic size={16} />
                                        <span className="t-small" style={{ fontWeight: 700 }}>Microphone</span>
                                    </div>
                                    <CheckCircle2 size={18} color={micStatus === 'success' || !security.microphone ? 'var(--success)' : 'var(--danger)'} />
                                </div>

                                {/* Internet Check */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: internetStatus === 'success' ? 'var(--success-bg)' : 'transparent' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Wifi size={16} />
                                        <span className="t-small" style={{ fontWeight: 700 }}>Network</span>
                                    </div>
                                    <CheckCircle2 size={18} color={internetStatus === 'success' ? "var(--success)" : "var(--danger)"} />
                                </div>
                            </div>

                            <button 
                                className={`btn btn-lg btn-primary hover-glow ${
                                    (
                                        !agreed
                                        || (security.webcam && webcamStatus !== 'success')
                                        || (security.microphone && micStatus !== 'success')
                                        || (security.fullscreen && fsStatus !== 'success')
                                        || (requiresExamCode && !examCode.trim())
                                        || !isExamOpen
                                        || blockedByDevicePolicy
                                    ) ? 'disabled' : ''
                                }`}
                                style={{ width: '100%', marginTop: '2rem', gap: '0.5rem' }}
                                onClick={handleStart}
                                disabled={
                                    !agreed
                                    || (security.webcam && webcamStatus !== 'success')
                                    || (security.microphone && micStatus !== 'success')
                                    || (security.fullscreen && fsStatus !== 'success')
                                    || (requiresExamCode && !examCode.trim())
                                    || !isExamOpen
                                    || blockedByDevicePolicy
                                }
                            >
                                Start Assessment <ChevronRight size={18} />
                            </button>
                            {startWarning && (
                                <div style={{ marginTop: '0.875rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--warning)', background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                                    <p className="label" style={{ marginBottom: '0.25rem' }}>Cannot Start Yet</p>
                                    <p className="t-small">{startWarning}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default PreTestGate;
