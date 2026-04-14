import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { prisma } from '@puzzle-roll/database';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => ({
        database: {
          status: await prisma.$queryRaw`SELECT 1`
            .then(() => 'up' as const)
            .catch(() => 'down' as const),
        },
      }),
    ]);
  }
}
