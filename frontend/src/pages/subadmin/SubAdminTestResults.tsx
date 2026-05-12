import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowLeft,
    Award,
    CheckCircle2,
    Clock,
    FileText,
    MonitorSmartphone,
    ShieldAlert,
    Timer,
    User,
    XCircle,
} from 'lucide-react';
import RoleShell from '../../components/Layout/RoleShell';
import { useResults, type AnswerPayload, type Submission } from '../../context/ResultContext';
import { useTests } from '../../context/TestContext';
import { useAuth } from '../../context/AuthContext';
import type { Question } from '../../types';

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';

const formatDuration = (start?: string | null, end?: string | null) => {
    if (!start || !end) return 'Not recorded';
    const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    if (minutes <= 0) return `${remaining}s`;
    return `${minutes}m ${remaining}s`;
};

const getQuestionPoints = (question?: Question) => question?.points ?? 0;

const renderExpectedAnswer = (question?: Question) => {
    if (!question) return 'Question not found';
    if (question.type === 'mcq') return typeof question.answer === 'number' ? question.options[question.answer] ?? `Option ${question.answer + 1}` : 'Not set';
    if (question.type === 'text') return question.acceptedAnswers.length > 0 ? question.acceptedAnswers.join(', ') : 'Not set';
    if (question.type === 'numeric') return question.answer === undefined ? 'Not set' : `${question.answer}${question.tolerance ? ` (+/- ${question.tolerance})` : ''}`;
    return `${question.testCases?.length ?? 0} judge case${(question.testCases?.length ?? 0) === 1 ? '' : 's'}`;
};

const renderSubmittedAnswer = (answer: AnswerPayload, question?: Question) => {
    if (answer.type === 'mcq' && question?.type === 'mcq') {
        if (typeof answer.choice !== 'number') return 'No option selected';
        return question.options[answer.choice] ?? `Option ${answer.choice + 1}`;
    }

    if (answer.type === 'code') {
        return answer.code?.trim() || 'No code submitted';
    }

    return answer.response?.trim() || 'No answer submitted';
};

const AnswerDetail: React.FC<{ answer: AnswerPayload; question?: Question }> = ({ answer, question }) => {
    const earned = answer.pointsEarned ?? 0;
    const total = getQuestionPoints(question);
    const fullCredit = total > 0 && earned >= total;
    const negative = earned < 0 || answer.negativeMarkApplied;
    const submitted = renderSubmittedAnswer(answer, question);

    return (
        <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', padding: '0.875rem', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
                <div style={{ minWidth: 0 }}>
                    <p className="t-small" style={{ color: 'var(--text)', fontWeight: 800, marginBottom: '0.2rem' }}>
                        {question?.title ?? 'Unknown question'}
                    </p>
                    <p className="t-small" style={{ color: 'var(--text-muted)' }}>{question?.type.toUpperCase() ?? answer.type.toUpperCase()}</p>
                </div>
                <span className={`badge ${negative ? 'badge-danger' : fullCredit ? 'badge-success' : 'badge-neutral'}`} style={{ flexShrink: 0 }}>
                    {earned} / {total} pts
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.625rem' }}>
                <div>
                    <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Submitted Answer</p>
                    {answer.type === 'code' ? (
                        <pre style={{ margin: 0, maxHeight: '220px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.75rem' }}>
                            {submitted}
                        </pre>
                    ) : (
                        <p className="t-small" style={{ color: 'var(--text)' }}>{submitted}</p>
                    )}
                </div>
                <div>
                    <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Expected / Grading</p>
                    <p className="t-small" style={{ color: 'var(--text)' }}>{renderExpectedAnswer(question)}</p>
                </div>
            </div>
        </div>
    );
};

