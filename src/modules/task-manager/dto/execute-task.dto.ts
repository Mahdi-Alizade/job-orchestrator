import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUrl,
  MaxLength,
  Matches,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StepItemDto {
  @IsNotEmpty({ message: 'step name is required' })
  @IsString()
  @MaxLength(80, { message: 'step name cannot exceed 80 characters' })
  name!: string;

  @IsNotEmpty({ message: 'step command is required' })
  @IsString()
  @MaxLength(500, { message: 'step command cannot exceed 500 characters' })
  command!: string;

  @IsOptional()
  @IsBoolean()
  continueOnError?: boolean;
}

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

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'command cannot exceed 500 characters' })
  command?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepItemDto)
  steps?: StepItemDto[];

  @IsOptional()
  @IsObject({ message: 'env must be a valid key-value object of environment variables' })
  env?: Record<string, string>;

  @IsOptional()
  @IsString({ message: 'cacheKey must be a valid string' })
  @MaxLength(128, { message: 'cacheKey cannot exceed 128 characters' })
  cacheKey?: string;

  @IsOptional()
  @IsArray({ message: 'cachePaths must be an array of directory paths' })
  @IsString({ each: true, message: 'each cachePath must be a string' })
  cachePaths?: string[];

  @IsOptional()
  @IsUrl({}, { message: 'callbackUrl must be a valid HTTP or HTTPS URL' })
  callbackUrl?: string;

  @IsOptional()
  @IsString({ message: 'webhookSecret must be a valid string' })
  @MaxLength(128, { message: 'webhookSecret cannot exceed 128 characters' })
  webhookSecret?: string;
}