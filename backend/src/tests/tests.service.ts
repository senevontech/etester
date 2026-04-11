import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import { toApiDifficulty, toApiQuestionType, toApiVisibility, toDbDifficulty, toDbQuestionType, toDbVisibility } from '../common/mappers/api.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateTestDto } from './dto/create-test.dto';
import { ReorderQuestionsDto } from './dto/reorder-questions.dto';
import { SaveAssignmentsDto } from './dto/save-assignments.dto';

@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService
  ) {}

  async list(userId: string, orgId: string) {
    const membership = await this.organizationsService.assertMembership(userId, orgId);
    const assignedTestIds = membership.role === 'STUDENT' ? await this.getAssignedTestIds(userId) : null;

    const tests = await this.prisma.test.findMany({
      where: membership.role === 'ADMIN'
        ? { orgId }
        : {
            orgId,
            published: true,
            OR: [
              { visibility: 'ORG_PUBLIC' },
              ...(assignedTestIds && assignedTestIds.length > 0 ? [{ id: { in: assignedTestIds } }] : [])
            ]
          },
      include: {
        questions: {
          orderBy: { position: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return {
      tests: tests.map((test) => this.serializeTest(test, membership.role === 'ADMIN' ? 'admin' : 'student'))
    };
  }

  async create(userId: string, dto: CreateTestDto) {
    await this.organizationsService.assertAdmin(userId, dto.orgId);
    const test = await this.prisma.test.create({
      data: {
        orgId: dto.orgId,
        title: dto.title.trim(),
        description: dto.description?.trim() || '',
        duration: dto.duration,
        difficulty: toDbDifficulty(dto.difficulty),
        tags: dto.tags ?? [],
        visibility: toDbVisibility(dto.visibility),
        createdById: userId
      },
      include: { questions: true }
    });

    return { test: this.serializeTest(test, 'admin') };
  }

  async update(userId: string, testId: string, payload: Record<string, unknown>) {
    const test = await this.getTestOrThrow(testId);
    await this.organizationsService.assertAdmin(userId, test.orgId);

    if (payload.published === true && !test.published) {
      await this.assertReadyForPublish(testId);
    }

    const updated = await this.prisma.test.update({
      where: { id: testId },
      data: {
        title: payload.title !== undefined ? String(payload.title).trim() : undefined,
        description: payload.description !== undefined ? String(payload.description) : undefined,
        duration: payload.duration !== undefined ? Number(payload.duration) : undefined,
        difficulty: payload.difficulty !== undefined ? toDbDifficulty(String(payload.difficulty)) : undefined,
        tags: payload.tags !== undefined ? (Array.isArray(payload.tags) ? payload.tags.map(String) : []) : undefined,
        visibility: payload.visibility !== undefined ? toDbVisibility(String(payload.visibility)) : undefined,
        published: payload.published !== undefined ? Boolean(payload.published) : undefined,
        startAt: payload.startAt !== undefined ? (payload.startAt ? new Date(String(payload.startAt)) : null) : undefined
      },
      include: {
        questions: { orderBy: { position: 'asc' } }
      }
    });

    return { test: this.serializeTest(updated, 'admin') };
  }

  async remove(userId: string, testId: string) {
    const test = await this.getTestOrThrow(testId);
    await this.organizationsService.assertAdmin(userId, test.orgId);
    await this.prisma.test.delete({ where: { id: testId } });
    return { success: true };
  }

  async addQuestion(userId: string, testId: string, payload: Record<string, unknown>) {
    const test = await this.getTestOrThrow(testId);
    await this.organizationsService.assertAdmin(userId, test.orgId);
    const nextPosition = await this.prisma.question.count({ where: { testId } });

    const question = await this.prisma.question.create({
      data: this.toQuestionCreateInput(testId, payload, nextPosition)
    });

    return { question: this.serializeQuestion(question, 'admin') };
  }

  async addQuestionsBulk(userId: string, testId: string, payload: Array<Record<string, unknown>>) {
    const test = await this.getTestOrThrow(testId);
    await this.organizationsService.assertAdmin(userId, test.orgId);
    const existingCount = await this.prisma.question.count({ where: { testId } });

    await this.prisma.$transaction(
      payload.map((question, index) =>
        this.prisma.question.create({
          data: this.toQuestionCreateInput(testId, question, existingCount + index)
        })
      )
    );

    const created = await this.prisma.question.findMany({
      where: { testId },
      orderBy: { position: 'asc' }
    });

    return {
      questions: created.slice(existingCount).map((question) => this.serializeQuestion(question, 'admin'))
    };
  }

  async updateQuestion(userId: string, questionId: string, payload: Record<string, unknown>) {
    const question = await this.getQuestionOrThrow(questionId);
    const test = await this.getTestOrThrow(question.testId);
    await this.organizationsService.assertAdmin(userId, test.orgId);

    const updated = await this.prisma.question.update({
      where: { id: questionId },
      data: this.toQuestionUpdateInput(payload, question.type)
    });

    return { question: this.serializeQuestion(updated, 'admin') };
  }

  async removeQuestion(userId: string, questionId: string) {
    const question = await this.getQuestionOrThrow(questionId);
    const test = await this.getTestOrThrow(question.testId);
    await this.organizationsService.assertAdmin(userId, test.orgId);

    await this.prisma.question.delete({ where: { id: questionId } });
    const remaining = await this.prisma.question.findMany({
      where: { testId: test.id },
      orderBy: { position: 'asc' }
    });

    await this.prisma.$transaction(
      remaining.map((row, index) =>
        this.prisma.question.update({
          where: { id: row.id },
          data: { position: index }
        })
      )
    );

    return { success: true };
  }

  async reorderQuestions(userId: string, testId: string, dto: ReorderQuestionsDto) {
    const test = await this.getTestOrThrow(testId);
    await this.organizationsService.assertAdmin(userId, test.orgId);

    await this.prisma.$transaction(
      dto.questionIds.map((questionId, index) =>
        this.prisma.question.update({
          where: { id: questionId },
          data: { position: index }
        })
      )
    );

    const reordered = await this.prisma.question.findMany({
      where: { testId },
      orderBy: { position: 'asc' }
    });

    return { questions: reordered.map((question) => this.serializeQuestion(question, 'admin')) };
  }

  async getAssignments(userId: string, testId: string) {
    const test = await this.getTestOrThrow(testId);
    await this.organizationsService.assertMembership(userId, test.orgId);

    const assignments = await this.prisma.testAssignment.findMany({
      where: { testId }
    });

    return {
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        group_id: assignment.groupId,
        student_id: assignment.studentId,
        assigned_at: assignment.assignedAt.toISOString()
      }))
    };
  }

  async saveAssignments(userId: string, testId: string, dto: SaveAssignmentsDto) {
    const test = await this.getTestOrThrow(testId);
    await this.organizationsService.assertAdmin(userId, test.orgId);

    const groupIds = dto.groupIds?.map(String) ?? [];
    const studentIds = dto.studentIds?.map(String) ?? [];

    await this.prisma.$transaction([
      this.prisma.testAssignment.deleteMany({ where: { testId } }),
      ...groupIds.map((groupId) =>
        this.prisma.testAssignment.create({
          data: { testId, groupId }
        })
      ),
      ...studentIds.map((studentId) =>
        this.prisma.testAssignment.create({
          data: { testId, studentId }
        })
      )
    ]);

    return { success: true };
  }

  private async getAssignedTestIds(userId: string) {
    const directAssignments = await this.prisma.testAssignment.findMany({
      where: { studentId: userId },
      select: { testId: true }
    });

    const groupMemberships = await this.prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true }
    });

    const groupIds = groupMemberships.map((membership) => membership.groupId);
    const groupAssignments = groupIds.length > 0
      ? await this.prisma.testAssignment.findMany({
          where: { groupId: { in: groupIds } },
          select: { testId: true }
        })
      : [];

    return [...new Set([...directAssignments, ...groupAssignments].map((assignment) => assignment.testId))];
  }

  private async assertReadyForPublish(testId: string) {
    const [test, questions, assignmentsCount] = await Promise.all([
      this.getTestOrThrow(testId),
      this.prisma.question.findMany({ where: { testId } }),
      this.prisma.testAssignment.count({ where: { testId } })
    ]);

    const hasInvalidCodingQuestion = questions.some((question) =>
      question.type === QuestionType.CODE && !this.normalizeCodeTestCases(question.testCases).some((testCase) => testCase.hidden)
    );

    if (hasInvalidCodingQuestion) {
      throw new ForbiddenException('Every coding question must include at least one hidden test case before publishing.');
    }

    if (test.visibility === 'ASSIGNED_ONLY' && assignmentsCount === 0) {
      throw new ForbiddenException('Assigned-only tests must have at least one assigned group or student before publishing.');
    }
  }

  private async getTestOrThrow(testId: string) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) {
      throw new NotFoundException('Test not found.');
    }
    return test;
  }

  private async getQuestionOrThrow(questionId: string) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      throw new NotFoundException('Question not found.');
    }
    return question;
  }

  private serializeTest(
    test: Prisma.TestGetPayload<{ include: { questions: true } }>,
    role: 'admin' | 'student'
  ) {
    return {
      id: test.id,
      org_id: test.orgId,
      title: test.title,
      description: test.description,
      duration: test.duration,
      difficulty: toApiDifficulty(test.difficulty),
      tags: test.tags,
      visibility: toApiVisibility(test.visibility),
      published: test.published,
      start_at: test.startAt?.toISOString() ?? null,
      created_by: test.createdById,
      created_at: test.createdAt.toISOString(),
      questions: test.questions
        .sort((a, b) => a.position - b.position)
        .map((question) => this.serializeQuestion(question, role))
    };
  }

  private serializeQuestion(question: any, role: 'admin' | 'student') {
    const payload = {
      id: question.id,
      test_id: question.testId,
      type: toApiQuestionType(question.type),
      category: question.category,
      title: question.title,
      description: question.description,
      image_url: question.imageUrl,
      points: question.points,
      position: question.position,
      options: question.options,
      answer: question.answer,
      accepted_answers: question.acceptedAnswers,
      case_sensitive: question.caseSensitive,
      numeric_answer: question.numericAnswer,
      numeric_tolerance: question.numericTolerance,
      template: question.template,
      language: question.language,
      constraints: question.constraints,
      examples: question.examples,
      test_cases: question.testCases,
      created_at: question.createdAt.toISOString()
    };

    if (role === 'admin') {
      return payload;
    }

    if (payload.type === 'mcq') return { ...payload, answer: undefined };
    if (payload.type === 'text') return { ...payload, accepted_answers: undefined, case_sensitive: undefined };
    if (payload.type === 'numeric') return { ...payload, numeric_answer: undefined, numeric_tolerance: undefined };
    return { ...payload, test_cases: undefined };
  }

  private toQuestionCreateInput(testId: string, payload: Record<string, unknown>, position: number): Prisma.QuestionCreateInput {
    const type = toDbQuestionType(String(payload.type || 'mcq'));
    return {
      test: { connect: { id: testId } },
      type,
      category: String(payload.category || this.defaultCategory(type)),
      title: String(payload.title || '').trim(),
      description: String(payload.description || ''),
      imageUrl: payload.imageUrl !== undefined || payload.image_url !== undefined ? String((payload.imageUrl ?? payload.image_url) || '') : null,
      points: Number(payload.points || 0),
      position,
      options: type === QuestionType.MCQ ? (Array.isArray(payload.options) ? payload.options : []) : Prisma.JsonNull,
      answer: type === QuestionType.MCQ ? Number(payload.answer ?? 0) : null,
      acceptedAnswers: type === QuestionType.TEXT ? this.normalizeAcceptedAnswers(payload.acceptedAnswers ?? payload.accepted_answers) : Prisma.JsonNull,
      caseSensitive: type === QuestionType.TEXT ? Boolean(payload.caseSensitive ?? payload.case_sensitive) : false,
      numericAnswer: type === QuestionType.NUMERIC ? Number(payload.answer ?? payload.numeric_answer ?? 0) : null,
      numericTolerance: type === QuestionType.NUMERIC ? Math.max(0, Number(payload.tolerance ?? payload.numeric_tolerance ?? 0)) : 0,
      template: type === QuestionType.CODE ? String(payload.template || '') : null,
      language: type === QuestionType.CODE ? String(payload.language || 'typescript') : null,
      constraints: type === QuestionType.CODE ? (Array.isArray(payload.constraints) ? payload.constraints : []) : Prisma.JsonNull,
      examples: type === QuestionType.CODE ? (Array.isArray(payload.examples) ? payload.examples : []) : Prisma.JsonNull,
      testCases: type === QuestionType.CODE ? this.normalizeCodeTestCases(payload.testCases ?? payload.test_cases) : Prisma.JsonNull
    };
  }

  private toQuestionUpdateInput(payload: Record<string, unknown>, type: QuestionType): Prisma.QuestionUpdateInput {
    return {
      title: payload.title !== undefined ? String(payload.title).trim() : undefined,
      description: payload.description !== undefined ? String(payload.description) : undefined,
      imageUrl: payload.imageUrl !== undefined || payload.image_url !== undefined ? String((payload.imageUrl ?? payload.image_url) || '') : undefined,
      points: payload.points !== undefined ? Number(payload.points) : undefined,
      category: payload.category !== undefined ? String(payload.category) : undefined,
      options: type === QuestionType.MCQ && payload.options !== undefined ? (Array.isArray(payload.options) ? payload.options : []) : undefined,
      answer: type === QuestionType.MCQ && payload.answer !== undefined ? Number(payload.answer) : undefined,
      acceptedAnswers: type === QuestionType.TEXT && (payload.acceptedAnswers !== undefined || payload.accepted_answers !== undefined)
        ? this.normalizeAcceptedAnswers(payload.acceptedAnswers ?? payload.accepted_answers)
        : undefined,
      caseSensitive: type === QuestionType.TEXT && (payload.caseSensitive !== undefined || payload.case_sensitive !== undefined)
        ? Boolean(payload.caseSensitive ?? payload.case_sensitive)
        : undefined,
      numericAnswer: type === QuestionType.NUMERIC && (payload.answer !== undefined || payload.numeric_answer !== undefined)
        ? Number(payload.answer ?? payload.numeric_answer)
        : undefined,
      numericTolerance: type === QuestionType.NUMERIC && (payload.tolerance !== undefined || payload.numeric_tolerance !== undefined)
        ? Math.max(0, Number(payload.tolerance ?? payload.numeric_tolerance))
        : undefined,
      template: type === QuestionType.CODE && payload.template !== undefined ? String(payload.template) : undefined,
      language: type === QuestionType.CODE && payload.language !== undefined ? String(payload.language) : undefined,
      constraints: type === QuestionType.CODE && payload.constraints !== undefined ? (Array.isArray(payload.constraints) ? payload.constraints : []) : undefined,
      examples: type === QuestionType.CODE && payload.examples !== undefined ? (Array.isArray(payload.examples) ? payload.examples : []) : undefined,
      testCases: type === QuestionType.CODE && (payload.testCases !== undefined || payload.test_cases !== undefined)
        ? this.normalizeCodeTestCases(payload.testCases ?? payload.test_cases)
        : undefined
    };
  }

  private normalizeAcceptedAnswers(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20);
  }

  private normalizeCodeTestCases(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item === 'object')
      .slice(0, 20)
      .map((item: any, index) => ({
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `case-${index + 1}`,
        input: String(item.input || ''),
        output: String(item.output || ''),
        hidden: Boolean(item.hidden)
      }));
  }

  private defaultCategory(type: QuestionType) {
    if (type === QuestionType.CODE) return 'coding';
    if (type === QuestionType.TEXT) return 'saq';
    if (type === QuestionType.NUMERIC) return 'numerical';
    return 'mcq';
  }
}