const SubmissionCard: React.FC<{ submission: Submission; questions: Question[] }> = ({ submission, questions }) => {
    const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
    const submittedPercent = submission.totalPoints > 0 ? Math.round((submission.score / submission.totalPoints) * 100) : 0;
    const duration = formatDuration(submission.startedAt, submission.submittedAt);

    return (
        <article className="card anim-fade-up" style={{ padding: '1rem 1.125rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '1rem', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <h2 className="t-h3">{submission.studentName}</h2>
                        <span className={`badge ${submission.autoSubmitted ? 'badge-danger' : 'badge-success'}`}>
                            {submission.autoSubmitted ? 'Auto submitted' : 'Manual submit'}
                        </span>
                        <span className={`badge ${submission.integrityScore < 80 ? 'badge-danger' : 'badge-neutral'}`}>
                            {submission.integrityScore}% integrity
                        </span>
                    </div>
                    <p className="t-small" style={{ color: 'var(--text-muted)' }}>
                        Student ID: {submission.studentId}
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <p className="label" style={{ color: 'var(--text-muted)' }}>Score</p>
                    <p className="t-h2">{submission.score} / {submission.totalPoints}</p>
                    <p className="t-small" style={{ color: 'var(--text-muted)' }}>{submittedPercent}%</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.625rem', marginBottom: '1rem' }}>
                {[
                    { label: 'Started', value: formatDateTime(submission.startedAt), icon: Timer },
                    { label: 'Submitted', value: formatDateTime(submission.submittedAt), icon: Clock },
                    { label: 'Time Taken', value: duration, icon: MonitorSmartphone },
                    { label: 'Flags', value: `${submission.violationsCount}`, icon: ShieldAlert },
                ].map(({ label, value, icon: Icon }) => (
                    <div key={label} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '8px', padding: '0.75rem', display: 'flex', gap: '0.625rem' }}>
                        <Icon size={15} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '0.1rem' }} />
                        <div>
                            <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{label}</p>
                            <p className="t-small" style={{ color: 'var(--text)', fontWeight: 700 }}>{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {submission.autoSubmitted && (
                <div style={{ border: '1px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem' }}>
                    <p className="label" style={{ marginBottom: '0.25rem' }}>Auto Submit Reason</p>
                    <p className="t-small" style={{ fontWeight: 800 }}>{submission.autoSubmitReason || 'Reason not recorded'}</p>
                </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.625rem' }}>Submitted Answers</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {submission.answers.map((answer) => (
                        <AnswerDetail key={answer.questionId} answer={answer} question={questionById.get(answer.questionId)} />
                    ))}
                </div>
            </div>

            <div>
                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.625rem' }}>Integrity Events</p>
                {submission.integrityEvents.length === 0 ? (
                    <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', color: 'var(--success)' }}>
                        <CheckCircle2 size={14} />
                        <p className="t-small" style={{ fontWeight: 800 }}>No integrity events recorded.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
                        {submission.integrityEvents.map((event, index) => (
                            <div key={`${submission.id}-event-${index}`} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '8px', padding: '0.7rem' }}>
                                <p className="t-small" style={{ color: 'var(--text)', fontWeight: 800 }}>{event.type}</p>
                                <p className="t-small" style={{ color: 'var(--text-muted)' }}>{event.message}</p>
                                <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: '0.25rem' }}>
                                    {event.occurredAt || event.timestamp || 'Time not recorded'}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </article>
    );
};

const SubAdminTestResults: React.FC = () => {
    const { testId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { getTest, loading: testsLoading } = useTests();
    const { getTestSubmissions, loading } = useResults();
    const role = user?.role === 'admin' ? 'admin' : 'subadmin';
    const basePath = role === 'admin' ? '/admin' : '/subadmin';

    const test = getTest(testId ?? '');
    const submissions = useMemo(
        () => getTestSubmissions(testId ?? '').sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
        [getTestSubmissions, testId]
    );

    if (!test && testsLoading) {
        return (
            <RoleShell role={role} activeKey="tests">
                <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                    <div style={{ width: '28px', height: '28px', border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
                    <p className="t-body">Loading test details...</p>
                </div>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </RoleShell>
        );
    }

    if (!test) {
        return (
            <RoleShell role={role} activeKey="tests">
                <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                    <p className="t-h2" style={{ marginBottom: '1rem' }}>Test not found</p>
                    <button className="btn btn-primary btn-md hover-glow" onClick={() => navigate(`${basePath}/tests`)}>Back to Test Management</button>
                </div>
            </RoleShell>
        );
    }

    const totalPossible = test.questions.reduce((total, question) => total + question.points, 0);
    const avgScore = submissions.length > 0 ? submissions.reduce((total, submission) => total + submission.score, 0) / submissions.length : 0;
    const avgIntegrity = submissions.length > 0 ? submissions.reduce((total, submission) => total + submission.integrityScore, 0) / submissions.length : 0;
    const autoSubmits = submissions.filter((submission) => submission.autoSubmitted).length;
    const flags = submissions.reduce((total, submission) => total + submission.violationsCount, 0);

    return (
        <RoleShell role={role} activeKey="tests">
            <main style={{ paddingBottom: '4rem' }}>
                <section className="anim-fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                        <button className="btn btn-sm btn-ghost" onClick={() => navigate(`${basePath}/tests`)} style={{ gap: '0.35rem', marginBottom: '0.75rem' }}>
                            <ArrowLeft size={14} /> Test Management
                        </button>
                        <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Test Details</p>
                        <h1 className="t-h1" style={{ marginBottom: '0.4rem' }}>{test.title}</h1>
                        <p className="t-body" style={{ color: 'var(--text-muted)', maxWidth: '720px' }}>
                            Review who submitted the exam, when they submitted, why any attempt was auto-submitted, and every submitted answer.
                        </p>
                    </div>
                    <button className="btn btn-md btn-outline" onClick={() => navigate(`${basePath}/test/${test.id}`)} style={{ gap: '0.45rem' }}>
                        <FileText size={15} /> Open Editor
                    </button>
                </section>

                <section className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    {[
                        { label: 'Students Submitted', value: submissions.length, icon: User },
                        { label: 'Average Score', value: `${avgScore.toFixed(1)} / ${totalPossible}`, icon: Award },
                        { label: 'Auto Submits', value: autoSubmits, icon: XCircle, danger: autoSubmits > 0 },
                        { label: 'Average Integrity', value: `${Math.round(avgIntegrity)}%`, icon: ShieldAlert },
                        { label: 'Total Flags', value: flags, icon: AlertTriangle, danger: flags > 0 },
                    ].map(({ label, value, icon: Icon, danger }) => (
                        <div key={label} className="card hover-antigravity" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: danger ? 'var(--danger-bg)' : 'var(--surface-raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon size={15} style={{ color: danger ? 'var(--danger)' : 'var(--text-2)' }} />
                            </div>
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{label}</p>
                                <p className="t-h2" style={{ color: danger ? 'var(--danger)' : 'var(--text)' }}>{value}</p>
                            </div>
                        </div>
                    ))}
                </section>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <div style={{ width: '28px', height: '28px', border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
                        <p className="t-body">Loading submission details...</p>
                    </div>
                ) : submissions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
                        <AlertTriangle size={44} className="antigravity" style={{ margin: '0 auto 1rem', color: 'var(--accent)', opacity: 0.8 }} />
                        <p className="t-h3">No submissions yet</p>
                        <p className="t-body" style={{ marginTop: '0.5rem' }}>After students submit this exam, their details and answers will appear here.</p>
                    </div>
                ) : (
                    <section style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                        {submissions.map((submission) => (
                            <SubmissionCard key={submission.id} submission={submission} questions={test.questions} />
                        ))}
                    </section>
                )}
            </main>

            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </RoleShell>
    );
};

export default SubAdminTestResults;
