import React, { useEffect, useRef, useState } from 'react';
import { Shield, AlertTriangle, Camera, CameraOff, Images } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Violation } from '../../hooks/useProctoring';

interface ProctorOverlayProps {
    violations: Violation[];
    cameraStatus: 'pending' | 'online' | 'offline';
    evidenceCount: number;
    lastEvidenceAt: string | null;
}

const ProctorOverlay: React.FC<ProctorOverlayProps> = ({
    violations,
    cameraStatus,
    evidenceCount,
    lastEvidenceAt,
}) => {
    const [showBanner, setShowBanner] = useState(false);
    const lastCount = useRef(0);
    const latest = violations[violations.length - 1];
    const score = Math.max(0, 100 - violations.length * 5);

    useEffect(() => {
        if (violations.length > lastCount.current) {
            setShowBanner(true);
            const timer = window.setTimeout(() => setShowBanner(false), 4500);
            lastCount.current = violations.length;
            return () => window.clearTimeout(timer);
        }
    }, [violations]);

    const cameraTone = cameraStatus === 'online' ? 'var(--success)' : cameraStatus === 'offline' ? 'var(--danger)' : 'var(--warning)';
    const cameraLabel = cameraStatus === 'online' ? 'Camera online' : cameraStatus === 'offline' ? 'Camera offline' : 'Camera starting';

    return (
        <div style={{ position: 'fixed', bottom: '11.75rem', right: '1.25rem', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.625rem', pointerEvents: 'none' }}>
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ pointerEvents: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: 'var(--shadow-sm)', minWidth: '220px' }}
            >
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: cameraStatus === 'offline' ? 'var(--danger-bg)' : 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {cameraStatus === 'offline' ? <CameraOff size={15} style={{ color: cameraTone }} /> : <Camera size={15} style={{ color: cameraTone }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, marginBottom: '3px' }}>Reviewable Evidence</p>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{cameraLabel}</p>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.35 }}>
                        {evidenceCount > 0
                            ? `${evidenceCount} snapshot${evidenceCount === 1 ? '' : 's'} captured${lastEvidenceAt ? `, last at ${new Date(lastEvidenceAt).toLocaleTimeString()}` : ''}`
                            : 'Waiting for first server-backed snapshot.'}
                    </p>
                </div>
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '0.65rem', textAlign: 'right' }}>
                    <p style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, marginBottom: '3px' }}>Frames</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                        <Images size={12} style={{ color: evidenceCount > 0 ? 'var(--text)' : 'var(--text-muted)' }} />
                        <p style={{ fontSize: '13px', fontWeight: 900, color: evidenceCount > 0 ? 'var(--text)' : 'var(--text-muted)', lineHeight: 1 }}>{evidenceCount}</p>
                    </div>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ pointerEvents: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: 'var(--shadow-sm)', minWidth: '180px' }}
            >
                <Shield size={14} style={{ color: violations.length > 2 ? 'var(--danger)' : 'var(--success)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, marginBottom: '2px' }}>Integrity</p>
                    <p style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{score}%</p>
                </div>
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '0.5rem', textAlign: 'right' }}>
                    <p style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, marginBottom: '2px' }}>Flags</p>
                    <p style={{ fontSize: '13px', fontWeight: 900, color: violations.length > 0 ? 'var(--danger)' : 'var(--text)', lineHeight: 1 }}>{violations.length}</p>
                </div>
            </motion.div>

            <AnimatePresence>
                {showBanner && latest && (
                    <motion.div
                        initial={{ opacity: 0, x: 20, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20 }}
                        style={{ pointerEvents: 'auto', background: 'var(--bg)', border: '1px solid var(--danger)', borderRadius: '10px', padding: '0.75rem 1rem', maxWidth: '260px', boxShadow: 'var(--shadow)' }}
                    >
                        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
                            </div>
                            <div>
                                <p style={{ fontSize: '10px', fontWeight: 900, color: 'var(--danger)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '3px' }}>Violation</p>
                                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: '4px' }}>{latest.message}</p>
                                <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{latest.timestamp}</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ProctorOverlay;

