import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowLeft,
    Camera,
    CameraOff,
    Mic,
    MicOff,
    MonitorUp,
    PhoneOff,
    ShieldAlert,
    Users,
    Video,
} from 'lucide-react';
import Navbar from '../../components/Layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { useProctoring } from '../../hooks/useProctoring';
import { ApiError, apiRequest } from '../../lib/api';

type InterviewStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
type RoomMode = 'group' | 'individual';
type SignalType = 'peer-joined' | 'peer-left' | 'offer' | 'answer' | 'ice-candidate' | 'media-state';

interface ApiInterview {
    id: string;
    title: string;
    candidate_name: string;
    candidate_email: string;
    description: string;
    scheduled_at: string;
    duration_minutes: number;
    meeting_url: string;
    interview_code: string;
    allow_screen_share: boolean;
    enable_integrity_monitoring: boolean;
    room_mode: RoomMode;
    status: InterviewStatus;
}

interface ApiSignal {
    id: string;
    sender_client_id: string;
    sender_name: string;
    target_client_id: string | null;
    type: SignalType;
    payload: Record<string, unknown>;
    created_at: string;
}

interface RemotePeer {
    clientId: string;
    name: string;
    stream: MediaStream;
    audioEnabled: boolean;
    videoEnabled: boolean;
    screenSharing: boolean;
}

const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Not scheduled';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const createClientId = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeInterviewCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

const isSessionDescription = (value: unknown): value is RTCSessionDescriptionInit => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as RTCSessionDescriptionInit;
    return candidate.type === 'offer' || candidate.type === 'answer';
};

const isIceCandidate = (value: unknown): value is RTCIceCandidateInit => {
    return Boolean(value && typeof value === 'object');
};

const toIceServer = (value: unknown): RTCIceServer | null => {
    if (typeof value === 'string') {
        const url = value.trim();
        return url ? { urls: url } : null;
    }

    if (!value || typeof value !== 'object') return null;
    const source = value as { urls?: unknown; username?: unknown; credential?: unknown };
    const urls = typeof source.urls === 'string'
        ? source.urls.trim()
        : Array.isArray(source.urls)
            ? source.urls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
            : null;

    if (!urls || (Array.isArray(urls) && urls.length === 0)) return null;

    return {
        urls,
        username: typeof source.username === 'string' ? source.username : undefined,
        credential: typeof source.credential === 'string' ? source.credential : undefined,
    };
};

const getIceServers = (): RTCIceServer[] => {
    const raw = String(import.meta.env.VITE_INTERVIEW_ICE_SERVERS || '').trim();
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        const values = Array.isArray(parsed) ? parsed : [parsed];
        return values.map(toIceServer).filter((server): server is RTCIceServer => Boolean(server));
    } catch {
        return raw.split(',').map(toIceServer).filter((server): server is RTCIceServer => Boolean(server));
    }
};

const ICE_SERVERS = getIceServers();

