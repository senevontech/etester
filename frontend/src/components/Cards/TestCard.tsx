import React from 'react';
import { Clock, ArrowUpRight, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TestCardProps {
    id: string;
    title: string;
    duration: number;
    date: string;
    tags?: string[];
}

const TestCard: React.FC<TestCardProps> = ({ id, title, duration, date, tags }) => {
    const navigate = useNavigate();

    return (
        <article
            className="card hover-antigravity"
            style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', cursor: 'pointer' }}
            onClick={() => navigate(`/test/${id}`)}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span className="badge badge-neutral">Assessment</span>
                <ArrowUpRight
                    size={16}
                    style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px', transition: 'transform 0.15s ease' }}
                    className="card-arrow"
                />
            </div>

            {/* Title */}
            <div style={{ flex: 1 }}>
                <h3
                    className="t-h3"
                    style={{ color: 'var(--text)', lineHeight: 1.3, marginBottom: '0.375rem' }}
                >
                    {title}
                </h3>
                <p className="t-small" style={{ color: 'var(--text-muted)', display: 'flex', gap: '0.375rem', alignItems: 'flex-start', lineHeight: 1.45 }}>
                    <CalendarClock size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{date}</span>
                </p>
            </div>

            {/* Tags */}
            {tags && tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {tags.map((tag) => (
                        <span key={tag} className="badge badge-neutral">{tag}</span>
                    ))}
                </div>
            )}

            {/* Footer */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-muted)' }}>
                    <Clock size={13} />
                    <span className="t-small">{duration} min</span>
                </div>
                <button
                    className="btn btn-sm btn-primary hover-glow"
                    onClick={(e) => { e.stopPropagation(); navigate(`/test/${id}/pre-gate`); }}
                >
                    Start
                </button>
            </div>

            <style>{`
        article:hover .card-arrow { transform: translate(2px, -2px); }
      `}</style>
        </article>
    );
};

export default TestCard;
