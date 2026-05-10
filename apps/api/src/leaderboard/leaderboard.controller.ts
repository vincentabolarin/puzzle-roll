import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { GameType } from '@puzzle-roll/shared';

@ApiTags('leaderboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get(':gameType/daily')
  async getDailyLeaderboard(
    @Param('gameType') gameType: GameType,
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.leaderboardService.getDailyLeaderboard(
      gameType,
      user.sub,
      limit ? Math.min(parseInt(limit), 100) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get(':gameType/alltime')
  @ApiOperation({ summary: 'Get all-time leaderboard for a game type' })
  async getAllTimeLeaderboard(@Param('gameType') gameType: GameType, @Query('limit') limit?: string,
    @Query('offset') offset?: string) {
    return this.leaderboardService.getAllTimeLeaderboard(gameType, limit ? Math.min(parseInt(limit), 100) : 50,
      offset ? parseInt(offset) : 0,);
  }

  @Get(':gameType/weekly')
  @ApiOperation({ summary: 'Get weekly leaderboard — top players over the last 7 days' })
  async getWeeklyLeaderboard(@Param('gameType') gameType: GameType, @Query('limit') limit?: string,
    @Query('offset') offset?: string) {
    return this.leaderboardService.getWeeklyLeaderboard(gameType, limit ? Math.min(parseInt(limit), 100) : 50,
      offset ? parseInt(offset) : 0,);
  }

}