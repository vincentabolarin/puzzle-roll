import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PuzzlesService } from './puzzles.service';
import { GetPuzzlesQueryDto } from './puzzles.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('puzzles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('puzzles')
export class PuzzlesController {
  constructor(private readonly puzzlesService: PuzzlesService) {}

  @Get(':gameType/daily')
  @ApiOperation({ summary: "Get today's daily puzzle for a game type" })
  async getDailyPuzzle(@Param('gameType') gameType: string) {
    return this.puzzlesService.getDailyPuzzle(gameType);
  }

  @Get(':gameType')
  @ApiOperation({ summary: 'Get paginated puzzles for a game type' })
  async getPuzzles(
    @Param('gameType') gameType: string,
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
  @ApiOperation({ summary: 'Get puzzle solution (used by client after completion)' })
  async getPuzzleSolution(@Param('id') id: string) {
    return this.puzzlesService.getPuzzleSolution(id);
  }
}
