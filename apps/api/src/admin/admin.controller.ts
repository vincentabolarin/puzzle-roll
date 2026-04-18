// ─── Admin Controller ─────────────────────────────────────────────────────────

import { UseGuards, Controller, Logger, Get, Post, Body, CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { GameType } from "@puzzle-roll/database";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
class AdminKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.headers.get('x-admin-key');
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || key !== expected) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}

@ApiTags('admin')
@UseGuards(AdminKeyGuard)
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get platform statistics' })
  async getStats() {
    const [userCount, puzzleCount, completionCount, dailyCount] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.gamePuzzle.count(),
      this.prisma.gameCompletion.count(),
      this.prisma.dailyPuzzle.count(),
    ]);

    return { userCount, puzzleCount, completionCount, dailyCount };
  }

  @Get('daily-puzzles')
  @ApiOperation({ summary: 'List upcoming daily puzzle assignments' })
  async getDailyPuzzles() {
    const today = new Date().toISOString().slice(0, 10);
    return this.prisma.dailyPuzzle.findMany({
      where: { date: { gte: today } },
      orderBy: [{ gameType: 'asc' }, { date: 'asc' }],
      take: 100,
      include: {
        puzzle: { select: { id: true, gameType: true, difficulty: true } },
      },
    });
  }

  @Post('daily-puzzles/reassign')
  @ApiOperation({ summary: 'Reassign a daily puzzle for a specific date and game type' })
  async reassignDailyPuzzle(
    @Body() body: { gameType: GameType; date: string; puzzleId: string }
  ) {
    const updated = await this.prisma.dailyPuzzle.upsert({
      where: {
        gameType_date: {
          gameType: body.gameType,
          date: body.date,
        },
      },
      create: {
        gameType: body.gameType,
        date: body.date,
        puzzleId: body.puzzleId,
      },
      update: { puzzleId: body.puzzleId },
    });

    this.logger.log(`Reassigned daily puzzle for ${body.gameType} on ${body.date} to ${body.puzzleId}`);
    return updated;
  }
}