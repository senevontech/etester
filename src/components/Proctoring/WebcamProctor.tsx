import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';

export interface WebcamSnapshot {
    dataUrl: string;
    capturedAt: string;
    width: number;
    height: number;
    reason: 'initial' | 'interval';
}

interface WebcamProctorProps {
    onViolation: (type: string, details: any) => void;
    onSnapshotCaptured?: (snapshot: WebcamSnapshot) => void | Promise<void>;
    onCameraStatusChange?: (status: 'online' | 'offline') => void;
    snapshotIntervalMs?: number;
}

const WebcamProctor: React.FC<WebcamProctorProps> = ({
    onViolation,
    onSnapshotCaptured,
    onCameraStatusChange,
    snapshotIntervalMs = 45000,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const cameraOffReportedRef = useRef(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isCameraOff, setIsCameraOff] = useState(false);

    const reportCameraOff = useCallback((details: Record<string, unknown>, message: string) => {
        setError(message);
        setIsCameraOff(true);
        onCameraStatusChange?.('offline');

        if (!cameraOffReportedRef.current) {
            cameraOffReportedRef.current = true;
            onViolation('camera_off', { ...details, message });
        }
    }, [onCameraStatusChange, onViolation]);

    const captureSnapshot = useCallback(async (reason: 'initial' | 'interval') => {
        const video = videoRef.current;
        if (!video || !streamRef.current || isCameraOff || !onSnapshotCaptured) return;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) return;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) return;

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.68);
        if (!dataUrl.startsWith('data:image/jpeg')) return;

        await onSnapshotCaptured({
            dataUrl,
            capturedAt: new Date().toISOString(),
            width: canvas.width,
            height: canvas.height,
            reason,
        });
    }, [isCameraOff, onSnapshotCaptured]);

    useEffect(() => {
        let active = true;

        const startCamera = async () => {
            try {
                const nextStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'user',
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                    },
                    audio: false,
                });

                if (!active) {
                    nextStream.getTracks().forEach((track) => track.stop());
                    return;
                }

                streamRef.current = nextStream;
                setStream(nextStream);
                cameraOffReportedRef.current = false;
                setError(null);
                setIsCameraOff(false);
                onCameraStatusChange?.('online');

                if (videoRef.current) {
                    videoRef.current.srcObject = nextStream;
                }
            } catch (err) {
                if (!active) return;
                reportCameraOff({ error: String(err) }, 'Camera access denied or not available.');
            }
        };

        void startCamera();

        return () => {
            active = false;
            const currentStream = streamRef.current;
            if (currentStream) {
                currentStream.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
            onCameraStatusChange?.('offline');
        };
    }, [onCameraStatusChange, reportCameraOff]);

    useEffect(() => {
        if (!stream) return;

        const handleTrackEnded = () => {
            reportCameraOff({ reason: 'track_ended' }, 'Camera stream ended unexpectedly.');
        };

        stream.getVideoTracks().forEach((track) => {
            track.addEventListener('ended', handleTrackEnded);
        });

        return () => {
            stream.getVideoTracks().forEach((track) => {
                track.removeEventListener('ended', handleTrackEnded);
            });
        };
    }, [reportCameraOff, stream]);

    useEffect(() => {
        if (!stream || isCameraOff || !onSnapshotCaptured) return;

        const kickoff = window.setTimeout(() => {
            void captureSnapshot('initial');
        }, 5000);
        const interval = window.setInterval(() => {
            void captureSnapshot('interval');
        }, snapshotIntervalMs);

        return () => {
            window.clearTimeout(kickoff);
            window.clearInterval(interval);
        };
    }, [captureSnapshot, isCameraOff, onSnapshotCaptured, snapshotIntervalMs, stream]);

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
            justifyContent: 'center',
        }}>
            {isCameraOff || error ? (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <CameraOff size={24} color="var(--danger)" style={{ marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.25rem' }}>CAMERA OFF</p>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{error || 'Camera stream unavailable.'}</p>
                </div>
            ) : (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                />
            )}

            <div style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                background: 'rgba(0,0,0,0.55)',
                borderRadius: '999px',
                padding: '2px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
            }}>
                {isCameraOff ? <CameraOff size={10} color="#fff" /> : <Camera size={10} color="#fff" />}
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCameraOff ? 'var(--danger)' : 'var(--success)' }} />
                <span style={{ fontSize: '9px', fontWeight: 800, color: 'white' }}>{isCameraOff ? 'OFFLINE' : 'LIVE'}</span>
            </div>
        </div>
    );
};

export default WebcamProctor;
