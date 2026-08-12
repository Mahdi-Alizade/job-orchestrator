import { IsString, IsNotEmpty, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CommandOptionDto {
  @IsString()
  @IsNotEmpty()
  key: string = ''; // Default empty string to avoid TS strict errors

  @IsString()
  @IsNotEmpty()
  value: string = '';
}

export class ExecuteTaskDto {
  @IsString()
  @IsNotEmpty()
  repoUrl: string = '';

  @IsString()
  @IsNotEmpty()
  imageName: string = '';

  @IsString()
  @IsNotEmpty()
  command: string = '';

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CommandOptionDto)
  options?: CommandOptionDto[];
}