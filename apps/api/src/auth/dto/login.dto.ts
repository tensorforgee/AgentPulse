import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from '../auth.utils';

export class LoginDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? normalizeEmail(value) : (value as unknown),
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}
