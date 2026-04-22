import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Puzzle Roll API')
      .setDescription('Backend API for Puzzle Roll — 10 daily logic puzzle games')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`🎲 Puzzle Roll API running on port ${port}`);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }

  Logger.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🟠 Puzzle Roll API                                            ║
║                                                              ║
║   🚀  Running on port ${port}                                   ║
║                                                               ║
║   🔧  Environment:   ${(process.env.NODE_ENV ?? 'development').padEnd(12)}                ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);

  if (process.env.NODE_ENV !== 'production') {
    Logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap().catch((error: Error) => {
  console.error('❌ Failed to start Puzzle Roll API:', error.message);
  console.error(error.stack);
  process.exit(1);
});
