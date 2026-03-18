import React, { useEffect, useState } from 'react';

const developers = [
    {
        name: 'Srijon Karmakar',
        email: 'srijonkarmakar.dev@gmail.com',
        role: 'Full Stack Engineer',
        initials: 'S',
        delay: 0,
    },
    {
        name: 'Dibbapriya Jana',
        email: 'janad21044@gmail.com',
        role: 'Fullstack Developer',
        initials: 'D',
        delay: 120,
    },
    {
        name: 'Santu Pramanik',
        email: 'santupramanik2003@gmail.com',
        role: 'Backend Developer',
        initials: 'S',
        delay: 240,
    },
    {
        name: 'Tushar Mondal',
        email: 'tusharmondal@gmail.com',
        role: 'Data analyst | Data engineer',
        initials: 'T',
        delay: 240,
    },
];

const WhoMadeIt: React.FC = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const t = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(t);
    }, []);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg)',
            position: 'relative',
            overflow: 'hidden',
            padding: '3rem 1.5rem',
        }}>

            {/* Ambient glow layers */}
            <div style={{
                position: 'fixed',
                inset: 0,
                background: `
                    radial-gradient(ellipse 60% 40% at 50% 0%,
                        color-mix(in srgb, var(--accent) 14%, transparent),
                        transparent 70%),
                    radial-gradient(ellipse 40% 30% at 80% 80%,
                        color-mix(in srgb, var(--accent) 7%, transparent),
                        transparent 60%)
                `,
                pointerEvents: 'none',
                zIndex: 0,
            }} />

            {/* Scanline texture */}
            <div style={{
                position: 'fixed',
                inset: 0,
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.015) 2px, rgba(0,0,0,0.015) 4px)',
                pointerEvents: 'none',
                zIndex: 0,
            }} />

            <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '1100px', textAlign: 'center' }}>

                {/* Kicker badge */}
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.4rem 1rem',
                    border: '1px solid var(--border)',
                    background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
                    marginBottom: '1.75rem',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(10px)',
                    transition: 'opacity 0.5s ease, transform 0.5s ease',
                }}>
                    <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        display: 'inline-block',
                        animation: 'wimPulse 2s ease-in-out infinite',
                    }} />
                    <span className="label" style={{ color: 'var(--accent)' }}>You found us</span>
                </div>

                {/* Headline */}
                <h1 className="t-hero" style={{
                    marginBottom: '1rem',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(16px)',
                    transition: 'opacity 0.55s ease 0.08s, transform 0.55s ease 0.08s',
                }}>
                    The <span style={{ color: 'var(--accent)' }}>Builders</span>
                </h1>

                {/* Sub */}
                {/* <p className="t-body" style={{
                    color: 'var(--text-muted)',
                    maxWidth: '48ch',
                    margin: '0 auto 3.5rem',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(12px)',
                    transition: 'opacity 0.55s ease 0.18s, transform 0.55s ease 0.18s',
                }}>
                    Etester was crafted from scratch by a small team of three.
                    No shortcuts. Just focused engineering and good taste.
                </p> */}

                {/* Cards grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${developers.length}, 1fr)`,
                    gap: '1.25rem',
                    width: '100%',
                    justifyItems: 'center',
                }}>
                    {developers.map((dev) => (
                        <DevCard key={dev.name} dev={dev} visible={visible} />
                    ))}
                </div>

                {/* Footer line */}
                <div style={{
                    marginTop: '4rem',
                    opacity: visible ? 1 : 0,
                    transition: `opacity 0.6s ease ${0.6}s`,
                }}>
                    <div style={{ height: '1px', background: 'var(--border)', marginBottom: '1.5rem' }} />
                    <p className="t-small" style={{ color: 'var(--text-muted)' }}>
                        © 2026 Etester &mdash; Built with care in SNV
                    </p>
                </div>
            </div>

            <style>{`
                @keyframes wimPulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50%       { opacity: 0.4; transform: scale(0.75); }
                }
                @keyframes wimFloat {
                    0%   { transform: translateY(0px); }
                    50%  { transform: translateY(-6px); }
                    100% { transform: translateY(0px); }
                }
                @keyframes wimSpin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                .wim-card {
                    padding: 2rem 1.5rem;
                    text-align: center;
                    cursor: default;
                    transition:
                        transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
                        box-shadow 0.35s ease,
                        border-color 0.2s ease;
                }
                .wim-card:hover {
                    transform: translateY(-10px) scale(1.02);
                    box-shadow: var(--shadow-lg);
                    border-color: var(--accent) !important;
                }
                .wim-card:hover .wim-avatar {
                    animation: wimSpin 0.6s ease;
                }
            `}</style>
        </div>
    );
};

interface DevCardProps {
    dev: typeof developers[number];
    visible: boolean;
}

const DevCard: React.FC<DevCardProps> = ({ dev, visible }) => (
    <div
        className="card wim-card"
        style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(20px)',
            transition: `opacity 0.55s ease ${0.28 + dev.delay / 1000}s, transform 0.55s ease ${0.28 + dev.delay / 1000}s`,
        }}
    >
        {/* Avatar */}
        <div
            className="wim-avatar"
            style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '1.75rem',
                letterSpacing: '-0.03em',
                margin: '0 auto 1.25rem',
                boxShadow: '0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent)',
                animation: `wimFloat ${5 + dev.delay / 100}s ease-in-out infinite`,
                animationDelay: `${dev.delay}ms`,
                userSelect: 'none',
            }}
        >
            {dev.initials}
        </div>

        {/* Name */}
        <h2 className="t-h2" style={{ marginBottom: '0.5rem' }}>{dev.name}</h2>

        {/* Role badge */}
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.25em 0.75em',
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            marginBottom: '1rem',
        }}>
            <span style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'inline-block',
                flexShrink: 0,
            }} />
            <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
            }}>
                {dev.role}
            </span>
        </div>

        {/* Divider */}
        <div className="divider" style={{ margin: '0.85rem 0' }} />

        {/* Email */}
        <p className="t-mono" style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        }}>
            {dev.email}
        </p>
    </div>
);

export default WhoMadeIt;
