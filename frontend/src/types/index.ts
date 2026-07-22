export type QuestionType = 'mcq' | 'code' | 'text' | 'numeric';
export type QuestionCategory = 'mcq' | 'saq' | 'aptitude' | 'coding' | 'numerical';

export const QUESTION_CATEGORIES: QuestionCategory[] = ['mcq', 'saq', 'aptitude', 'coding', 'numerical'];

export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
    mcq: 'Multiple Choice',
    saq: 'Short Answer',
    aptitude: 'Aptitude',
    coding: 'Coding',
    numerical: 'Numerical',
};

interface BaseQuestion {
    id: string;
    type: QuestionType;
    category: QuestionCategory;
    title: string;
    description: string;
    imageUrl?: string;
    points: number;
    practiceEnabled?: boolean;
}

export interface McqQuestion extends BaseQuestion {
    type: 'mcq';
    category: 'mcq' | 'aptitude';
    options: string[];
    answer?: number; // only available to privileged/subadmin clients
}

export interface CodeQuestion extends BaseQuestion {
    type: 'code';
    category: 'coding';
    template: string;
    language: string;
    constraints: string[];
    examples: { input: string; output: string }[];
    testCases?: { id?: string; input: string; output: string; hidden: boolean }[];
}

export interface TextQuestion extends BaseQuestion {
    type: 'text';
    category: 'saq';
    acceptedAnswers: string[];
    caseSensitive: boolean;
}

export interface NumericQuestion extends BaseQuestion {
    type: 'numeric';
    category: 'numerical';
    answer?: number;
    tolerance: number;
}

export type Question = McqQuestion | CodeQuestion | TextQuestion | NumericQuestion;

export interface Test {
    id: string;
    title: string;
    description: string;
    duration: number; // minutes
    tags: string[];
    questions: Question[];
    published: boolean;
    negativeMarkingEnabled: boolean;
    negativeMarkValue: number;
    showAnswersAfterExam: boolean;
    practiceEnabled?: boolean;
    allowedEmails?: string[];
    hasAccessCode?: boolean;
    accessCode?: string | null;
    startAt?: string;
    endAt?: string;
    orgId: string;
    createdBy: string;
    createdAt: string;
}

// ─── Attempt & Proctoring Models ──────────────────────────────────────────────

export interface TestAttempt {
    id: string;
    testId: string;
    studentId: string;
    startedAt: string;
    completedAt?: string;
    status: 'in_progress' | 'completed' | 'abandoned';
    violationScore: number;
    ipAddress?: string;
    userAgent?: string;
}

export interface AttemptLog {
    id: string;
    attemptId: string;
    eventType: 'tab_switch' | 'camera_off' | 'face_not_detected' | 'multiple_faces' | 'suspicious_activity' | 'started' | 'submitted';
    details: any;
    timestamp: string;
}

// ─── Submission Models ───────────────────────────────────────────────────────

export interface AnswerPayload {
    questionId: string;
    type: QuestionType;
    choice?: number;    // for MCQ
    code?: string;      // for Code
    language?: string;  // for Code
    response?: string;  // for short answer / numerical
    pointsEarned: number;
    negativeMarkApplied?: boolean;
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
    studentId: string;
    studentName: string;
    attemptId?: string;
    answers: AnswerPayload[];
    score: number;
    totalPoints: number;
    integrityScore: number;
    violationsCount: number;
    integrityEvents: IntegrityEvent[];
    autoSubmitted?: boolean;
    autoSubmitReason?: string | null;
    startedAt?: string | null;
    expiresAt?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    submittedAt: string;
}
