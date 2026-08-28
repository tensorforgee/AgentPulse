import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsIn, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../auth/auth.utils';

export const INVITABLE_ORGANIZATION_ROLES = [
  'admin',
  'member',
  'viewer',
] as const;

export type InvitableOrganizationRole =
  (typeof INVITABLE_ORGANIZATION_ROLES)[number];

export class CreateOrganizationInviteDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? normalizeEmail(value) : (value as unknown),
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsIn(INVITABLE_ORGANIZATION_ROLES)
  role!: InvitableOrganizationRole;
}
