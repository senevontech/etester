import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../lib/api';
import { useOrg } from './OrgContext';
import { useAuth } from './AuthContext';
import type { CodeQuestion, NumericQuestion, Question, TextQuestion } from '../types';

export interface TestSecuritySettings {
    webcam: boolean;
    microphone: boolean;
    tabSwitch: boolean;
    fullscreen: boolean;
    laptopOnly: boolean;
}

const DEFAULT_SECURITY_SETTINGS: TestSecuritySettings = {
    webcam: true,
    microphone: true,
    tabSwitch: true,
    fullscreen: true,
    laptopOnly: false,
};

export interface Test {
    id: string;
    orgId: string;
    title: string;
    description: string;
    duration: number;
    tags: string[];
    published: boolean;
    allowedEmails: string[];
    hasAccessCode: boolean;
    accessCode: string | null;
    startAt: string | null;
    endAt: string | null;
    securitySettings: TestSecuritySettings;
    createdBy: string;
    createdAt: string;
    questions: Question[];
}

interface TestContextValue {
    tests: Test[];
    loading: boolean;
    getTest: (id: string) => Test | undefined;
    createTest: (data: Omit<Test, 'id' | 'createdAt' | 'questions' | 'published' | 'allowedEmails' | 'hasAccessCode' | 'accessCode' | 'securitySettings' | 'created_by' | 'org_id'>) => Promise<Test | null>;
    updateTest: (id: string, data: Partial<Omit<Test, 'id' | 'createdAt' | 'questions' | 'allowedEmails' | 'hasAccessCode' | 'accessCode' | 'org_id'>>) => Promise<void>;
    deleteTest: (id: string) => Promise<void>;
    publishTest: (id: string, options?: { allowedEmails: string[] }) => Promise<void>;
    unpublishTest: (id: string) => Promise<void>;
    addQuestion: (testId: string, question: Omit<Question, 'id'>) => Promise<void>;
    addQuestionsBulk: (testId: string, questions: Omit<Question, 'id'>[]) => Promise<{ created: Question[]; error: string | null }>;
    updateQuestion: (testId: string, qId: string, data: Partial<Question>) => Promise<void>;
    deleteQuestion: (testId: string, qId: string) => Promise<void>;
    reorderQuestions: (testId: string, questions: Question[]) => Promise<void>;
    refetch: () => Promise<void>;
}

const TestContext = createContext<TestContextValue | null>(null);

const rowToQuestion = (q: any): Question => {
    if (q.type === 'mcq') {
        return {
            id: q.id,
            type: 'mcq',
            category: q.category === 'aptitude' ? 'aptitude' : 'mcq',
            title: q.title,
            description: q.description ?? '',
            imageUrl: q.image_url ?? q.imageUrl ?? undefined,
            options: q.options ?? [],
            answer: typeof q.answer === 'number' ? q.answer : undefined,
            points: q.points,
        };
    }

    if (q.type === 'text') {
        return {
            id: q.id,
            type: 'text',
            category: 'saq',
            title: q.title,
            description: q.description ?? '',
            imageUrl: q.image_url ?? q.imageUrl ?? undefined,
            acceptedAnswers: q.accepted_answers ?? q.acceptedAnswers ?? [],
            caseSensitive: Boolean(q.case_sensitive ?? q.caseSensitive),
            points: q.points,
        } satisfies TextQuestion;
    }

    if (q.type === 'numeric') {
        return {
            id: q.id,
            type: 'numeric',
            category: 'numerical',
            title: q.title,
            description: q.description ?? '',
            imageUrl: q.image_url ?? q.imageUrl ?? undefined,
            answer: typeof q.numeric_answer === 'number' ? q.numeric_answer : undefined,
            tolerance: typeof q.numeric_tolerance === 'number' ? q.numeric_tolerance : Number(q.numeric_tolerance ?? 0) || 0,
            points: q.points,
        } satisfies NumericQuestion;
    }

        return {
            id: q.id,
            type: 'code',
            category: 'coding',
            title: q.title,
            description: q.description ?? '',
            imageUrl: q.image_url ?? q.imageUrl ?? undefined,
            template: q.template ?? '',
            language: q.language ?? 'python',
        constraints: q.constraints ?? [],
        examples: q.examples ?? [],
        testCases: q.test_cases ?? q.testCases ?? [],
        points: q.points,
    } satisfies CodeQuestion;
};

