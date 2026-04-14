import { Controller, Get, Patch, Body, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateNotificationsDto, UpdateSettingsDto } from './users.dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile with settings and stats' })
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  @Get('me/stats')
  @ApiOperation({ summary: 'Get current user stats for all game types' })
  async getStats(@CurrentUser() user: JwtPayload) {
    return this.usersService.getStats(user.sub);
  }

  @Patch('me/notifications')
  @ApiOperation({ summary: 'Update push notification settings and token' })
  async updateNotifications(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotificationsDto
  ) {
    return this.usersService.updateNotifications(user.sub, dto);
  }

  @Patch('me/settings')
  @ApiOperation({ summary: 'Update app settings (sound, haptics, notes)' })
  async updateSettings(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSettingsDto
  ) {
    return this.usersService.updateSettings(user.sub, dto);
  }

  @Get(':userId/stats')
  @ApiOperation({ summary: 'Get stats for a specific user (for leaderboard profiles)' })
  async getUserStats(@Param('userId') userId: string) {
    return this.usersService.getStats(userId);
  }
}
