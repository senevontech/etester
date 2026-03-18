import { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Shield, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Violation } from '../../hooks/useProctoring';

interface ProctorOverlayProps {
    violations: Violation[];
}

const ProctorOverlay: React.FC<ProctorOverlayProps> = ({ violations }) => {
    const [showBanner, setShowBanner] = useState(false);
    const lastCount = useRef(0);
    const latest = violations[violations.length - 1];
    const score = Math.max(0, 100 - violations.length * 5);

    useEffect(() => {
        if (violations.length > lastCount.current) {
            setShowBanner(true);
            const t = setTimeout(() => setShowBanner(false), 4500);
            lastCount.current = violations.length;
            return () => clearTimeout(t);
        }
    }, [violations]);

    return (
        <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.625rem', pointerEvents: 'none' }}>

            {/* Webcam chip */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                style={{ width: '160px', height: '110px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-strong)', background: 'var(--surface)', position: 'relative', pointerEvents: 'auto', boxShadow: 'var(--shadow)' }}>
                <div style={{ position: 'absolute', top: '6px', left: '6px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', borderRadius: '100px', padding: '2px 7px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#e74c3c', animation: 'lp 1.5s infinite', display: 'inline-block' }} />
                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#fff', letterSpacing: '0.05em', fontFamily: 'Manrope' }}>LIVE</span>
                </div>
                <Webcam audio={false} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} screenshotFormat="image/jpeg" videoConstraints={{ width: 240, height: 180, facingMode: 'user' }} />
            </motion.div>

            {/* Integrity chip */}
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                style={{ pointerEvents: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: 'var(--shadow-sm)', minWidth: '160px' }}>
                <Shield size={14} style={{ color: violations.length > 2 ? 'var(--danger)' : 'var(--success)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, marginBottom: '2px', fontFamily: 'Manrope' }}>Integrity</p>
                    <p style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', lineHeight: 1, fontFamily: 'Manrope' }}>{score}%</p>
                </div>
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '0.5rem', textAlign: 'right' }}>
                    <p style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, marginBottom: '2px', fontFamily: 'Manrope' }}>Flags</p>
                    <p style={{ fontSize: '13px', fontWeight: 900, color: violations.length > 0 ? 'var(--danger)' : 'var(--text)', lineHeight: 1, fontFamily: 'Manrope' }}>{violations.length}</p>
                </div>
            </motion.div>

            {/* Violation toast */}
            <AnimatePresence>
                {showBanner && latest && (
                    <motion.div initial={{ opacity: 0, x: 20, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20 }}
                        style={{ pointerEvents: 'auto', background: 'var(--bg)', border: '1px solid var(--danger)', borderRadius: '10px', padding: '0.75rem 1rem', maxWidth: '260px', boxShadow: 'var(--shadow)' }}>
                        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
                            </div>
                            <div>
                                <p style={{ fontSize: '10px', fontWeight: 900, color: 'var(--danger)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '3px', fontFamily: 'Manrope' }}>Violation</p>
                                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: '4px', fontFamily: 'Manrope' }}>{latest.message}</p>
                                <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'Manrope' }}>{latest.timestamp}</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`@keyframes lp{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        </div>
    );
};

export default ProctorOverlay;
