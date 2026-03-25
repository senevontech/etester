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
}

export interface McqQuestion extends BaseQuestion {
    type: 'mcq';
    category: 'mcq' | 'aptitude';
    options: string[];
    answer?: number; // only available to privileged/admin clients
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

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Test {
    id: string;
    title: string;
    description: string;
    duration: number; // minutes
    difficulty: Difficulty;
    tags: string[];
    questions: Question[];
    published: boolean;
    createdAt: string;
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
    answers: AnswerPayload[];
    score: number;
    totalPoints: number;
    integrityScore: number;
    violationsCount: number;
    integrityEvents: IntegrityEvent[];
    submittedAt: string;
}