const rowToSecuritySettings = (raw: any): TestSecuritySettings => ({
    webcam: raw?.webcam !== undefined ? Boolean(raw.webcam) : DEFAULT_SECURITY_SETTINGS.webcam,
    microphone: raw?.microphone !== undefined ? Boolean(raw.microphone) : DEFAULT_SECURITY_SETTINGS.microphone,
    tabSwitch: raw?.tab_switch !== undefined ? Boolean(raw.tab_switch) : raw?.tabSwitch !== undefined ? Boolean(raw.tabSwitch) : DEFAULT_SECURITY_SETTINGS.tabSwitch,
    fullscreen: raw?.fullscreen !== undefined ? Boolean(raw.fullscreen) : DEFAULT_SECURITY_SETTINGS.fullscreen,
    laptopOnly: raw?.laptop_only !== undefined ? Boolean(raw.laptop_only) : raw?.laptopOnly !== undefined ? Boolean(raw.laptopOnly) : DEFAULT_SECURITY_SETTINGS.laptopOnly,
});

const rowToTest = (row: any): Test => ({
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    description: row.description ?? '',
    duration: row.duration,
    tags: row.tags ?? [],
    published: row.published,
    allowedEmails: row.allowed_emails ?? row.allowedEmails ?? [],
    hasAccessCode: Boolean(row.has_access_code ?? row.hasAccessCode ?? row.access_code),
    accessCode: row.access_code ?? row.accessCode ?? null,
    startAt: row.start_at,
    endAt: row.end_at,
    securitySettings: rowToSecuritySettings(row.security_settings ?? row.securitySettings),
    createdBy: row.created_by ?? '',
    createdAt: row.created_at,
    questions: (row.questions ?? []).slice().sort((a: any, b: any) => a.position - b.position).map(rowToQuestion),
});

interface TestsResponse {
    tests: any[];
}

interface TestResponse {
    test: any;
}

interface QuestionResponse {
    question: any;
}

interface QuestionsResponse {
    questions: any[];
}

