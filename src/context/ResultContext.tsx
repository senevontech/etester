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
    answers: AnswerPayload[];
    score: number;
    totalPoints: number;
    integrityScore: number;
    violationsCount: number;
    integrityEvents: IntegrityEvent[];
    submittedAt: string;
}

interface ResultContextValue {
    submissions: Submission[];
    loading: boolean;
    submitTest: (
        testId: string,
        attemptId: string,
        answers: AnswerPayload[],
        integrityEvents: IntegrityEvent[]
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
    answers: row.answers ?? [],
    score: row.score,
    totalPoints: row.total_points,
    integrityScore: row.integrity_score,
    violationsCount: row.violations_count,
    integrityEvents: row.integrity_events ?? [],
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
        if (!userId || !activeOrgId) {
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
    }, [activeOrgId, userId]);

    useEffect(() => {
        void fetchSubmissions();
    }, [fetchSubmissions]);

    const submitTest = useCallback(async (
        testId: string,
        attemptId: string,
        answers: AnswerPayload[],
        integrityEvents: IntegrityEvent[]
    ) => {
        if (!activeOrgId || !attemptId) {
            throw new Error('Missing active organization or attempt.');
        }

        const data = await apiRequest<SubmissionResponse>('/submissions', {
            method: 'POST',
            body: {
                test_id: testId,
                org_id: activeOrgId,
                attempt_id: attemptId,
                answers,
                integrity_events: integrityEvents,
            },
        });

        const created = rowToSubmission(data.submission);
        setSubmissions(prev => [created, ...prev]);
        return created;
    }, [activeOrgId]);

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
