import { IsArray } from 'class-validator';

export class ReorderQuestionsDto {
  @IsArray()
  questionIds!: string[];
}
