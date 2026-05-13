import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    CalendarClock,
    CheckCircle2,
    Copy,
    Edit3,
    Eye,
    MonitorUp,
    Plus,
    ShieldAlert,
    Trash2,
    Users,
    Video,
    X,
} from 'lucide-react';
import RoleShell from '../../components/Layout/RoleShell';
import ConfirmDialog from '../../components/Modals/ConfirmDialog';
import { useOrg } from '../../context/OrgContext';
import { apiRequest } from '../../lib/api';

interface InterviewManagementProps {
    role: 'admin' | 'subadmin';
}

type InterviewStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
type RoomMode = 'group' | 'individual';

interface ApiInterview {
    id: string;
    org_id: string;
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
    participant_count: number;
    created_by: string;
    creator_name?: string;
    created_at: string;
    updated_at: string;
}

interface InterviewFormState {
    title: string;
    candidateName: string;
    candidateEmail: string;
    description: string;
    scheduledAt: string;
    durationMinutes: number;
    allowScreenShare: boolean;
    enableIntegrityMonitoring: boolean;
    roomMode: RoomMode;
    status: InterviewStatus;
}

const emptyForm = (): InterviewFormState => {
    const nextHour = new Date();
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);

    return {
        title: '',
        candidateName: '',
        candidateEmail: '',
        description: '',
        scheduledAt: toDateTimeLocal(nextHour.toISOString()),
        durationMinutes: 45,
        allowScreenShare: false,
        enableIntegrityMonitoring: true,
        roomMode: 'group',
        status: 'scheduled',
    };
};

const toDateTimeLocal = (iso?: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
};

const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Not scheduled';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
};

const statusClass = (status: InterviewStatus) => {
    if (status === 'live') return 'badge-success';
    if (status === 'cancelled') return 'badge-danger';
    if (status === 'completed') return 'badge-neutral';
    return 'badge-warning';
};

const toForm = (interview: ApiInterview): InterviewFormState => ({
    title: interview.title,
    candidateName: interview.candidate_name || '',
    candidateEmail: interview.candidate_email || '',
    description: interview.description || '',
    scheduledAt: toDateTimeLocal(interview.scheduled_at),
    durationMinutes: interview.duration_minutes,
    allowScreenShare: interview.allow_screen_share,
    enableIntegrityMonitoring: interview.enable_integrity_monitoring,
    roomMode: interview.room_mode,
    status: interview.status,
});

const formPayload = (form: InterviewFormState) => ({
    title: form.title,
    candidateName: form.candidateName,
    candidateEmail: form.candidateEmail,
    description: form.description,
    scheduledAt: new Date(form.scheduledAt).toISOString(),
    durationMinutes: form.durationMinutes,
    allowScreenShare: form.allowScreenShare,
    enableIntegrityMonitoring: form.enableIntegrityMonitoring,
    roomMode: form.roomMode,
    status: form.status,
});

const writeClipboardText = async (value: string) => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (!copied) throw new Error('Copy command failed.');
};

