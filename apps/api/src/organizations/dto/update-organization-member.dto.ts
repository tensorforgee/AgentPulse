import { IsIn, IsString } from 'class-validator';
import {
  ORGANIZATION_ROLES,
  type OrganizationRole,
} from '../organization.types';

export class UpdateOrganizationMemberDto {
  @IsString()
  @IsIn(ORGANIZATION_ROLES)
  role!: OrganizationRole;
}
