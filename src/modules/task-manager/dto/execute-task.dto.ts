import { IsString, IsNotEmpty, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CommandOptionDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class ExecuteTaskDto {
  @IsString()
  @IsNotEmpty()
  repoUrl: string; // URL گیت‌هاب یا لینک مستقیم فایل

  @IsString()
  @IsNotEmpty()
  imageName: string; // اسم ایمیج داکر برای اجرای تست (مثلا node:latest)

  @IsString()
  @IsNotEmpty()
  command: string; // دستوری که داخل کانتینر اجرا میشه (مثلا npm test)

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CommandOptionDto)
  options?: CommandOptionDto[];
}