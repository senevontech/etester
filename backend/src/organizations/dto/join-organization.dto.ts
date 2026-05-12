import { IsString, Length } from 'class-validator';

export class JoinOrganizationDto {
  @IsString()
  @Length(8, 8)
  code!: string;
}
