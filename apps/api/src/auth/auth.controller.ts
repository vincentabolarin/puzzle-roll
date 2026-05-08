import { Controller, Post, Delete, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AnonymousSessionDto,
  AuthResponseDto,
  UpgradeAccountDto,
} from './auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { EmailService } from '../email/email.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register with email and password' })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('anonymous')
  @ApiOperation({ summary: 'Create or restore anonymous session' })
  async anonymous(@Body() dto: AnonymousSessionDto): Promise<AuthResponseDto> {
    return this.authService.createAnonymousSession(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upgrade')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upgrade anonymous account to registered account' })
  async upgrade(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpgradeAccountDto
  ): Promise<AuthResponseDto> {
    return this.authService.upgradeAccount(user.sub, dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  async forgotPassword(@Body() body: { email: string }): Promise<{ message: string }> {
    const result = await this.authService.requestPasswordReset(body.email);
    if (result?.resetUrl) {
      try { await this.emailService.sendPasswordResetEmail(body.email, result.resetUrl); } catch {}
    }
    return { message: 'If that email is registered, a reset link has been sent.' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from email' })
  async resetPassword(@Body() body: { token: string; password: string }): Promise<{ message: string }> {
    await this.authService.resetPassword(body.token, body.password);
    return { message: 'Password reset successfully.' };
  }

  @Delete('account')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete own account — PII removed, stats retained' })
  async deleteAccount(@CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    await this.authService.deleteAccount(user.sub);
    return { message: 'Account deleted.' };
  }

}