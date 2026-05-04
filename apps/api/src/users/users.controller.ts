import { Controller, Get, Patch, Delete, Body, UseGuards, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateNotificationsDto, UpdateSettingsDto, UpdateUsernameDto } from './users.dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GameType } from '@puzzle-roll/shared';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  @Get('me/stats')
  @ApiOperation({ summary: 'Get current user stats for all game types' })
  async getStats(@CurrentUser() user: JwtPayload) {
    return this.usersService.getStats(user.sub);
  }

  @Patch('me/username')
  @ApiOperation({ summary: 'Set or update display username (shown on leaderboards)' })
  async updateUsername(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUsernameDto
  ) {
    return this.usersService.updateUsername(user.sub, dto);
  }

  @Delete('me/stats')
  @ApiOperation({ summary: 'Clear stats — all games or a specific game type' })
  @ApiQuery({ name: 'gameType', required: false, enum: GameType })
  async clearStats(
    @CurrentUser() user: JwtPayload,
    @Query('gameType') gameType?: GameType
  ) {
    await this.usersService.clearStats(user.sub, gameType);
    return { message: 'Stats cleared' };
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
  @ApiOperation({ summary: 'Get stats for a specific user (leaderboard profiles)' })
  async getUserStats(@Param('userId') userId: string) {
    return this.usersService.getStats(userId);
  }
}