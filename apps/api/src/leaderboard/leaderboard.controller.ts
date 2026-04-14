import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('leaderboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get(':gameType/daily')
  @ApiOperation({ summary: "Get today's daily leaderboard for a game type" })
  async getDailyLeaderboard(
    @Param('gameType') gameType: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.leaderboardService.getDailyLeaderboard(gameType, user.sub);
  }

  @Get(':gameType/alltime')
  @ApiOperation({ summary: 'Get all-time leaderboard for a game type' })
  async getAllTimeLeaderboard(@Param('gameType') gameType: string) {
    return this.leaderboardService.getAllTimeLeaderboard(gameType);
  }
}
