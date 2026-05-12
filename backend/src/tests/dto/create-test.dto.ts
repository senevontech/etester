import { IsArray, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateTestDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  duration!: number;

  @IsString()
  difficulty!: string;

  @IsArray()
  tags!: string[];

  @IsString()
  visibility!: string;

  @IsString()
  orgId!: string;
}
