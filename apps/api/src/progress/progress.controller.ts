import { Controller, Post, Get, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProgressService } from './progress.service';
import { CompleteGameDto, SyncProgressDto } from './progress.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('progress')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Post('complete')
  @ApiOperation({ summary: 'Submit a completed game result' })
  async complete(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CompleteGameDto
  ) {
    return this.progressService.completeGame(user.sub, dto);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flush offline queue — batch submit completions' })
  async sync(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SyncProgressDto
  ) {
    return this.progressService.syncProgress(user.sub, dto);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get progress for a user (own only)' })
  async getUserProgress(
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.progressService.getUserProgress(userId, user.sub);
  }
}
