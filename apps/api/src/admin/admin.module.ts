import {
  Module,
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { prisma } from '@puzzle-roll/database';

// ─── Admin API Key Guard ──────────────────────────────────────────────────────

@Injectable()
class AdminKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.headers['x-admin-key'];
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || key !== expected) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}

// ─── Admin Controller ─────────────────────────────────────────────────────────

@ApiTags('admin')
@UseGuards(AdminKeyGuard)
@Controller('admin')
class AdminController {
  private readonly logger = new Logger(AdminController.name);

  @Get('stats')
  @ApiOperation({ summary: 'Get platform statistics' })
  async getStats() {
    const [userCount, puzzleCount, completionCount, dailyCount] = await prisma.$transaction([
      prisma.user.count(),
      prisma.gamePuzzle.count(),
      prisma.gameCompletion.count(),
      prisma.dailyPuzzle.count(),
    ]);

    return { userCount, puzzleCount, completionCount, dailyCount };
  }

  @Get('daily-puzzles')
  @ApiOperation({ summary: 'List upcoming daily puzzle assignments' })
  async getDailyPuzzles() {
    const today = new Date().toISOString().slice(0, 10);
    return prisma.dailyPuzzle.findMany({
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
    @Body() body: { gameType: string; date: string; puzzleId: string }
  ) {
    const updated = await prisma.dailyPuzzle.upsert({
      where: {
        gameType_date: {
          gameType: body.gameType as Parameters<typeof prisma.dailyPuzzle.upsert>[0]['where']['gameType_date']['gameType'],
          date: body.date,
        },
      },
      create: {
        gameType: body.gameType as Parameters<typeof prisma.dailyPuzzle.create>[0]['data']['gameType'],
        date: body.date,
        puzzleId: body.puzzleId,
      },
      update: { puzzleId: body.puzzleId },
    });

    this.logger.log(`Reassigned daily puzzle for ${body.gameType} on ${body.date} to ${body.puzzleId}`);
    return updated;
  }
}

// ─── Admin Module ─────────────────────────────────────────────────────────────

@Module({
  controllers: [AdminController],
})
export class AdminModule {}
