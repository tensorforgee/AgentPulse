import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AcceptOrganizationInviteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token!: string;
}
