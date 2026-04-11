import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateTestDto } from './dto/create-test.dto';
import { ReorderQuestionsDto } from './dto/reorder-questions.dto';
import { SaveAssignmentsDto } from './dto/save-assignments.dto';
import { TestsService } from './tests.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get('orgs/:orgId/tests')
  list(@CurrentUser() user: { sub: string }, @Param('orgId') orgId: string) {
    return this.testsService.list(user.sub, orgId);
  }

  @Post('tests')
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateTestDto) {
    return this.testsService.create(user.sub, dto);
  }

  @Patch('tests/:testId')
  update(@CurrentUser() user: { sub: string }, @Param('testId') testId: string, @Body() payload: Record<string, unknown>) {
    return this.testsService.update(user.sub, testId, payload);
  }

  @Delete('tests/:testId')
  remove(@CurrentUser() user: { sub: string }, @Param('testId') testId: string) {
    return this.testsService.remove(user.sub, testId);
  }

  @Post('tests/:testId/questions')
  addQuestion(@CurrentUser() user: { sub: string }, @Param('testId') testId: string, @Body() payload: Record<string, unknown>) {
    return this.testsService.addQuestion(user.sub, testId, payload);
  }

  @Post('tests/:testId/questions/bulk')
  addQuestionsBulk(@CurrentUser() user: { sub: string }, @Param('testId') testId: string, @Body('questions') questions: Array<Record<string, unknown>>) {
    return this.testsService.addQuestionsBulk(user.sub, testId, questions ?? []);
  }

  @Patch('questions/:questionId')
  updateQuestion(@CurrentUser() user: { sub: string }, @Param('questionId') questionId: string, @Body() payload: Record<string, unknown>) {
    return this.testsService.updateQuestion(user.sub, questionId, payload);
  }

  @Delete('questions/:questionId')
  removeQuestion(@CurrentUser() user: { sub: string }, @Param('questionId') questionId: string) {
    return this.testsService.removeQuestion(user.sub, questionId);
  }

  @Post('tests/:testId/questions/reorder')
  reorderQuestions(@CurrentUser() user: { sub: string }, @Param('testId') testId: string, @Body() dto: ReorderQuestionsDto) {
    return this.testsService.reorderQuestions(user.sub, testId, dto);
  }

  @Get('tests/:testId/assignments')
  getAssignments(@CurrentUser() user: { sub: string }, @Param('testId') testId: string) {
    return this.testsService.getAssignments(user.sub, testId);
  }

  @Post('tests/:testId/assignments')
  saveAssignments(@CurrentUser() user: { sub: string }, @Param('testId') testId: string, @Body() dto: SaveAssignmentsDto) {
    return this.testsService.saveAssignments(user.sub, testId, dto);
  }
}
