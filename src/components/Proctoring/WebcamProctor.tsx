import React, { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';

interface WebcamProctorProps {
    onViolation: (type: string, details: any) => void;
}

const WebcamProctor: React.FC<WebcamProctorProps> = ({ onViolation }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isCameraOff, setIsCameraOff] = useState(false);

    useEffect(() => {
        let active = true;

        const startCamera = async () => {
            try {
                const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                if (active) {
                    setStream(s);
                    if (videoRef.current) {
                        videoRef.current.srcObject = s;
                    }
                    setIsCameraOff(false);
                }
            } catch (err) {
                if (active) {
                    setError('Camera access denied or not available.');
                    setIsCameraOff(true);
                    onViolation('camera_off', { error: String(err) });
                }
            }
        };

        void startCamera();

        return () => {
            active = false;
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Monitor for track loss
    useEffect(() => {
        if (!stream) return;

        const handleTrackEnded = () => {
            setIsCameraOff(true);
            onViolation('camera_off', { reason: 'track_ended' });
        };

        stream.getVideoTracks().forEach(track => {
            track.addEventListener('ended', handleTrackEnded);
        });

        return () => {
            stream.getVideoTracks().forEach(track => {
                track.removeEventListener('ended', handleTrackEnded);
            });
        };
    }, [stream, onViolation]);

    return (
        <div style={{ 
            position: 'fixed', 
            bottom: '1.5rem', 
            right: '1.5rem', 
            width: '200px', 
            height: '150px', 
            borderRadius: '12px', 
            overflow: 'hidden', 
            background: 'var(--surface-raised)', 
            border: '2px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            {isCameraOff || error ? (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <CameraOff size={24} color="var(--danger)" style={{ marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>CAMERA OFF</p>
                </div>
            ) : (
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
            )}
            
            <div style={{ 
                position: 'absolute', 
                top: '8px', 
                left: '8px', 
                background: 'rgba(0,0,0,0.5)', 
                borderRadius: '4px', 
                padding: '2px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCameraOff ? 'var(--danger)' : 'var(--success)' }} />
                <span style={{ fontSize: '9px', fontWeight: 800, color: 'white' }}>LIVE</span>
            </div>
        </div>
    );
};

export default WebcamProctor;
