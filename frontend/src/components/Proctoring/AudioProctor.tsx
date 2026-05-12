import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, VolumeX } from 'lucide-react';

interface AudioProctorProps {
    onViolation: (type: string, details: Record<string, unknown>) => void;
    onNoiseViolation: (warningNumber: number) => void;
}

const SAMPLE_INTERVAL_MS = 250;
const BASE_NOISE_THRESHOLD = 0.018;
const BASE_PEAK_THRESHOLD = 0.1;
const SUSTAINED_SAMPLE_COUNT = 4;
const NOISE_DEBOUNCE_MS = 7000;
const CALIBRATION_SAMPLES = 10;

const AudioProctor: React.FC<AudioProctorProps> = ({ onViolation, onNoiseViolation }) => {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [micActive, setMicActive] = useState(false);
    const [currentLevel, setCurrentLevel] = useState(0);
    const [noiseActive, setNoiseActive] = useState(false);
    const [isCalibrating, setIsCalibrating] = useState(true);
    const [isAudioPaused, setIsAudioPaused] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onViolationRef = useRef(onViolation);
    const onNoiseViolationRef = useRef(onNoiseViolation);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const noiseStreakRef = useRef(0);
    const warningCountRef = useRef(0);
    const lastNoiseTimeRef = useRef(0);
    const calibrationCountRef = useRef(0);
    const ambientRmsRef = useRef(BASE_NOISE_THRESHOLD);
    const ambientPeakRef = useRef(BASE_PEAK_THRESHOLD);

    useEffect(() => {
        onViolationRef.current = onViolation;
        onNoiseViolationRef.current = onNoiseViolation;
    }, [onViolation, onNoiseViolation]);

    useEffect(() => {
        let active = true;

        const startMic = async () => {
            try {
                const rawAudioConstraints: MediaTrackConstraints = {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: true,
                };

                let media: MediaStream;
                try {
                    media = await navigator.mediaDevices.getUserMedia({
                        audio: rawAudioConstraints,
                        video: false,
                    });
                } catch {
                    media = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: false,
                    });
                }

                if (!active) {
                    media.getTracks().forEach((track) => track.stop());
                    return;
                }

                const audioContext = new window.AudioContext();
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048;
                analyser.smoothingTimeConstant = 0.5;

                const source = audioContext.createMediaStreamSource(media);
                source.connect(analyser);

                audioContextRef.current = audioContext;
                analyserRef.current = analyser;
                dataArrayRef.current = new Uint8Array(analyser.fftSize);
                calibrationCountRef.current = 0;
                ambientRmsRef.current = BASE_NOISE_THRESHOLD;
                ambientPeakRef.current = BASE_PEAK_THRESHOLD;

                setStream(media);
                setMicActive(true);
                setNoiseActive(false);
                setIsCalibrating(true);
                setIsAudioPaused(audioContext.state === 'suspended');
                setError(null);
            } catch (err) {
                if (!active) return;
                setMicActive(false);
                setNoiseActive(false);
                setIsCalibrating(false);
                setIsAudioPaused(false);
                setError('Microphone unavailable.');
                onViolationRef.current('microphone_off', { error: String(err) });
            }
        };

        void startMic();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const resumeAudio = () => {
            if (audioContextRef.current?.state === 'suspended') {
                void audioContextRef.current.resume().then(() => setIsAudioPaused(false));
            }
        };

        window.addEventListener('pointerdown', resumeAudio);
        window.addEventListener('keydown', resumeAudio);
        document.addEventListener('visibilitychange', resumeAudio);

        return () => {
            window.removeEventListener('pointerdown', resumeAudio);
            window.removeEventListener('keydown', resumeAudio);
            document.removeEventListener('visibilitychange', resumeAudio);
        };
    }, []);

    useEffect(() => {
        if (!stream) return;

        const handleEnded = () => {
            setMicActive(false);
            setNoiseActive(false);
            setIsCalibrating(false);
            setIsAudioPaused(false);
            onViolationRef.current('microphone_off', { reason: 'track_ended' });
        };

        stream.getAudioTracks().forEach((track) => track.addEventListener('ended', handleEnded));
        return () => {
            stream.getAudioTracks().forEach((track) => track.removeEventListener('ended', handleEnded));
        };
    }, [stream]);

    useEffect(() => {
        if (!micActive || !analyserRef.current || !dataArrayRef.current) return;

        const sample = () => {
            const analyser = analyserRef.current;
            const dataArray = dataArrayRef.current;
            if (!analyser || !dataArray) return;
            if (audioContextRef.current?.state === 'suspended') {
                void audioContextRef.current.resume();
                setIsAudioPaused(true);
                return;
            }
            setIsAudioPaused(false);

            analyser.getByteTimeDomainData(dataArray);

            let sumSquares = 0;
            let peak = 0;
            for (let i = 0; i < dataArray.length; i += 1) {
                const normalized = (dataArray[i] - 128) / 128;
                sumSquares += normalized * normalized;
                peak = Math.max(peak, Math.abs(normalized));
            }

            const rms = Math.sqrt(sumSquares / dataArray.length);
            const displayLevel = Math.max(rms, peak * 0.35);
            setCurrentLevel(displayLevel);

            if (calibrationCountRef.current < CALIBRATION_SAMPLES) {
                calibrationCountRef.current += 1;
                ambientRmsRef.current = ambientRmsRef.current * 0.75 + rms * 0.25;
                ambientPeakRef.current = ambientPeakRef.current * 0.75 + peak * 0.25;
                setIsCalibrating(calibrationCountRef.current < CALIBRATION_SAMPLES);
                setNoiseActive(false);
                noiseStreakRef.current = 0;
                return;
            }

            const noiseThreshold = Math.max(BASE_NOISE_THRESHOLD, ambientRmsRef.current * 2.8);
            const peakThreshold = Math.max(BASE_PEAK_THRESHOLD, ambientPeakRef.current * 2.2);
            const detected = rms >= noiseThreshold || peak >= peakThreshold;
            setNoiseActive(detected);

            const now = Date.now();
            if (detected) {
                noiseStreakRef.current += 1;

                if (
                    noiseStreakRef.current >= SUSTAINED_SAMPLE_COUNT &&
                    now - lastNoiseTimeRef.current > NOISE_DEBOUNCE_MS
                ) {
                    lastNoiseTimeRef.current = now;
                    noiseStreakRef.current = 0;
                    warningCountRef.current += 1;

                    onViolationRef.current('loud_noise', {
                        level: Number(rms.toFixed(4)),
                        peak: Number(peak.toFixed(4)),
                        threshold: Number(noiseThreshold.toFixed(4)),
                        peakThreshold: Number(peakThreshold.toFixed(4)),
                        warningNumber: warningCountRef.current,
                    });
                    onNoiseViolationRef.current(warningCountRef.current);
                }
            } else {
                noiseStreakRef.current = 0;
                ambientRmsRef.current = ambientRmsRef.current * 0.96 + rms * 0.04;
                ambientPeakRef.current = ambientPeakRef.current * 0.96 + peak * 0.04;
            }
        };

        const interval = window.setInterval(sample, SAMPLE_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [micActive]);

    useEffect(() => {
        return () => {
            stream?.getTracks().forEach((track) => track.stop());
            if (audioContextRef.current) {
                void audioContextRef.current.close();
            }
        };
    }, [stream]);

    const normalizedLevel = Math.min(100, Math.round(currentLevel * 1000));
    const statusLabel = !micActive
        ? (error ?? 'MIC OFF')
        : isAudioPaused
        ? 'TAP TO ENABLE'
        : isCalibrating
        ? 'CALIBRATING'
        : noiseActive
        ? 'NOISE DETECTED'
        : 'QUIET';
    const statusColor = !micActive
        ? 'var(--danger)'
        : isAudioPaused || noiseActive
        ? '#f59e0b'
        : 'var(--text)';

    return (
        <div className="audio-proctor" style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '14.5rem',
            width: '180px',
            borderRadius: '12px',
            overflow: 'hidden',
            background: 'var(--surface-raised)',
            border: `2px solid ${noiseActive || isAudioPaused || !micActive ? 'var(--danger)' : 'var(--border)'}`,
            boxShadow: noiseActive || isAudioPaused || !micActive
                ? '0 0 0 3px rgba(220,53,69,0.18), var(--shadow-lg)'
                : 'var(--shadow-lg)',
            zIndex: 1000,
            transition: 'border-color 0.3s, box-shadow 0.3s',
        }}>
            <div style={{ padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: !micActive ? 'var(--danger-bg)' : noiseActive || isAudioPaused ? 'rgba(245,158,11,0.16)' : 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    {!micActive ? <MicOff size={16} style={{ color: 'var(--danger)' }} /> : noiseActive || isAudioPaused ? <VolumeX size={16} style={{ color: '#f59e0b' }} /> : <Mic size={16} style={{ color: 'var(--success)' }} />}
                </div>
                <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>MIC SECURITY</p>
                    <p style={{ fontSize: '12px', fontWeight: 800, color: statusColor }}>
                        {statusLabel}
                    </p>
                </div>
            </div>

            <div style={{ padding: '0 1rem 1rem' }}>
                <div style={{
                    width: '100%',
                    height: '8px',
                    borderRadius: '999px',
                    background: 'var(--bg-subtle)',
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                }}>
                    <div style={{
                        width: `${normalizedLevel}%`,
                        height: '100%',
                        background: !micActive ? 'var(--danger)' : noiseActive || isAudioPaused ? '#f59e0b' : 'var(--success)',
                        transition: 'width 0.2s ease',
                    }} />
                </div>
                <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)' }}>LEVEL</span>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: noiseActive || isAudioPaused ? '#f59e0b' : 'var(--text-muted)' }}>
                        {micActive ? `${normalizedLevel}%` : 'OFF'}
                    </span>
                </div>
            </div>
            <style>{`
                @media (max-width: 900px) {
                    .audio-proctor {
                        width: 132px !important;
                        right: 0.75rem !important;
                        bottom: 7.25rem !important;
                        border-radius: 10px !important;
                    }
                    .audio-proctor > div:first-child {
                        padding: 0.65rem !important;
                        gap: 0.5rem !important;
                    }
                    .audio-proctor > div:first-child > div:first-child {
                        width: 28px !important;
                        height: 28px !important;
                    }
                    .audio-proctor p {
                        font-size: 9px !important;
                    }
                    .audio-proctor > div:last-of-type {
                        padding: 0 0.65rem 0.65rem !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default AudioProctor;
