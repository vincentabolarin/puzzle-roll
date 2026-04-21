import {
  IsBoolean, IsInt, IsOptional, IsString,
  MaxLength, Max, Min, Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUsernameDto {
  @ApiProperty({ example: 'PuzzleMaster99', minLength: 2, maxLength: 20 })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  // 2–20 chars, alphanumeric + underscores + hyphens, no leading/trailing special chars
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,18}[a-zA-Z0-9]$|^[a-zA-Z0-9]{1,20}$/, {
    message: 'Username must be 2–20 characters, letters/numbers/underscores/hyphens only',
  })
  @MaxLength(20)
  username!: string;
}

export class UpdateNotificationsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 23 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  notificationHour?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  timezoneOffsetMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pushToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^(ios|android)$/, { message: 'Platform must be ios or android' })
  platform?: string;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hapticsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoRemoveNotes?: boolean;
}