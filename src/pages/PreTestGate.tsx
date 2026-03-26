import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ShieldCheck, 
    Camera, 
    Maximize, 
    CheckCircle2, 
    AlertCircle, 
    Wifi, 
    ChevronRight,
    ArrowLeft
} from 'lucide-react';
import { useTests } from '../context/TestContext';
import Navbar from '../components/Layout/Navbar';

const PreTestGate: React.FC = () => {
    const { testId } = useParams<{ testId: string }>();
    const navigate = useNavigate();
    const { tests } = useTests();
    const [agreed, setAgreed] = useState(false);
    const [webcamStatus, setWebcamStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const [fsStatus, setFsStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const [internetStatus, setInternetStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const videoRef = useRef<HTMLVideoElement>(null);

    const test = tests.find(t => t.id === testId);

    useEffect(() => {
        const checkHardware = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                setWebcamStatus('success');
                if (videoRef.current) videoRef.current.srcObject = stream;
            } catch (err) {
                setWebcamStatus('error');
            }

            // Simple internet check
            setInternetStatus(navigator.onLine ? 'success' : 'error');
            
            // Initial fullscreen check
            setFsStatus(document.fullscreenElement ? 'success' : 'pending');
        };

        void checkHardware();

        const handleFsChange = () => {
            setFsStatus(document.fullscreenElement ? 'success' : 'pending');
        };

        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    const enterFullscreen = async () => {
        try {
            await document.documentElement.requestFullscreen();
            setFsStatus('success');
        } catch (err) {
            setFsStatus('error');
        }
    };

    const handleStart = () => {
        if (webcamStatus !== 'success' || fsStatus !== 'success' || !agreed) return;
        navigate(`/test/${testId}`);
    };

    if (!test) return null;

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

                        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                            <h3 className="t-h3" style={{ marginBottom: '1.25rem' }}>Rules & Instructions</h3>
                            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <li style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    <ShieldCheck size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                    <span>This session is <strong>proctored</strong>. Webcam and screen activity are monitored.</span>
                                </li>
                                <li style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    <Maximize size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                    <span>Fullscreen is mandatory. Leaving fullscreen will flag your attempt.</span>
                                </li>
                                <li style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    <AlertCircle size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                    <span>Do not switch tabs or use external resources. Multiple violations may lead to automatic failure.</span>
                                </li>
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
                    </div>

                    <div style={{ width: '300px' }}>
                        <div className="card" style={{ padding: '1.25rem', height: '100%' }}>
                            <h3 className="t-micro" style={{ textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem', fontWeight: 800 }}>System Checks</h3>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Webcam Check */}
                                <div style={{ background: 'var(--bg)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                                    {webcamStatus === 'success' ? (
                                        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ height: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                                            <Camera size={32} opacity={0.3} />
                                            <p className="t-micro">Webcam Required</p>
                                        </div>
                                    )}
                                    <div style={{ position: 'absolute', bottom: '0.75rem', right: '0.75rem' }}>
                                        {webcamStatus === 'success' ? <CheckCircle2 color="var(--success)" /> : <AlertCircle color="var(--danger)" />}
                                    </div>
                                </div>

                                {/* Fullscreen Check */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: fsStatus === 'success' ? 'var(--success-bg)' : 'transparent' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Maximize size={16} />
                                        <span className="t-small" style={{ fontWeight: 700 }}>Fullscreen</span>
                                    </div>
                                    {fsStatus === 'success' ? (
                                        <CheckCircle2 size={18} color="var(--success)" />
                                    ) : (
                                        <button className="btn btn-sm btn-outline" onClick={enterFullscreen}>Enable</button>
                                    )}
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
                                className={`btn btn-lg btn-primary hover-glow ${(!agreed || webcamStatus !== 'success' || fsStatus !== 'success') ? 'disabled' : ''}`}
                                style={{ width: '100%', marginTop: '2rem', gap: '0.5rem' }}
                                onClick={handleStart}
                                disabled={!agreed || webcamStatus !== 'success' || fsStatus !== 'success'}
                            >
                                Start Assessment <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default PreTestGate;
