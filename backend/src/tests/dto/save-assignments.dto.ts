import { IsArray, IsOptional } from 'class-validator';

export class SaveAssignmentsDto {
  @IsOptional()
  @IsArray()
  groupIds?: string[];

  @IsOptional()
  @IsArray()
  studentIds?: string[];
}
