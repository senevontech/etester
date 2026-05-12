import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    loading?: boolean;
    tone?: 'warning' | 'danger' | 'info';
    onConfirm: () => void;
    onClose: () => void;
}

const toneColor = (tone: ConfirmDialogProps['tone']) => {
    if (tone === 'danger') return 'var(--danger)';
    if (tone === 'info') return 'var(--accent)';
    return 'var(--warning)';
};

const toneBg = (tone: ConfirmDialogProps['tone']) => {
    if (tone === 'danger') return 'var(--danger-bg)';
    if (tone === 'info') return 'var(--surface-raised)';
    return 'var(--warning-bg)';
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    loading = false,
    tone = 'warning',
    onConfirm,
    onClose,
}) => {
    if (!open) return null;

    return (
        <div
            role="presentation"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                background: 'rgba(0,0,0,0.46)',
                backdropFilter: 'blur(4px)',
            }}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !loading) onClose();
            }}
        >
            <div
                className="anim-fade-up"
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                style={{
                    width: '100%',
                    maxWidth: '430px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-lg)',
                }}
            >
                <div style={{ padding: '1rem 1.125rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <div style={{ width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: toneBg(tone), border: `1px solid ${toneColor(tone)}`, flexShrink: 0 }}>
                            <AlertTriangle size={17} style={{ color: toneColor(tone) }} />
                        </div>
                        <h2 id="confirm-dialog-title" className="t-h3" style={{ minWidth: 0 }}>{title}</h2>
                    </div>
                    <button type="button" className="icon-btn" onClick={onClose} disabled={loading} aria-label="Close confirmation">
                        <X size={16} />
                    </button>
                </div>

                <div style={{ padding: '1rem 1.125rem 1.125rem' }}>
                    <p className="t-body" style={{ color: 'var(--text-2)', lineHeight: 1.55 }}>
                        {message}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} disabled={loading}>
                            {cancelLabel}
                        </button>
                        <button type="button" className="btn btn-sm btn-primary" onClick={onConfirm} disabled={loading}>
                            {loading ? 'Saving...' : confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
