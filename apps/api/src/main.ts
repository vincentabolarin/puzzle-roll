import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/logger.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap(): Promise<void> {
  const logger = new AppLogger();
  const app = await NestFactory.create(AppModule, { logger });

  // ─── Security headers ───────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  }));

  // ─── API prefix + URI versioning ────────────────────────────────────────
  // Accessible at /api/... (defaultVersion=1, so /api/users = /api/v1/users)
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  // ─── CORS ──────────────────────────────────────────────────────────────
  // React Native clients do NOT send an Origin header — CORS is irrelevant
  // for the mobile app. This config only matters for browser-based clients
  // (admin dashboard, Swagger UI in dev, future web app).
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',').map(o => o.trim()).filter(Boolean);

  app.enableCors({
    origin: process.env.NODE_ENV === 'production'
      ? (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
          // No origin = mobile app / Postman / server-to-server — always allow
          if (!origin) return cb(null, true);
          if (allowedOrigins.includes(origin)) return cb(null, true);
          cb(new Error(`Origin ${origin} not allowed by CORS`));
        }
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ─── Global validation ──────────────────────────────────────────────────
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ─── Swagger (dev only) ─────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Puzzle Roll API')
      .setDescription('Backend API for Puzzle Roll — daily logic puzzle games')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
    logger.log(`Swagger: http://localhost:${process.env.PORT ?? 3000}/api/docs`, 'Bootstrap');
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`Listening on port ${port} [${process.env.NODE_ENV ?? 'development'}]`, 'Bootstrap');
}

bootstrap().catch(err => { console.error('Bootstrap failed:', err); process.exit(1); });