import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeOrganizationSlug } from '../organization.utils';

export class UpdateOrganizationDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string'
      ? normalizeOrganizationSlug(value)
      : (value as unknown),
  )
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must contain lowercase letters, numbers, and single hyphens only',
  })
  slug?: string;
}
