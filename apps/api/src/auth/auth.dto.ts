import {
  IsEmail, IsString, MinLength, MaxLength,
  IsOptional, IsUUID, Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Trim and lowercase email before validation */
function transformEmail({ value }: { value: unknown }): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(transformEmail)
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @ApiProperty({ example: 'securePassword123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password too long' }) // bcrypt max
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(transformEmail)
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class AnonymousSessionDto {
  @ApiPropertyOptional({ description: 'Existing device UUID — omit for new anonymous session' })
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}

export class UpgradeAccountDto {
  @ApiProperty()
  @Transform(transformEmail)
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72)
  password!: string;
}

export class AuthResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() isAnonymous!: boolean;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}