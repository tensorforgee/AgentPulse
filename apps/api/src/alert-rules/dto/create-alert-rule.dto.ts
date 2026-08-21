import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { ALERT_RULE_TYPES, type AlertRuleType } from '../alert-rule.types';

export class CreateAlertRuleDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsIn([...ALERT_RULE_TYPES])
  type!: AlertRuleType;

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 8 })
  @IsPositive()
  threshold!: number;
}
