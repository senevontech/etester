export interface McqQuestion {
    id: string;
    type: 'mcq';
    title: string;
    description: string;
    options: string[];
    answer?: number; // only available to privileged/admin clients
    points: number;
}

export interface CodeQuestion {
    id: string;
    type: 'code';
    title: string;
    description: string;
    template: string;
    language: string;
    constraints: string[];
    examples: { input: string; output: string }[];
    testCases?: { id?: string; input: string; output: string; hidden: boolean }[];
    points: number;
}

export type Question = McqQuestion | CodeQuestion;

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
    type: 'mcq' | 'code';
    choice?: number; // for MCQ
    code?: string;   // for Code
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
