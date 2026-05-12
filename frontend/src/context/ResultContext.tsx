import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';
import { useOrg } from './OrgContext';

export interface AnswerPayload {
    questionId: string;
    type: 'mcq' | 'code' | 'text' | 'numeric';
    choice?: number;
    code?: string;
    language?: string;
    response?: string;
    pointsEarned: number;
}

export interface IntegrityEvent {
    type: string;
    message: string;
    timestamp: string;
    occurredAt: string;
}

export interface Submission {
    id: string;
    testId: string;
    orgId: string;
    studentId: string;
    studentName: string;
    attemptId?: string;
    answers: AnswerPayload[];
    score: number;
    totalPoints: number;
    integrityScore: number;
    violationsCount: number;
    integrityEvents: IntegrityEvent[];
    autoSubmitted: boolean;
    autoSubmitReason: string | null;
    startedAt: string | null;
    expiresAt: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    submittedAt: string;
}

interface ResultContextValue {
    submissions: Submission[];
    loading: boolean;
    submitTest: (
        testId: string,
        attemptId: string,
        answers: AnswerPayload[],
        integrityEvents: IntegrityEvent[],
        autoSubmitReason?: string | null
    ) => Promise<Submission>;
    getStudentSubmissions: (studentId: string) => Submission[];
    getTestSubmissions: (testId: string) => Submission[];
    getSubmission: (id: string) => Submission | undefined;
    refetch: () => Promise<void>;
}

const ResultContext = createContext<ResultContextValue | null>(null);

const rowToSubmission = (row: any): Submission => ({
    id: row.id,
    testId: row.test_id,
    orgId: row.org_id,
    studentId: row.student_id,
    studentName: row.student_name,
    attemptId: row.attempt_id ?? undefined,
    answers: row.answers ?? [],
    score: row.score,
    totalPoints: row.total_points,
    integrityScore: row.integrity_score,
    violationsCount: row.violations_count,
    integrityEvents: row.integrity_events ?? [],
    autoSubmitted: Boolean(row.auto_submitted),
    autoSubmitReason: row.auto_submit_reason ?? null,
    startedAt: row.started_at ?? null,
    expiresAt: row.expires_at ?? null,
    ipAddress: row.ip_address ?? null,
    userAgent: row.user_agent ?? null,
    submittedAt: row.submitted_at,
});

interface SubmissionsResponse {
    submissions: any[];
}

interface SubmissionResponse {
    submission: any;
}

export const ResultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { activeOrg } = useOrg();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(false);
    const userId = user?.id;
    const activeOrgId = activeOrg?.id;

    const fetchSubmissions = useCallback(async () => {
        if (!userId) {
            setSubmissions([]);
            return;
        }

        if (user?.role === 'student') {
            setLoading(true);
            try {
                const data = await apiRequest<SubmissionsResponse>('/student/submissions');
                setSubmissions((data.submissions ?? []).map(rowToSubmission));
            } catch {
                setSubmissions([]);
            } finally {
                setLoading(false);
            }
            return;
        }

        if (!activeOrgId) {
            setSubmissions([]);
            return;
        }

        setLoading(true);
        try {
            const data = await apiRequest<SubmissionsResponse>(`/orgs/${activeOrgId}/submissions`);
            setSubmissions((data.submissions ?? []).map(rowToSubmission));
        } catch {
            setSubmissions([]);
        } finally {
            setLoading(false);
        }
    }, [activeOrgId, user?.role, userId]);

    useEffect(() => {
        void fetchSubmissions();
    }, [fetchSubmissions]);

    const submitTest = useCallback(async (
        testId: string,
        attemptId: string,
        answers: AnswerPayload[],
        integrityEvents: IntegrityEvent[],
        autoSubmitReason?: string | null
    ) => {
        if (!attemptId) {
            throw new Error('Missing attempt.');
        }

        const data = await apiRequest<SubmissionResponse>('/submissions', {
            method: 'POST',
            body: {
                test_id: testId,
                attempt_id: attemptId,
                answers,
                integrity_events: integrityEvents,
                auto_submit_reason: autoSubmitReason ?? null,
            },
        });

        const created = rowToSubmission(data.submission);
        setSubmissions(prev => [created, ...prev]);
        return created;
    }, []);

    const getStudentSubmissions = useCallback(
        (studentId: string) => submissions.filter(submission => submission.studentId === studentId),
        [submissions]
    );

    const getTestSubmissions = useCallback(
        (testId: string) => submissions.filter(submission => submission.testId === testId),
        [submissions]
    );

    const getSubmission = useCallback(
        (id: string) => submissions.find(submission => submission.id === id),
        [submissions]
    );

    return (
        <ResultContext.Provider value={{
            submissions,
            loading,
            submitTest,
            getStudentSubmissions,
            getTestSubmissions,
            getSubmission,
            refetch: fetchSubmissions,
        }}
        >
            {children}
        </ResultContext.Provider>
    );
};

export const useResults = () => {
    const ctx = useContext(ResultContext);
    if (!ctx) throw new Error('useResults must be used within ResultProvider');
    return ctx;
};