const InterviewManagement: React.FC<InterviewManagementProps> = ({ role }) => {
    const { activeOrg } = useOrg();
    const [interviews, setInterviews] = useState<ApiInterview[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ApiInterview | null>(null);
    const [selected, setSelected] = useState<ApiInterview | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ApiInterview | null>(null);
    const [form, setForm] = useState<InterviewFormState>(() => emptyForm());

    const orgId = activeOrg?.id;

    const joinBase = useMemo(() => `${window.location.origin}/interview`, []);

    const refreshInterviews = useCallback(async () => {
        if (!orgId) {
            setInterviews([]);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const data = await apiRequest<{ interviews: ApiInterview[] }>(`/orgs/${orgId}/interviews`);
            setInterviews(data.interviews ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load interviews.');
            setInterviews([]);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        void refreshInterviews();
    }, [refreshInterviews]);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm());
        setError(null);
        setFormOpen(true);
    };

    const openEdit = (interview: ApiInterview) => {
        setEditing(interview);
        setForm(toForm(interview));
        setError(null);
        setFormOpen(true);
    };

    const saveInterview = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!orgId || saving) return;

        if (!form.title.trim()) {
            setError('Interview title is required.');
            return;
        }

        if (!form.scheduledAt || Number.isNaN(new Date(form.scheduledAt).getTime())) {
            setError('Valid interview date and time is required.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const result = editing
                ? await apiRequest<{ interview: ApiInterview }>(`/interviews/${editing.id}`, {
                    method: 'PATCH',
                    body: formPayload(form),
                })
                : await apiRequest<{ interview: ApiInterview }>(`/orgs/${orgId}/interviews`, {
                    method: 'POST',
                    body: formPayload(form),
                });

            setInterviews(prev => {
                if (editing) return prev.map(item => item.id === result.interview.id ? result.interview : item);
                return [result.interview, ...prev];
            });
            setSelected(result.interview);
            setFormOpen(false);
            setEditing(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save interview.');
        } finally {
            setSaving(false);
        }
    };

    const patchInterview = async (interview: ApiInterview, patch: Partial<InterviewFormState>) => {
        const next = { ...toForm(interview), ...patch };
        const result = await apiRequest<{ interview: ApiInterview }>(`/interviews/${interview.id}`, {
            method: 'PATCH',
            body: formPayload(next),
        });

        setInterviews(prev => prev.map(item => item.id === interview.id ? result.interview : item));
        setSelected(prev => prev?.id === interview.id ? result.interview : prev);
    };

    const deleteInterview = async () => {
        if (!deleteTarget) return;

        setSaving(true);
        try {
            await apiRequest(`/interviews/${deleteTarget.id}`, { method: 'DELETE' });
            setInterviews(prev => prev.filter(item => item.id !== deleteTarget.id));
            setSelected(prev => prev?.id === deleteTarget.id ? null : prev);
            setDeleteTarget(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete interview.');
        } finally {
            setSaving(false);
        }
    };

    const copyText = async (value: string) => {
        try {
            await writeClipboardText(value);
        } catch {
            setError('Copy failed. Select the text and copy it manually.');
        }
    };

    return (
        <RoleShell role={role} activeKey="interviews">
            <section className="anim-fade-up" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                    <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Interview Management</p>
                    <h1 className="t-h1" style={{ marginBottom: '0.5rem' }}>{activeOrg?.name ?? 'Organization'}</h1>
                    <p className="t-body" style={{ color: 'var(--text-muted)', maxWidth: '760px' }}>
                        Create coded interviews, open the shared video room, and switch candidates into individual rooms with dynamic screen sharing and integrity controls.
                    </p>
                </div>
                <button className="btn btn-md btn-primary hover-glow" onClick={openCreate} style={{ gap: '0.45rem' }}>
                    <Plus size={16} /> New Interview
                </button>
            </section>

            {error && (
                <div className="card anim-fade-up" style={{ padding: '0.85rem 1rem', marginBottom: '1rem', background: 'var(--danger-bg)', borderColor: 'var(--danger)' }}>
                    <p className="t-small" style={{ color: 'var(--danger)', fontWeight: 800 }}>{error}</p>
                </div>
            )}

            <section className="interview-management-grid anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(300px, 0.65fr)', gap: '1rem', alignItems: 'start' }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.125rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                        <div>
                            <h2 className="t-h3">Interview List</h2>
                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>{loading ? 'Loading interviews...' : `${interviews.length} interview${interviews.length === 1 ? '' : 's'}`}</p>
                        </div>
                    </div>

                    {interviews.length === 0 ? (
                        <div style={{ padding: '2rem 1.125rem', textAlign: 'center' }}>
                            <CalendarClock size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 0.75rem' }} />
                            <p style={{ fontWeight: 800, marginBottom: '0.35rem' }}>No interviews yet</p>
                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>Create the first interview to generate a join code.</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
                                <thead>
                                    <tr style={{ background: 'var(--surface-raised)' }}>
                                        {['Interview', 'Date & Time', 'Code', 'Mode', 'Status', 'Actions'].map(label => (
                                            <th key={label} className="label" style={{ textAlign: 'left', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {interviews.map(interview => (
                                        <tr key={interview.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <p style={{ fontWeight: 850 }}>{interview.title}</p>
                                                <p className="t-small" style={{ color: 'var(--text-muted)' }}>
                                                    {interview.candidate_name || interview.candidate_email || 'General interview'}
                                                </p>
                                            </td>
                                            <td className="t-small" style={{ padding: '0.85rem 1rem', color: 'var(--text-2)', fontWeight: 700 }}>{formatDateTime(interview.scheduled_at)}</td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <button className="btn btn-sm btn-outline t-mono" onClick={() => void copyText(interview.interview_code)} title="Copy interview code">
                                                    <Copy size={13} /> {interview.interview_code}
                                                </button>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <span className="badge badge-neutral">{interview.room_mode === 'individual' ? 'Individual room' : 'Shared room'}</span>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <span className={`badge ${statusClass(interview.status)}`}>{interview.status}</span>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <button className="icon-btn" onClick={() => setSelected(interview)} title="Details" aria-label="Details">
                                                        <Eye size={15} />
                                                    </button>
                                                    <button className="icon-btn" onClick={() => openEdit(interview)} title="Edit" aria-label="Edit">
                                                        <Edit3 size={15} />
                                                    </button>
                                                    <button className="icon-btn" onClick={() => setDeleteTarget(interview)} title="Delete" aria-label="Delete">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <InterviewDetails
                    interview={selected ?? interviews[0] ?? null}
                    joinBase={joinBase}
                    onCopy={(value) => void copyText(value)}
                    onPatch={(interview, patch) => void patchInterview(interview, patch)}
                />
            </section>

            {formOpen && (
                <InterviewFormModal
                    editing={editing}
                    form={form}
                    saving={saving}
                    onChange={setForm}
                    onClose={() => {
                        if (!saving) setFormOpen(false);
                    }}
                    onSubmit={(event) => void saveInterview(event)}
                />
            )}

            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title="Delete Interview"
                message={`Delete "${deleteTarget?.title ?? 'this interview'}"? The interview code and participant history for this interview will be removed.`}
                confirmLabel="Delete"
                tone="danger"
                loading={saving}
                onConfirm={() => void deleteInterview()}
                onClose={() => {
                    if (!saving) setDeleteTarget(null);
                }}
            />

            <style>{`
                @media (max-width: 1100px) {
                    .interview-management-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
                @media (max-width: 720px) {
                    .interview-form-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </RoleShell>
    );
};

interface InterviewDetailsProps {
    interview: ApiInterview | null;
    joinBase: string;
    onCopy: (value: string) => void;
    onPatch: (interview: ApiInterview, patch: Partial<InterviewFormState>) => void;
}

const InterviewDetails: React.FC<InterviewDetailsProps> = ({ interview, joinBase, onCopy, onPatch }) => {
    if (!interview) {
        return (
            <aside className="card" style={{ padding: '1rem 1.125rem' }}>
                <h2 className="t-h3" style={{ marginBottom: '0.35rem' }}>Details</h2>
                <p className="t-small" style={{ color: 'var(--text-muted)' }}>Select an interview to manage its video room controls.</p>
            </aside>
        );
    }

    const joinLink = `${joinBase}/${encodeURIComponent(interview.interview_code)}`;
    const joinPath = `/interview/${encodeURIComponent(interview.interview_code)}`;

    return (
        <aside className="card" style={{ padding: '1rem 1.125rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                    <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Details</p>
                    <h2 className="t-h3">{interview.title}</h2>
                </div>
                <span className={`badge ${statusClass(interview.status)}`}>{interview.status}</span>
            </div>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
                <InfoRow icon={CalendarClock} label="Schedule" value={`${formatDateTime(interview.scheduled_at)} (${interview.duration_minutes} min)`} />
                <InfoRow icon={Users} label="Participants" value={`${interview.participant_count} joined`} />
                <InfoRow icon={Video} label="Video Room" value={joinLink} />
            </div>

            <div style={{ marginTop: '1rem', display: 'grid', gap: '0.6rem' }}>
                <button className="btn btn-sm btn-outline" onClick={() => onCopy(interview.interview_code)}>
                    <Copy size={14} /> Copy Code
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => onCopy(joinLink)}>
                    <Copy size={14} /> Copy Join Link
                </button>
                <Link className="btn btn-sm btn-primary" to={joinPath}>
                    <Video size={14} /> Open Video Room
                </Link>
            </div>

            <div className="divider" style={{ margin: '1rem 0' }} />

            <div style={{ display: 'grid', gap: '0.65rem' }}>
                <button
                    className="btn btn-sm btn-outline"
                    onClick={() => onPatch(interview, { status: interview.status === 'live' ? 'scheduled' : 'live' })}
                    style={{ justifyContent: 'space-between' }}
                >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><CheckCircle2 size={14} /> Live Status</span>
                    <span>{interview.status === 'live' ? 'Live' : 'Start'}</span>
                </button>
                <button
                    className="btn btn-sm btn-outline"
                    onClick={() => onPatch(interview, { roomMode: interview.room_mode === 'group' ? 'individual' : 'group' })}
                    style={{ justifyContent: 'space-between' }}
                >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><Users size={14} /> Room Mode</span>
                    <span>{interview.room_mode === 'group' ? 'Shared' : 'Individual'}</span>
                </button>
                <button
                    className="btn btn-sm btn-outline"
                    onClick={() => onPatch(interview, { allowScreenShare: !interview.allow_screen_share })}
                    style={{ justifyContent: 'space-between' }}
                >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><MonitorUp size={14} /> Screen Share</span>
                    <span>{interview.allow_screen_share ? 'Allowed' : 'Blocked'}</span>
                </button>
                <button
                    className="btn btn-sm btn-outline"
                    onClick={() => onPatch(interview, { enableIntegrityMonitoring: !interview.enable_integrity_monitoring })}
                    style={{ justifyContent: 'space-between' }}
                >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><ShieldAlert size={14} /> Integrity</span>
                    <span>{interview.enable_integrity_monitoring ? 'On' : 'Off'}</span>
                </button>
            </div>
        </aside>
    );
};

const InfoRow: React.FC<{ icon: React.ComponentType<{ size?: number }>; label: string; value: string }> = ({ icon: Icon, label, value }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
        <div style={{ width: 30, height: 30, border: '1px solid var(--border)', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={14} style={{ color: 'var(--text-muted)' }} />
        </div>
        <div style={{ minWidth: 0 }}>
            <p className="label">{label}</p>
            <p className="t-small" style={{ color: 'var(--text-2)', fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</p>
        </div>
    </div>
);

interface InterviewFormModalProps {
    editing: ApiInterview | null;
    form: InterviewFormState;
    saving: boolean;
    onChange: React.Dispatch<React.SetStateAction<InterviewFormState>>;
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
}

const InterviewFormModal: React.FC<InterviewFormModalProps> = ({ editing, form, saving, onChange, onClose, onSubmit }) => (
    <div
        role="presentation"
        onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) onClose();
        }}
        style={{ position: 'fixed', inset: 0, zIndex: 850, background: 'rgba(0,0,0,0.48)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
        <form className="card anim-fade-up" onSubmit={onSubmit} style={{ width: '100%', maxWidth: 760, maxHeight: '92vh', overflow: 'auto', background: 'var(--bg)' }}>
            <div style={{ padding: '1rem 1.125rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <div>
                    <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{editing ? 'Edit Interview' : 'New Interview'}</p>
                    <h2 className="t-h3">{editing ? editing.interview_code : 'Code generated after save'}</h2>
                </div>
                <button type="button" className="icon-btn" onClick={onClose} disabled={saving} aria-label="Close">
                    <X size={16} />
                </button>
            </div>

            <div style={{ padding: '1.125rem', display: 'grid', gap: '1rem' }}>
                <div className="interview-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                    <Field label="Interview Title">
                        <input className="input" value={form.title} onChange={event => onChange(prev => ({ ...prev, title: event.target.value }))} placeholder="Frontend developer interview" required />
                    </Field>
                    <Field label="Candidate Email">
                        <input className="input" type="email" value={form.candidateEmail} onChange={event => onChange(prev => ({ ...prev, candidateEmail: event.target.value }))} placeholder="candidate@example.com" />
                    </Field>
                    <Field label="Candidate Name">
                        <input className="input" value={form.candidateName} onChange={event => onChange(prev => ({ ...prev, candidateName: event.target.value }))} placeholder="Candidate name" />
                    </Field>
                    <Field label="Date & Time">
                        <input className="input" type="datetime-local" value={form.scheduledAt} onChange={event => onChange(prev => ({ ...prev, scheduledAt: event.target.value }))} required />
                    </Field>
                    <Field label="Duration">
                        <input className="input" type="number" min={15} max={480} step={5} value={form.durationMinutes} onChange={event => onChange(prev => ({ ...prev, durationMinutes: Number(event.target.value) }))} />
                    </Field>
                </div>

                <Field label="Details">
                    <textarea className="input" value={form.description} onChange={event => onChange(prev => ({ ...prev, description: event.target.value }))} rows={4} placeholder="Panel notes, role, agenda, or instructions" />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                    <SelectField label="Status" value={form.status} onChange={value => onChange(prev => ({ ...prev, status: value as InterviewStatus }))} options={['scheduled', 'live', 'completed', 'cancelled']} />
                    <SelectField label="Room Mode" value={form.roomMode} onChange={value => onChange(prev => ({ ...prev, roomMode: value as RoomMode }))} options={['group', 'individual']} />
                    <ToggleField label="Screen Share" checked={form.allowScreenShare} onChange={checked => onChange(prev => ({ ...prev, allowScreenShare: checked }))} />
                    <ToggleField label="Integrity Monitoring" checked={form.enableIntegrityMonitoring} onChange={checked => onChange(prev => ({ ...prev, enableIntegrityMonitoring: checked }))} />
                </div>
            </div>

            <div style={{ padding: '1rem 1.125rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Interview'}</button>
            </div>
        </form>
    </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span className="label">{label}</span>
        {children}
    </label>
);

const SelectField: React.FC<{ label: string; value: string; options: string[]; onChange: (value: string) => void }> = ({ label, value, options, onChange }) => (
    <Field label={label}>
        <select className="input" value={value} onChange={event => onChange(event.target.value)}>
            {options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
    </Field>
);

const ToggleField: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
    <label style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: '0.75rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem' }}>
        <span>
            <span className="label" style={{ display: 'block' }}>{label}</span>
            <span className="t-small" style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{checked ? 'Enabled' : 'Disabled'}</span>
        </span>
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    </label>
);

export default InterviewManagement;