const InterviewJoin: React.FC = () => {
    const { code = '' } = useParams();
    const { user } = useAuth();
    const [interview, setInterview] = useState<ApiInterview | null>(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [joined, setJoined] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [guestName, setGuestName] = useState('');

    const proctoringActive = joined && Boolean(interview?.enable_integrity_monitoring);
    const { violations, tabSwitchCount, enterFullscreen, isFullscreen } = useProctoring(proctoringActive, {
        tabSwitch: true,
        fullscreen: false,
    });

    const backLink = useMemo(() => {
        if (user?.role === 'admin') return '/admin/interviews';
        if (user?.role === 'subadmin') return '/subadmin/interviews';
        return user ? '/dashboard' : '/';
    }, [user]);

    const displayName = user?.name || user?.email || guestName.trim();

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const normalizedCode = normalizeInterviewCode(code);
                const data = await apiRequest<{ interview: ApiInterview }>(`/interviews/code/${encodeURIComponent(normalizedCode)}`);
                setInterview(data.interview);
            } catch (err) {
                if (err instanceof ApiError && err.status === 404) {
                    setError('Interview code not found. Check the code and try again.');
                } else {
                    setError(err instanceof Error ? err.message : 'Interview not found.');
                }
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, [code]);

    const joinInterview = async () => {
        if (!interview) return;
        if (!displayName) {
            setError('Enter your name to join the video room.');
            return;
        }
        setJoining(true);
        setError(null);
        try {
            setJoined(true);
            if (interview.enable_integrity_monitoring) void enterFullscreen();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not join interview.');
        } finally {
            setJoining(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar />
            <main className="container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
                <Link className="btn btn-sm btn-ghost" to={backLink} style={{ marginBottom: '1rem', gap: '0.35rem' }}>
                    <ArrowLeft size={14} /> Back
                </Link>

                {loading ? (
                    <div className="card" style={{ padding: '1.25rem' }}>Loading interview...</div>
                ) : error && !interview ? (
                    <div className="card" style={{ padding: '1.25rem', background: 'var(--danger-bg)', borderColor: 'var(--danger)' }}>
                        <p style={{ color: 'var(--danger)', fontWeight: 800 }}>{error}</p>
                    </div>
                ) : interview ? (
                    <section className="interview-room-shell" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)', gap: '1rem', alignItems: 'start' }}>
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.45rem' }}>{interview.interview_code}</p>
                            <h1 className="t-h1" style={{ marginBottom: '0.6rem' }}>{interview.title}</h1>
                            <p className="t-body" style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                {formatDateTime(interview.scheduled_at)} - {interview.duration_minutes} minutes - {interview.room_mode === 'individual' ? 'Individual room' : 'Shared video room'}
                            </p>

                            {interview.description && (
                                <p className="t-body" style={{ marginBottom: '1rem' }}>{interview.description}</p>
                            )}

                            {!joined ? (
                                <div style={{ display: 'grid', gap: '0.85rem', maxWidth: 360 }}>
                                    {!user && (
                                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                                            <span className="label">Your Name</span>
                                            <input
                                                className="input"
                                                value={guestName}
                                                onChange={event => setGuestName(event.target.value)}
                                                placeholder="Enter your name"
                                                autoComplete="name"
                                            />
                                        </label>
                                    )}
                                    <button className="btn btn-md btn-primary" onClick={() => void joinInterview()} disabled={joining || !displayName}>
                                        <Video size={16} /> {joining ? 'Joining...' : 'Join Video Room'}
                                    </button>
                                </div>
                            ) : (
                                <InterviewVideoRoom
                                    interview={interview}
                                    displayName={displayName}
                                    onError={setError}
                                />
                            )}

                            {error && (
                                <div style={{ marginTop: '1rem', color: 'var(--danger)', fontWeight: 800 }} className="t-small">{error}</div>
                            )}
                        </div>

                        <aside className="card" style={{ padding: '1rem 1.125rem' }}>
                            <h2 className="t-h3" style={{ marginBottom: '0.85rem' }}>Session Controls</h2>
                            <ControlRow icon={MonitorUp} label="Screen sharing" value={interview.allow_screen_share ? 'Allowed by interviewer' : 'Blocked by interviewer'} />
                            <ControlRow icon={ShieldAlert} label="Integrity monitoring" value={interview.enable_integrity_monitoring ? 'Enabled' : 'Disabled'} />
                            <ControlRow icon={Users} label="Room" value={interview.room_mode === 'individual' ? 'Individual interview room' : 'Shared video room'} />

                            {proctoringActive && (
                                <div style={{ marginTop: '1rem', padding: '0.85rem', background: 'var(--warning-bg)', border: '1px solid var(--warning)' }}>
                                    <p className="label" style={{ color: 'var(--warning)', marginBottom: '0.35rem' }}>Integrity Active</p>
                                    <p className="t-small" style={{ color: 'var(--text-2)' }}>Tab switches: {tabSwitchCount} - Fullscreen: {isFullscreen ? 'on' : 'optional'}</p>
                                    {violations.length > 0 && (
                                        <p className="t-small" style={{ color: 'var(--danger)', marginTop: '0.35rem', fontWeight: 800 }}>
                                            <AlertTriangle size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {violations.length} event{violations.length === 1 ? '' : 's'} recorded locally
                                        </p>
                                    )}
                                </div>
                            )}
                        </aside>
                    </section>
                ) : null}
            </main>

            <style>{`
                @media (max-width: 900px) {
                    .interview-room-shell {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </div>
    );
};

const InterviewVideoRoom: React.FC<{
    interview: ApiInterview;
    displayName: string;
    onError: (message: string | null) => void;
}> = ({ interview, displayName, onError }) => {
    const clientIdRef = useRef(createClientId());
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const processedSignalsRef = useRef<Set<string>>(new Set());
    const pollSinceRef = useRef(new Date(Date.now() - 1_000).toISOString());
    const mountedRef = useRef(true);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [screenSharing, setScreenSharing] = useState(false);
    const [roomError, setRoomError] = useState<string | null>(null);

    const clientId = clientIdRef.current;

    const sendSignal = useCallback(async (type: SignalType, payload: Record<string, unknown> = {}, targetClientId?: string) => {
        await apiRequest(`/interviews/${interview.id}/signals`, {
            method: 'POST',
            body: {
                clientId,
                displayName,
                targetClientId,
                type,
                payload,
            },
        });
    }, [clientId, displayName, interview.id]);

    const publishMediaState = useCallback(() => {
        void sendSignal('media-state', {
            displayName,
            audioEnabled,
            videoEnabled,
            screenSharing,
        });
    }, [audioEnabled, displayName, screenSharing, sendSignal, videoEnabled]);

    const removePeer = useCallback((peerClientId: string) => {
        const connection = peerConnectionsRef.current.get(peerClientId);
        if (connection) connection.close();
        peerConnectionsRef.current.delete(peerClientId);
        remoteStreamsRef.current.delete(peerClientId);
        pendingCandidatesRef.current.delete(peerClientId);
        setRemotePeers(prev => prev.filter(peer => peer.clientId !== peerClientId));
    }, []);

    const flushPendingCandidates = useCallback(async (peerClientId: string, connection: RTCPeerConnection) => {
        const pending = pendingCandidatesRef.current.get(peerClientId) ?? [];
        pendingCandidatesRef.current.delete(peerClientId);
        for (const candidate of pending) {
            try {
                await connection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {
                // Dropping stale candidates is safer than breaking the room.
            }
        }
    }, []);

    const createPeerConnection = useCallback((peerClientId: string, peerName: string) => {
        const existing = peerConnectionsRef.current.get(peerClientId);
        if (existing) return existing;

        const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        const stream = localStreamRef.current;
        const sharedVideoTrack = screenStreamRef.current?.getVideoTracks()[0] ?? stream?.getVideoTracks()[0];
        stream?.getAudioTracks().forEach(track => connection.addTrack(track, stream));
        if (stream && sharedVideoTrack) connection.addTrack(sharedVideoTrack, stream);

        connection.onicecandidate = (event) => {
            if (event.candidate) {
                void sendSignal('ice-candidate', { candidate: event.candidate.toJSON() }, peerClientId);
            }
        };

        connection.ontrack = (event) => {
            const remoteStream = remoteStreamsRef.current.get(peerClientId) ?? new MediaStream();
            event.streams[0]?.getTracks().forEach(track => {
                if (!remoteStream.getTracks().some(existingTrack => existingTrack.id === track.id)) {
                    remoteStream.addTrack(track);
                }
            });
            remoteStreamsRef.current.set(peerClientId, remoteStream);
            setRemotePeers(prev => {
                const existingPeer = prev.find(peer => peer.clientId === peerClientId);
                if (existingPeer) {
                    return prev.map(peer => peer.clientId === peerClientId ? { ...peer, stream: remoteStream, name: peerName || peer.name } : peer);
                }
                return [...prev, {
                    clientId: peerClientId,
                    name: peerName || 'Participant',
                    stream: remoteStream,
                    audioEnabled: true,
                    videoEnabled: true,
                    screenSharing: false,
                }];
            });
        };

        connection.onconnectionstatechange = () => {
            if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) {
                window.setTimeout(() => {
                    if (connection.connectionState !== 'connected') removePeer(peerClientId);
                }, 4_000);
            }
        };

        peerConnectionsRef.current.set(peerClientId, connection);
        setRemotePeers(prev => prev.some(peer => peer.clientId === peerClientId)
            ? prev
            : [...prev, {
                clientId: peerClientId,
                name: peerName || 'Participant',
                stream: new MediaStream(),
                audioEnabled: true,
                videoEnabled: true,
                screenSharing: false,
            }]);

        return connection;
    }, [removePeer, sendSignal]);

    const handleSignal = useCallback(async (signal: ApiSignal) => {
        if (processedSignalsRef.current.has(signal.id)) return;
        processedSignalsRef.current.add(signal.id);

        const peerClientId = signal.sender_client_id;
        const peerName = String(signal.payload.displayName || signal.sender_name || 'Participant');

        if (signal.type === 'peer-left') {
            removePeer(peerClientId);
            return;
        }

        if (signal.type === 'media-state') {
            setRemotePeers(prev => prev.map(peer => peer.clientId === peerClientId ? {
                ...peer,
                name: peerName || peer.name,
                audioEnabled: Boolean(signal.payload.audioEnabled),
                videoEnabled: Boolean(signal.payload.videoEnabled),
                screenSharing: Boolean(signal.payload.screenSharing),
            } : peer));
            return;
        }

        if (signal.type === 'peer-joined') {
            const connection = createPeerConnection(peerClientId, peerName);
            if (clientId > peerClientId) {
                await sendSignal('peer-joined', { displayName, audioEnabled, videoEnabled, screenSharing }, peerClientId);
                return;
            }

            if (connection.signalingState !== 'stable') return;
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            await sendSignal('offer', { description: offer, displayName }, peerClientId);
            await sendSignal('media-state', { displayName, audioEnabled, videoEnabled, screenSharing }, peerClientId);
            return;
        }

        if (signal.type === 'offer') {
            const description = signal.payload.description;
            if (!isSessionDescription(description)) return;

            const connection = createPeerConnection(peerClientId, peerName);
            await connection.setRemoteDescription(new RTCSessionDescription(description));
            await flushPendingCandidates(peerClientId, connection);
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await sendSignal('answer', { description: answer, displayName }, peerClientId);
            await sendSignal('media-state', { displayName, audioEnabled, videoEnabled, screenSharing }, peerClientId);
            return;
        }

        if (signal.type === 'answer') {
            const description = signal.payload.description;
            const connection = peerConnectionsRef.current.get(peerClientId);
            if (!connection || !isSessionDescription(description) || connection.currentRemoteDescription) return;

            await connection.setRemoteDescription(new RTCSessionDescription(description));
            await flushPendingCandidates(peerClientId, connection);
            return;
        }

        if (signal.type === 'ice-candidate') {
            const candidate = signal.payload.candidate;
            const connection = peerConnectionsRef.current.get(peerClientId);
            if (!connection || !isIceCandidate(candidate)) return;

            if (!connection.remoteDescription) {
                const pending = pendingCandidatesRef.current.get(peerClientId) ?? [];
                pending.push(candidate);
                pendingCandidatesRef.current.set(peerClientId, pending);
                return;
            }

            await connection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }, [audioEnabled, clientId, createPeerConnection, displayName, flushPendingCandidates, removePeer, screenSharing, sendSignal, videoEnabled]);

    useEffect(() => {
        mountedRef.current = true;
        const openMedia = async () => {
            try {
                await apiRequest(`/interviews/${interview.id}/join`, {
                    method: 'POST',
                    body: { clientId, displayName },
                });

                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('This browser does not support camera and microphone access.');
                }
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (!mountedRef.current) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                localStreamRef.current = stream;
                setLocalStream(stream);
                setRoomError(null);
                onError(null);
                await sendSignal('peer-joined', { displayName, audioEnabled: true, videoEnabled: true, screenSharing: false });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Could not open camera or microphone.';
                setRoomError(message);
                onError(message);
            }
        };

        void openMedia();

        return () => {
            mountedRef.current = false;
            void sendSignal('peer-left', { displayName });
            localStreamRef.current?.getTracks().forEach(track => track.stop());
            screenStreamRef.current?.getTracks().forEach(track => track.stop());
            peerConnectionsRef.current.forEach(connection => connection.close());
            peerConnectionsRef.current.clear();
        };
    }, [displayName, onError, sendSignal]);

    useEffect(() => {
        if (!localVideoRef.current || !localStream) return;
        localVideoRef.current.srcObject = screenStreamRef.current ?? localStream;
    }, [localStream, screenSharing]);

    useEffect(() => {
        if (!localStream) return;

        const poll = async () => {
            try {
                const path = `/interviews/${interview.id}/signals?clientId=${encodeURIComponent(clientId)}&since=${encodeURIComponent(pollSinceRef.current)}`;
                const data = await apiRequest<{ server_time: string; signals: ApiSignal[] }>(path);
                for (const signal of data.signals ?? []) {
                    await handleSignal(signal);
                }
                const serverTime = new Date(data.server_time).getTime();
                if (!Number.isNaN(serverTime)) {
                    pollSinceRef.current = new Date(serverTime - 2_000).toISOString();
                }
            } catch (err) {
                setRoomError(err instanceof Error ? err.message : 'Lost connection to signaling.');
            }
        };

        void poll();
        const interval = window.setInterval(() => void poll(), 1_500);
        return () => window.clearInterval(interval);
    }, [clientId, handleSignal, interview.id, localStream]);

    useEffect(() => {
        publishMediaState();
    }, [publishMediaState]);

    const toggleAudio = () => {
        const next = !audioEnabled;
        localStreamRef.current?.getAudioTracks().forEach(track => {
            track.enabled = next;
        });
        setAudioEnabled(next);
    };

    const toggleVideo = () => {
        const next = !videoEnabled;
        localStreamRef.current?.getVideoTracks().forEach(track => {
            track.enabled = next;
        });
        setVideoEnabled(next);
    };

    const replaceOutgoingVideo = async (track: MediaStreamTrack | null) => {
        const replacements: Promise<void>[] = [];
        peerConnectionsRef.current.forEach(connection => {
            const sender = connection.getSenders().find(item => item.track?.kind === 'video');
            if (sender) replacements.push(sender.replaceTrack(track));
        });
        await Promise.all(replacements);
    };

    const stopScreenShare = async () => {
        screenStreamRef.current?.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
        await replaceOutgoingVideo(localStreamRef.current?.getVideoTracks()[0] ?? null);
        setScreenSharing(false);
    };

    const startScreenShare = async () => {
        if (!interview.allow_screen_share) return;

        if (screenSharing) {
            await stopScreenShare();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const screenTrack = stream.getVideoTracks()[0];
            if (!screenTrack) throw new Error('Screen sharing did not provide a video track.');

            screenStreamRef.current = stream;
            await replaceOutgoingVideo(screenTrack);
            screenTrack.onended = () => {
                void stopScreenShare();
            };
            setScreenSharing(true);
        } catch {
            setRoomError('Screen sharing was not started.');
        }
    };

    const leaveRoom = () => {
        void sendSignal('peer-left', { displayName });
        localStreamRef.current?.getTracks().forEach(track => track.stop());
        screenStreamRef.current?.getTracks().forEach(track => track.stop());
        peerConnectionsRef.current.forEach(connection => connection.close());
        peerConnectionsRef.current.clear();
        setRemotePeers([]);
        setRoomError('You left the video room. Use Back and rejoin to start again.');
    };

    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            <div className="interview-video-grid" style={{ display: 'grid', gridTemplateColumns: remotePeers.length ? 'repeat(auto-fit, minmax(240px, 1fr))' : '1fr', gap: '0.75rem' }}>
                <VideoTile label={`${displayName} (you)`} muted stream={localStream} videoRef={localVideoRef} audioEnabled={audioEnabled} videoEnabled={videoEnabled} screenSharing={screenSharing} />
                {remotePeers.map(peer => (
                    <VideoTile key={peer.clientId} label={peer.name} stream={peer.stream} audioEnabled={peer.audioEnabled} videoEnabled={peer.videoEnabled} screenSharing={peer.screenSharing} />
                ))}
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-outline" onClick={toggleAudio}>
                    {audioEnabled ? <Mic size={15} /> : <MicOff size={15} />} {audioEnabled ? 'Mute' : 'Unmute'}
                </button>
                <button className="btn btn-sm btn-outline" onClick={toggleVideo}>
                    {videoEnabled ? <Camera size={15} /> : <CameraOff size={15} />} {videoEnabled ? 'Camera Off' : 'Camera On'}
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => void startScreenShare()} disabled={!interview.allow_screen_share}>
                    <MonitorUp size={15} /> {screenSharing ? 'Stop Share' : 'Share Screen'}
                </button>
                <button className="btn btn-sm btn-outline" onClick={leaveRoom}>
                    <PhoneOff size={15} /> Leave
                </button>
            </div>

            <p className="t-small" style={{ color: 'var(--text-muted)' }}>
                {remotePeers.length === 0 ? 'Waiting for another participant to join this interview code.' : `${remotePeers.length + 1} participants connected`}
            </p>

            {roomError && (
                <p className="t-small" style={{ color: 'var(--danger)', fontWeight: 800 }}>{roomError}</p>
            )}
        </div>
    );
};

const VideoTile: React.FC<{
    label: string;
    stream: MediaStream | null;
    muted?: boolean;
    videoRef?: React.RefObject<HTMLVideoElement | null>;
    audioEnabled: boolean;
    videoEnabled: boolean;
    screenSharing: boolean;
}> = ({ label, stream, muted = false, videoRef, audioEnabled, videoEnabled, screenSharing }) => {
    const internalRef = useRef<HTMLVideoElement | null>(null);
    const ref = videoRef ?? internalRef;

    useEffect(() => {
        if (!ref.current) return;
        ref.current.srcObject = stream;
    }, [ref, stream]);

    return (
        <div style={{ position: 'relative', background: '#111', border: '1px solid var(--border)', minHeight: 240, aspectRatio: '16 / 10', overflow: 'hidden' }}>
            {stream ? (
                <video ref={ref} autoPlay playsInline muted={muted} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800 }}>
                    Connecting...
                </div>
            )}
            <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                <span className="badge badge-neutral" style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                <span className="badge badge-neutral" style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                    {audioEnabled ? <Mic size={12} /> : <MicOff size={12} />}
                    {videoEnabled ? <Camera size={12} /> : <CameraOff size={12} />}
                    {screenSharing ? <MonitorUp size={12} /> : null}
                </span>
            </div>
        </div>
    );
};

const ControlRow: React.FC<{ icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; label: string; value: string }> = ({ icon: Icon, label, value }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
        <Icon size={16} style={{ color: 'var(--text-muted)', marginTop: 2 }} />
        <div>
            <p className="label">{label}</p>
            <p className="t-small" style={{ color: 'var(--text-2)', fontWeight: 700 }}>{value}</p>
        </div>
    </div>
);

export default InterviewJoin;
