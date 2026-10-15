import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUrl,
  MaxLength,
  Matches,
} from 'class-validator';

export class ExecuteTaskDto {
  @IsOptional()
  @IsUrl({}, { message: 'repoUrl must be a valid HTTP or HTTPS URL' })
  repoUrl?: string;

  @IsNotEmpty({ message: 'imageName is required' })
  @IsString()
  @MaxLength(100, { message: 'imageName is too long' })
  @Matches(/^[a-z0-9_.-]+(:[a-z0-9_.-]+)?$/i, {
    message: 'imageName must follow valid docker tag format (e.g., node:18-alpine, python:3.11-slim)',
  })
  imageName!: string;

  @IsNotEmpty({ message: 'command is required' })
  @IsString()
  @MaxLength(500, { message: 'command cannot exceed 500 characters' })
  command!: string;

  @IsOptional()
  @IsUrl({}, { message: 'callbackUrl must be a valid HTTP or HTTPS URL' })
  callbackUrl?: string;

  @IsOptional()
  @IsString({ message: 'webhookSecret must be a valid string' })
  @MaxLength(128, { message: 'webhookSecret cannot exceed 128 characters' })
  webhookSecret?: string;
}