export const TestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { activeOrg } = useOrg();
    const { user } = useAuth();
    const [tests, setTests] = useState<Test[]>([]);
    const [loading, setLoading] = useState(false);
    const activeOrgId = activeOrg?.id;
    const userId = user?.id;

    const fetchTests = useCallback(async () => {
        if (user?.role === 'student') {
            setLoading(true);
            try {
                const data = await apiRequest<TestsResponse>('/student/tests');
                setTests((data.tests ?? []).map(rowToTest));
            } catch {
                setTests([]);
            } finally {
                setLoading(false);
            }
            return;
        }

        if (!activeOrgId) {
            setTests([]);
            return;
        }

        setLoading(true);
        try {
            const data = await apiRequest<TestsResponse>(`/orgs/${activeOrgId}/tests`);
            setTests((data.tests ?? []).map(rowToTest));
        } catch {
            setTests([]);
        } finally {
            setLoading(false);
        }
    }, [activeOrgId, user?.role]);

    useEffect(() => {
        void fetchTests();
    }, [fetchTests]);

    const getTest = useCallback((id: string) => tests.find(test => test.id === id), [tests]);

    const createTest = useCallback(async (
        data: Omit<Test, 'id' | 'createdAt' | 'questions' | 'published' | 'allowedEmails' | 'hasAccessCode' | 'accessCode' | 'securitySettings' | 'created_by' | 'org_id'>
    ): Promise<Test | null> => {
        if (!activeOrgId || !userId) return null;

        try {
            const result = await apiRequest<TestResponse>('/tests', {
                method: 'POST',
                body: { ...data, orgId: activeOrgId },
            });
            const created = rowToTest(result.test);
            setTests(prev => [created, ...prev]);
            return created;
        } catch {
            return null;
        }
    }, [activeOrgId, userId]);

    const updateTest = useCallback(async (id: string, data: Partial<Omit<Test, 'id' | 'createdAt' | 'questions' | 'allowedEmails' | 'hasAccessCode' | 'accessCode' | 'orgId'>>) => {
        const { createdBy: _createdBy, ...rest } = data as Partial<Test>;
        const payload = {
            title: rest.title,
            description: rest.description,
            duration: rest.duration,
            tags: rest.tags,
            published: rest.published,
            startAt: rest.startAt,
            endAt: rest.endAt,
            securitySettings: rest.securitySettings
                ? {
                    webcam: rest.securitySettings.webcam,
                    microphone: rest.securitySettings.microphone,
                    tab_switch: rest.securitySettings.tabSwitch,
                    fullscreen: rest.securitySettings.fullscreen,
                    laptop_only: rest.securitySettings.laptopOnly,
                }
                : undefined,
        };

        try {
            const result = await apiRequest<TestResponse>(`/tests/${id}`, {
                method: 'PATCH',
                body: payload,
            });
            const updated = rowToTest(result.test);
            setTests(prev => prev.map(test => (test.id === id ? updated : test)));
        } catch {
            // Keep local state untouched on failure.
        }
    }, []);

    const deleteTest = useCallback(async (id: string) => {
        try {
            await apiRequest(`/tests/${id}`, { method: 'DELETE' });
            setTests(prev => prev.filter(test => test.id !== id));
        } catch {
            // Keep the existing list on failure.
        }
    }, []);

    const publishTest = useCallback(async (id: string, options?: { allowedEmails: string[] }) => {
        const result = await apiRequest<TestResponse>(`/tests/${id}`, {
            method: 'PATCH',
            body: {
                published: true,
                allowedEmails: options?.allowedEmails,
            },
        });
        const updated = rowToTest(result.test);
        setTests(prev => prev.map(test => (test.id === id ? updated : test)));
    }, []);

    const unpublishTest = useCallback(async (id: string) => {
        await updateTest(id, { published: false });
    }, [updateTest]);

    const addQuestion = useCallback(async (testId: string, question: Omit<Question, 'id'>) => {
        try {
            const result = await apiRequest<QuestionResponse>(`/tests/${testId}/questions`, {
                method: 'POST',
                body: question,
            });
            const created = rowToQuestion(result.question);
            setTests(prev => prev.map(test => (
                test.id === testId
                    ? { ...test, questions: [...test.questions, created] }
                    : test
            )));
        } catch {
            // Keep editor state untouched on failure.
        }
    }, []);

    const addQuestionsBulk = useCallback(async (testId: string, questions: Omit<Question, 'id'>[]) => {
        try {
            const result = await apiRequest<QuestionsResponse>(`/tests/${testId}/questions/bulk`, {
                method: 'POST',
                body: { questions },
            });
            const created = (result.questions ?? []).map(rowToQuestion);
            setTests(prev => prev.map(test => (
                test.id === testId
                    ? { ...test, questions: [...test.questions, ...created] }
                    : test
            )));
            return { created, error: null };
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
                try {
                    const created: Question[] = [];
                    for (const question of questions) {
                        const result = await apiRequest<QuestionResponse>(`/tests/${testId}/questions`, {
                            method: 'POST',
                            body: question,
                        });
                        created.push(rowToQuestion(result.question));
                    }

                    setTests(prev => prev.map(test => (
                        test.id === testId
                            ? { ...test, questions: [...test.questions, ...created] }
                            : test
                    )));

                    return { created, error: null };
                } catch (fallbackError) {
                    return {
                        created: [],
                        error: fallbackError instanceof Error ? fallbackError.message : 'Failed to import questions.',
                    };
                }
            }

            return {
                created: [],
                error: error instanceof Error ? error.message : 'Failed to import questions.',
            };
        }
    }, []);

    const updateQuestion = useCallback(async (testId: string, qId: string, data: Partial<Question>) => {
        const payload = { ...data } as Record<string, unknown>;
        delete payload.id;
        delete payload.type;

        try {
            const result = await apiRequest<QuestionResponse>(`/questions/${qId}`, {
                method: 'PATCH',
                body: payload,
            });
            const updated = rowToQuestion(result.question);
            setTests(prev => prev.map(test => (
                test.id === testId
                    ? { ...test, questions: test.questions.map(question => (question.id === qId ? updated : question)) }
                    : test
            )));
        } catch {
            // Keep question edits local on failure.
        }
    }, []);

    const deleteQuestion = useCallback(async (testId: string, qId: string) => {
        try {
            await apiRequest(`/questions/${qId}`, { method: 'DELETE' });
            setTests(prev => prev.map(test => (
                test.id === testId
                    ? { ...test, questions: test.questions.filter(question => question.id !== qId) }
                    : test
            )));
        } catch {
            // Keep the question list unchanged on failure.
        }
    }, []);

    const reorderQuestions = useCallback(async (testId: string, questions: Question[]) => {
        try {
            const result = await apiRequest<QuestionsResponse>(`/tests/${testId}/questions/reorder`, {
                method: 'POST',
                body: {
                    questionIds: questions.map(question => question.id),
                },
            });
            const reordered = (result.questions ?? []).map(rowToQuestion);
            setTests(prev => prev.map(test => (
                test.id === testId
                    ? { ...test, questions: reordered }
                    : test
            )));
        } catch {
            setTests(prev => prev.map(test => (
                test.id === testId
                    ? { ...test, questions }
                    : test
            )));
        }
    }, []);

    return (
        <TestContext.Provider value={{
            tests,
            loading,
            getTest,
            createTest,
            updateTest,
            deleteTest,
            publishTest,
            unpublishTest,
            addQuestion,
            addQuestionsBulk,
            updateQuestion,
            deleteQuestion,
            reorderQuestions,
            refetch: fetchTests,
        }}
        >
            {children}
        </TestContext.Provider>
    );
};

export const useTests = () => {
    const ctx = useContext(TestContext);
    if (!ctx) throw new Error('useTests must be used within TestProvider');
    return ctx;
};
