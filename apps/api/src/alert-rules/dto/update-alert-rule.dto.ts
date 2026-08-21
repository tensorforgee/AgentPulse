import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { ALERT_RULE_TYPES, type AlertRuleType } from '../alert-rule.types';

export class UpdateAlertRuleDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn([...ALERT_RULE_TYPES])
  type?: AlertRuleType;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 8 })
  @IsPositive()
  threshold?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
