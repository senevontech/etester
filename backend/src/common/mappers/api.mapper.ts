import { AttemptStatus, QuestionType, TestDifficulty, TestVisibility, UserRole } from '@prisma/client';

export const toApiRole = (role: UserRole): 'admin' | 'student' => (role === UserRole.ADMIN ? 'admin' : 'student');
export const toDbRole = (role: 'admin' | 'student'): UserRole => (role === 'admin' ? UserRole.ADMIN : UserRole.STUDENT);

export const toApiDifficulty = (difficulty: TestDifficulty): 'Easy' | 'Medium' | 'Hard' => {
  if (difficulty === TestDifficulty.EASY) return 'Easy';
  if (difficulty === TestDifficulty.HARD) return 'Hard';
  return 'Medium';
};

export const toDbDifficulty = (difficulty: string): TestDifficulty => {
  if (difficulty === 'Easy') return TestDifficulty.EASY;
  if (difficulty === 'Hard') return TestDifficulty.HARD;
  return TestDifficulty.MEDIUM;
};

export const toApiVisibility = (visibility: TestVisibility): 'assigned_only' | 'org_public' =>
  visibility === TestVisibility.ORG_PUBLIC ? 'org_public' : 'assigned_only';

export const toDbVisibility = (visibility: string): TestVisibility =>
  visibility === 'org_public' ? TestVisibility.ORG_PUBLIC : TestVisibility.ASSIGNED_ONLY;

export const toApiQuestionType = (type: QuestionType): 'mcq' | 'code' | 'text' | 'numeric' => {
  if (type === QuestionType.CODE) return 'code';
  if (type === QuestionType.TEXT) return 'text';
  if (type === QuestionType.NUMERIC) return 'numeric';
  return 'mcq';
};

export const toDbQuestionType = (type: string): QuestionType => {
  if (type === 'code') return QuestionType.CODE;
  if (type === 'text') return QuestionType.TEXT;
  if (type === 'numeric') return QuestionType.NUMERIC;
  return QuestionType.MCQ;
};

export const toApiAttemptStatus = (status: AttemptStatus): 'active' | 'in_progress' | 'submitted' | 'expired' | 'abandoned' | 'completed' => {
  if (status === AttemptStatus.ACTIVE) return 'active';
  if (status === AttemptStatus.SUBMITTED) return 'submitted';
  if (status === AttemptStatus.EXPIRED) return 'expired';
  if (status === AttemptStatus.ABANDONED) return 'abandoned';
  if (status === AttemptStatus.COMPLETED) return 'completed';
  return 'in_progress';
};
