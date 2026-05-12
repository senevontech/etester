import React, { useEffect, useRef, useState } from 'react';
import { CameraOff, Users, Eye, EyeOff } from 'lucide-react';
import * as faceapi from 'face-api.js';

interface WebcamProctorProps {
    onViolation: (type: string, details: any) => void;
    onFaceViolation: (warningNumber: number) => void;
}

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
const DETECT_INTERVAL_MS = 2000;
const MULTI_FACE_DEBOUNCE_MS = 10000;
const NO_FACE_DEBOUNCE_MS = 15000;
const GAZE_VIOLATION_DEBOUNCE_MS = 20000;
const FACE_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.35,
});
// Frames that must be consecutive before logging a gaze/head violation
const SUSTAINED_FRAMES = 3;

type GazeStatus = 'ok' | 'away' | 'down' | 'up' | 'closed' | 'unknown';

// ── geometry helpers ─────────────────────────────────────────────────────────
type Pt = { x: number; y: number };
const ptDist = (a: Pt, b: Pt) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
const ptAvg = (pts: Pt[]): Pt => ({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});
// Eye Aspect Ratio — 6-point eye landmarks (p0=outer, p3=inner, rest top/bottom)
const eyeAR = (eye: Pt[]) =>
    (ptDist(eye[1], eye[5]) + ptDist(eye[2], eye[4])) / (2 * ptDist(eye[0], eye[3]));

interface HeadPose { yaw: number; pitch: number; leftEAR: number; rightEAR: number; }

function analyzeHeadPose(landmarks: faceapi.FaceLandmarks68): HeadPose {
    const p = landmarks.positions as Pt[];

    // Face-api.js 68-point layout (viewer perspective):
    //   36-41 → right eye,  42-47 → left eye
    //   27-30 → nose bridge, 30 → nose tip
    //   8     → chin tip
    const rightEye = p.slice(36, 42);
    const leftEye  = p.slice(42, 48);
    const rCenter  = ptAvg(rightEye);
    const lCenter  = ptAvg(leftEye);
    const eyeCenter = ptAvg([rCenter, lCenter]);
    const eyeDist   = ptDist(rCenter, lCenter);

    const noseTip = p[30];
    const chin    = p[8];

    // Yaw: nose-tip horizontal offset from eye-midpoint, normalised by eye separation
    // Positive → nose right of center → head turned left
    const yaw = (noseTip.x - eyeCenter.x) / eyeDist;

    // Pitch: where nose sits vertically between eyes and chin
    // Resting neutral ≈ 45 % down from eye-centre to chin
    const faceH = chin.y - eyeCenter.y;
    const expectedNoseY = eyeCenter.y + faceH * 0.45;
    const pitch = faceH > 0 ? (noseTip.y - expectedNoseY) / faceH : 0;
    // positive pitch → nose below expected → looking down

    return {
        yaw,
        pitch,
        leftEAR:  eyeAR(leftEye),
        rightEAR: eyeAR(rightEye),
    };
}

function classifyGaze({ yaw, pitch, leftEAR, rightEAR }: HeadPose): GazeStatus {
    const avgEAR = (leftEAR + rightEAR) / 2;
    if (avgEAR < 0.18)          return 'closed';   // both eyes closed
    if (Math.abs(yaw) > 0.38)   return 'away';     // head turned left/right
    if (pitch > 0.22)           return 'down';     // looking down at desk/notes
    if (pitch < -0.28)          return 'up';       // looking up (ceiling / screen-top cheating)
    return 'ok';
}

