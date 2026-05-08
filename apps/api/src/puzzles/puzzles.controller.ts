import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PuzzlesService } from './puzzles.service';
import { GetPuzzlesQueryDto } from './puzzles.dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { GameType } from '@puzzle-roll/shared';

@ApiTags('puzzles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('puzzles')
export class PuzzlesController {
  constructor(private readonly puzzlesService: PuzzlesService) {}

  @Get(':gameType/daily')
  @ApiOperation({ summary: "Get today's daily puzzle for a game type" })
  async getDailyPuzzle(@Param('gameType') gameType: GameType) {
    return this.puzzlesService.getDailyPuzzle(gameType);
  }

  @Get(':gameType')
  @ApiOperation({ summary: 'Get paginated puzzles for a game type' })
  async getPuzzles(
    @Param('gameType') gameType: GameType,
    @Query() query: GetPuzzlesQueryDto
  ) {
    return this.puzzlesService.getPuzzles(gameType, query);
  }

  @Get('id/:id')
  @ApiOperation({ summary: 'Get a specific puzzle by ID' })
  async getPuzzleById(@Param('id') id: string) {
    return this.puzzlesService.getPuzzleById(id, false);
  }

  @Get('id/:id/solution')
  @ApiOperation({ summary: 'Get puzzle solution — JWT required' })
  async getPuzzleSolution(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.puzzlesService.getPuzzleSolution(id, user.sub);
  }
}