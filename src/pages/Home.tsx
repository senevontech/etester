import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Code2, Layout, Shield, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Layout/Navbar';

const Home: React.FC = () => {
    const { isAuthenticated, user } = useAuth();

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar overlay />

            {/* Hero */}
            <section className="home-hero">
                <div className="container">
                    <div className="home-heroGrid">
                        <div>
                            <div className="home-kicker antigravity-mild">
                                <span className="badge badge-solid" style={{ background: 'var(--accent)' }}>Etester</span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-2)' }}>
                                    Secure assessments. Clean workflows. Fast setup.
                                </span>
                            </div>

                            <h1 className="t-hero home-heroTitle anim-fade-up">
                                Assessments that scale with your <span style={{ color: 'var(--accent)' }}>organization</span>.
                            </h1>

                            <p className="t-body home-heroLead anim-fade-up delay-100">
                                Etester is a modern testing platform for schools, universities, and training teams—built for integrity,
                                speed, and clarity from day one.
                            </p>

                            <div className="flex-center gap-4 anim-fade-up delay-200" style={{ justifyContent: 'flex-start', marginTop: '1.75rem', flexWrap: 'wrap' }}>
                                {isAuthenticated ? (
                                    <Link to={user?.role === 'admin' ? '/admin' : '/dashboard'} className="btn btn-lg btn-primary hover-antigravity">
                                        Go to Dashboard <ArrowRight size={20} />
                                    </Link>
                                ) : (
                                    <>
                                        <Link to="/signup" className="btn btn-lg btn-primary hover-antigravity">
                                            Create account <ArrowRight size={20} />
                                        </Link>
                                        <Link to="/login" className="btn btn-lg btn-outline">
                                            Sign in
                                        </Link>
                                    </>
                                )}
                            </div>
                        </div>

                        <aside className="home-panel card antigravity" style={{ borderRadius: '0px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <p className="label">What you get</p>
                                    <p style={{ fontWeight: 900, letterSpacing: '-0.03em', fontSize: '1.1rem' }}>Everything needed to run exams</p>
                                </div>
                                <div style={{ width: '40px', height: '40px', background: 'var(--accent)', color: 'var(--accent-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Shield size={18} strokeWidth={2.5} />
                                </div>
                            </div>

                            <div className="home-metricGrid" style={{ marginBottom: '1rem' }}>
                                <div className="home-metric">
                                    <div className="home-metricValue">Live</div>
                                    <div className="home-metricLabel">Proctoring signals</div>
                                </div>
                                <div className="home-metric">
                                    <div className="home-metricValue">Multi</div>
                                    <div className="home-metricLabel">Question formats</div>
                                </div>
                                <div className="home-metric">
                                    <div className="home-metricValue">Fast</div>
                                    <div className="home-metricLabel">Org setup flow</div>
                                </div>
                                <div className="home-metric">
                                    <div className="home-metricValue">Clear</div>
                                    <div className="home-metricLabel">Results & exports</div>
                                </div>
                            </div>

                            <div className="divider" style={{ margin: '1rem 0' }} />

                            <div style={{ display: 'grid', gap: '0.6rem' }}>
                                {[
                                    'Create tests in minutes with a simple editor',
                                    'Run coding challenges with an embedded runner',
                                    'Track results with instant analytics and review',
                                ].map((line) => (
                                    <div key={line} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                                        <div style={{ marginTop: '2px', color: 'var(--accent)' }}>
                                            <CheckCircle2 size={16} />
                                        </div>
                                        <p className="t-body" style={{ color: 'var(--text-muted)' }}>{line}</p>
                                    </div>
                                ))}
                            </div>
                        </aside>
                    </div>
                </div>
            </section>

            {/* Marquee */}
            <section className="home-marquee" aria-label="Highlights">
                <div className="container" style={{ maxWidth: 'none' }}>
                    <div className="home-marqueeTrack">
                        {[
                            'Integrity-first',
                            'Org-ready',
                            'AI signals',
                            'Coding tests',
                            'Automated grading',
                            'Analytics',
                            'Integrity-first',
                            'Org-ready',
                            'AI signals',
                            'Coding tests',
                            'Automated grading',
                            'Analytics',
                        ].map((item, idx) => (
                            <React.Fragment key={`${item}-${idx}`}>
                                <span className="home-marqueeItem">{item}</span>
                                <span className="home-marqueeDot" aria-hidden="true" />
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </section>

            {/* Services / Feature blocks */}
            <section className="home-section" style={{ background: 'var(--bg-subtle)' }}>
                <div className="container">
                    <header className="home-sectionHeader">
                        <div>
                            <p className="label">Approach</p>
                            <h2 className="t-h1" style={{ marginTop: '0.5rem' }}>Built for speed, focus, and trust</h2>
                        </div>
                        <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                            Get the critical workflows first—then expand. Etester helps teams launch assessments quickly while keeping
                            proctoring and reporting consistent across departments.
                        </p>
                    </header>

                    <div className="home-splitGrid">
                        <div className="home-service card hover-antigravity">
                            <div className="home-serviceTitleRow">
                                <h3 className="t-h2">Proctoring & Integrity</h3>
                                <div style={{ color: 'var(--accent)' }}><Shield size={18} /></div>
                            </div>
                            <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                                Session monitoring signals designed for real classrooms and real constraints—clear flags, cleaner reviews.
                            </p>
                            <div className="divider" style={{ margin: '1.25rem 0' }} />
                            <ul style={{ display: 'grid', gap: '0.55rem', listStyle: 'none' }}>
                                {['Identity & behavior signals', 'Review-friendly logs', 'Consistent policies per org'].map(x => (
                                    <li key={x} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                                        <span style={{ marginTop: '2px', color: 'var(--accent)' }}><CheckCircle2 size={16} /></span>
                                        <span className="t-body" style={{ color: 'var(--text-2)' }}>{x}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="home-service card hover-antigravity">
                            <div className="home-serviceTitleRow">
                                <h3 className="t-h2">Test Creation & Delivery</h3>
                                <div style={{ color: 'var(--accent)' }}><Layout size={18} /></div>
                            </div>
                            <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                                A focused editor for MCQs, descriptive answers, and coding problems—built to stay out of your way.
                            </p>
                            <div className="divider" style={{ margin: '1.25rem 0' }} />
                            <ul style={{ display: 'grid', gap: '0.55rem', listStyle: 'none' }}>
                                {['Reusable question banks', 'Timed sessions', 'Room links for cohorts'].map(x => (
                                    <li key={x} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                                        <span style={{ marginTop: '2px', color: 'var(--accent)' }}><CheckCircle2 size={16} /></span>
                                        <span className="t-body" style={{ color: 'var(--text-2)' }}>{x}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="home-service card hover-antigravity">
                            <div className="home-serviceTitleRow">
                                <h3 className="t-h2">Code Assessments</h3>
                                <div style={{ color: 'var(--accent)' }}><Code2 size={18} /></div>
                            </div>
                            <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                                Practical coding tests with automated evaluation—so results are consistent and fast to review.
                            </p>
                            <div className="divider" style={{ margin: '1.25rem 0' }} />
                            <ul style={{ display: 'grid', gap: '0.55rem', listStyle: 'none' }}>
                                {['Multi-language runner', 'Hidden & sample test cases', 'Objective scoring'].map(x => (
                                    <li key={x} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                                        <span style={{ marginTop: '2px', color: 'var(--accent)' }}><CheckCircle2 size={16} /></span>
                                        <span className="t-body" style={{ color: 'var(--text-2)' }}>{x}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="home-service card hover-antigravity">
                            <div className="home-serviceTitleRow">
                                <h3 className="t-h2">Analytics & Org Controls</h3>
                                <div style={{ color: 'var(--accent)' }}><Zap size={18} /></div>
                            </div>
                            <p className="t-body" style={{ color: 'var(--text-muted)' }}>
                                Dashboards that tell you what happened and what to do next—without digging through noise.
                            </p>
                            <div className="divider" style={{ margin: '1.25rem 0' }} />
                            <ul style={{ display: 'grid', gap: '0.55rem', listStyle: 'none' }}>
                                {['Cohort comparisons', 'Attempt history', 'Role-based access'].map(x => (
                                    <li key={x} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                                        <span style={{ marginTop: '2px', color: 'var(--accent)' }}><CheckCircle2 size={16} /></span>
                                        <span className="t-body" style={{ color: 'var(--text-2)' }}>{x}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section style={{ padding: '88px 0', borderTop: '1px solid var(--border)' }}>
                <div className="container">
                    <div className="card home-ctaBand antigravity-glow">
                        <div style={{ position: 'relative', zIndex: 1, textAlign: 'left', maxWidth: '820px' }}>
                            <p className="label" style={{ color: 'color-mix(in srgb, var(--accent) 78%, white)' }}>Get started</p>
                            <h2 className="t-h1" style={{ marginTop: '0.6rem', marginBottom: '1rem', color: 'var(--accent)' }}>
                                Launch your next assessment with confidence.
                            </h2>
                            <p className="t-body" style={{ color: 'color-mix(in srgb, var(--accent) 55%, white)', maxWidth: '60ch' }}>
                                Create an organization, invite members, and publish your first test. Keep it simple now—expand the system
                                as you scale.
                            </p>

                            <div className="flex-center gap-4" style={{ justifyContent: 'flex-start', marginTop: '1.75rem', flexWrap: 'wrap' }}>
                                <Link to="/signup" className="btn btn-lg btn-primary">
                                    Create account
                                </Link>
                                <Link
                                    to="/login"
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 900,
                                        fontSize: '0.9rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}
                                >
                                    Sign in <ArrowRight size={16} />
                                </Link>
                            </div>
                        </div>

                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                                'radial-gradient(circle at 20% 0%, rgba(0,0,0,0.26), transparent 55%), radial-gradient(circle at 90% 30%, color-mix(in srgb, var(--accent) 40%, transparent), transparent 60%)',
                            pointerEvents: 'none'
                        }} />
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer style={{ padding: '60px 0', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div className="container">
                    <div className="flex-between" style={{ flexWrap: 'wrap', gap: '2rem' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                <div style={{ width: '24px', height: '24px', background: 'var(--accent)', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Shield size={14} color="var(--accent-fg)" strokeWidth={2.5} />
                                </div>
                                <span style={{ fontWeight: 900, fontSize: '1rem', letterSpacing: '-0.03em' }}>Etester</span>
                            </div>
                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>© 2026 Etester Inc. All rights reserved.</p>
                        </div>
                        <div className="flex-center gap-8">
                            <a href="#" className="t-small" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Privacy Policy</a>
                            <a href="#" className="t-small" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Terms of Service</a>
                            <a href="#" className="t-small" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Contact</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Home;