// ── component ────────────────────────────────────────────────────────────────
const WebcamProctor: React.FC<WebcamProctorProps> = ({ onViolation, onFaceViolation }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const onViolationRef = useRef(onViolation);
    const onFaceViolationRef = useRef(onFaceViolation);
    const [stream, setStream]           = useState<MediaStream | null>(null);
    const [error, setError]             = useState<string | null>(null);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [modelsLoaded, setModelsLoaded]       = useState(false);
    const [landmarksLoaded, setLandmarksLoaded] = useState(false);
    const [modelError, setModelError]   = useState(false);
    const [faceCount, setFaceCount]     = useState<number | null>(null);
    const [gazeStatus, setGazeStatus]   = useState<GazeStatus>('unknown');

    // violation debounce refs
    const multiFaceWarnCountRef  = useRef(0);
    const lastMultiFaceTimeRef   = useRef(0);
    const lastNoFaceTimeRef      = useRef(0);
    const detectionInFlightRef   = useRef(false);

    // gaze sustained-frame counters (reset to 0 on OK frame)
    const gazeStreakRef: Record<string, React.RefObject<number>> = {
        away:   useRef(0),
        down:   useRef(0),
        up:     useRef(0),
        closed: useRef(0),
    };
    const lastGazeViolTimeRef: Record<string, React.RefObject<number>> = {
        away:   useRef(0),
        down:   useRef(0),
        up:     useRef(0),
        closed: useRef(0),
    };

    useEffect(() => {
        onViolationRef.current = onViolation;
        onFaceViolationRef.current = onFaceViolation;
    }, [onViolation, onFaceViolation]);

    // ── model loading ──────────────────────────────────────────────────────
    useEffect(() => {
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
            .then(() => {
                setModelsLoaded(true);
                setModelError(false);
            })
            .catch(err => {
                setModelError(true);
                console.warn('[Proctor] face detector load failed:', err);
            });
    }, []);

    useEffect(() => {
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
            .then(() => setLandmarksLoaded(true))
            .catch(err => console.warn('[Proctor] landmark model load failed:', err));
    }, []);

    // ── camera start ───────────────────────────────────────────────────────
    useEffect(() => {
        let active = true;
        const startCamera = async () => {
            try {
                const s = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        facingMode: { ideal: 'user' },
                    },
                    audio: false,
                });
                if (!active) { s.getTracks().forEach(t => t.stop()); return; }
                setStream(s);
                if (videoRef.current) videoRef.current.srcObject = s;
                setIsCameraOff(false);
            } catch (err) {
                if (!active) return;
                setError('Camera unavailable.');
                setIsCameraOff(true);
                onViolationRef.current('camera_off', { error: String(err) });
            }
        };
        void startCamera();
        return () => { active = false; };
    }, []);

    useEffect(() => () => { stream?.getTracks().forEach(t => t.stop()); }, [stream]);

    useEffect(() => {
        if (!stream) return;
        const handle = () => { setIsCameraOff(true); onViolationRef.current('camera_off', { reason: 'track_ended' }); };
        stream.getVideoTracks().forEach(t => t.addEventListener('ended', handle));
        return () => stream.getVideoTracks().forEach(t => t.removeEventListener('ended', handle));
    }, [stream]);

    // ── detection loop ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!modelsLoaded || isCameraOff) return;

        const detect = async () => {
            const video = videoRef.current;
            if (!video || video.readyState < 2 || video.paused) return;
            if (detectionInFlightRef.current) return;
            detectionInFlightRef.current = true;

            try {
                const now = Date.now();

                // ── face count ─────────────────────────────────────────────
                let count: number;

                if (landmarksLoaded) {
                    const results = await faceapi.detectAllFaces(video, FACE_DETECTOR_OPTIONS).withFaceLandmarks();
                    count = results.length;
                    setFaceCount(count);

                    if (count === 1) {
                        // ── gaze / head-pose analysis ──────────────────────
                        const pose   = analyzeHeadPose(results[0].landmarks);
                        const status = classifyGaze(pose);
                        setGazeStatus(status);

                        if (status === 'ok') {
                            // reset all streaks
                            Object.values(gazeStreakRef).forEach(r => { r.current = 0; });
                        } else {
                            const streak = gazeStreakRef[status];
                            streak.current += 1;
                            const lastTime = lastGazeViolTimeRef[status];

                            if (streak.current >= SUSTAINED_FRAMES &&
                                now - lastTime.current > GAZE_VIOLATION_DEBOUNCE_MS) {
                                lastTime.current = now;
                                streak.current   = 0;
                                onViolationRef.current(status === 'away'   ? 'looking_away'
                                          : status === 'down'   ? 'looking_down'
                                          : status === 'up'     ? 'looking_up'
                                          :                       'eyes_closed', {
                                    yaw:   pose.yaw.toFixed(3),
                                    pitch: pose.pitch.toFixed(3),
                                    leftEAR:  pose.leftEAR.toFixed(3),
                                    rightEAR: pose.rightEAR.toFixed(3),
                                });
                            }
                        }
                    } else {
                        setGazeStatus('unknown');
                        Object.values(gazeStreakRef).forEach(r => { r.current = 0; });
                    }
                } else {
                    // landmarks not yet loaded — fall back to detection only
                    const results = await faceapi.detectAllFaces(video, FACE_DETECTOR_OPTIONS);
                    count = results.length;
                    setFaceCount(count);
                }

                // ── no-face violation ──────────────────────────────────────
                if (count === 0) {
                    if (now - lastNoFaceTimeRef.current > NO_FACE_DEBOUNCE_MS) {
                        lastNoFaceTimeRef.current = now;
                        onViolationRef.current('no_face', { faceCount: 0 });
                    }
                }

                // ── multiple-face violation ────────────────────────────────
                if (count > 1) {
                    if (now - lastMultiFaceTimeRef.current > MULTI_FACE_DEBOUNCE_MS) {
                        lastMultiFaceTimeRef.current = now;
                        multiFaceWarnCountRef.current += 1;
                        const warnNum = multiFaceWarnCountRef.current;
                        onViolationRef.current('multiple_faces', { faceCount: count, warningNumber: warnNum });
                        onFaceViolationRef.current(warnNum);
                    }
                }
            } catch {
                // skip frame on error
            } finally {
                detectionInFlightRef.current = false;
            }
        };

        const interval = window.setInterval(() => void detect(), DETECT_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [modelsLoaded, landmarksLoaded, isCameraOff]);

    // ── derived display values ─────────────────────────────────────────────
    const isAnomalous = faceCount !== null && faceCount !== 1;
    const gazeAnomalous = gazeStatus !== 'ok' && gazeStatus !== 'unknown';
    const hasBorderAlert = isAnomalous || gazeAnomalous;

    const faceLabel =
        modelError ? 'AI ERROR'
        : faceCount === null ? (modelsLoaded ? 'DETECTING...' : 'LOADING AI...')
        : faceCount === 0  ? 'NO FACE'
        : faceCount === 1  ? '1 FACE'
        : `${faceCount} FACES!`;

    const gazeLabel: Record<GazeStatus, string> = {
        ok:      'GAZE OK',
        away:    'LOOKING AWAY',
        down:    'LOOKING DOWN',
        up:      'LOOKING UP',
        closed:  'EYES CLOSED',
        unknown: '',
    };
    const gazeColor: Record<GazeStatus, string> = {
        ok:      'var(--success)',
        away:    '#f59e0b',
        down:    '#f59e0b',
        up:      '#f59e0b',
        closed:  'var(--danger)',
        unknown: 'rgba(255,255,255,0.5)',
    };

    return (
        <div className="webcam-proctor" style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            width: '210px',
            borderRadius: '12px',
            overflow: 'hidden',
            background: 'var(--surface-raised)',
            border: `2px solid ${hasBorderAlert ? 'var(--danger)' : 'var(--border)'}`,
            boxShadow: hasBorderAlert
                ? '0 0 0 3px rgba(220,53,69,0.22), var(--shadow-lg)'
                : 'var(--shadow-lg)',
            zIndex: 1000,
            transition: 'border-color 0.3s, box-shadow 0.3s',
        }}>
            {/* Video / camera-off */}
            <div style={{ position: 'relative', width: '100%', height: '148px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isCameraOff || error ? (
                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                        <CameraOff size={24} color="var(--danger)" style={{ marginBottom: '0.5rem' }} />
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>CAMERA OFF</p>
                    </div>
                ) : (
                    <video ref={videoRef} autoPlay playsInline muted
                        style={{ width: '100%', height: '148px', objectFit: 'cover', display: 'block' }} />
                )}

                {/* LIVE badge */}
                <div style={{
                    position: 'absolute', top: '8px', left: '8px',
                    background: 'rgba(0,0,0,0.55)', borderRadius: '4px', padding: '2px 6px',
                    display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCameraOff ? 'var(--danger)' : 'var(--success)', animation: isCameraOff ? 'none' : 'pulse 2s infinite' }} />
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'white' }}>LIVE</span>
                </div>

                {/* Gaze icon top-right */}
                {!isCameraOff && gazeStatus !== 'unknown' && (
                    <div style={{
                        position: 'absolute', top: '8px', right: '8px',
                        background: 'rgba(0,0,0,0.55)', borderRadius: '4px', padding: '3px',
                    }}>
                        {gazeStatus === 'ok'
                            ? <Eye size={11} color="var(--success)" />
                            : <EyeOff size={11} color={gazeStatus === 'closed' ? 'var(--danger)' : '#f59e0b'} />
                        }
                    </div>
                )}
            </div>

            {/* Status bar */}
            {!isCameraOff && (
                <div style={{
                    background: 'rgba(0,0,0,0.82)',
                    padding: '5px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                }}>
                    {/* Face count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {faceCount !== null && faceCount !== 1 && (
                            faceCount === 0
                                ? <CameraOff size={9} color="var(--danger)" />
                                : <Users size={9} color="var(--danger)" />
                        )}
                        <span style={{
                            fontSize: '9px', fontWeight: 800,
                            color: faceCount === 1 ? 'var(--success)' : faceCount === null ? 'rgba(255,255,255,0.6)' : 'var(--danger)',
                        }}>{faceLabel}</span>
                    </div>

                    {/* Divider */}
                    {gazeStatus !== 'unknown' && <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.2)' }} />}

                    {/* Gaze status */}
                    {gazeStatus !== 'unknown' && (
                        <span style={{ fontSize: '9px', fontWeight: 800, color: gazeColor[gazeStatus] }}>
                            {gazeLabel[gazeStatus]}
                        </span>
                    )}
                </div>
            )}
            <style>{`
                @media (max-width: 900px) {
                    .webcam-proctor {
                        width: 132px !important;
                        right: 0.75rem !important;
                        bottom: 0.75rem !important;
                        border-radius: 10px !important;
                    }
                    .webcam-proctor video,
                    .webcam-proctor > div:first-child {
                        height: 92px !important;
                    }
                    .webcam-proctor span {
                        font-size: 8px !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default WebcamProctor;
