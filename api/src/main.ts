import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix for all API routes
  app.setGlobalPrefix('api');

  // Enable CORS for the React frontend
  app.enableCors({ origin: '*' });

  // Global validation pipe — автоматически валидирует DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Глобальний фільтр помилок
  const { AllExceptionsFilter } = await import('./common/filters/all-exceptions.filter');
  app.useGlobalFilters(new AllExceptionsFilter());

  // Фікс для Prisma BigInt (не серіалізується в JSON за замовчуванням)
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  // Swagger UI — документация API
  const config = new DocumentBuilder()
    .setTitle('SDLC Monitor API')
    .setDescription(
      'Интеллектуальная система предиктивного мониторинга SDLC на основе данных GitHub',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🚀 SDLC Monitor API running on: http://localhost:${port}/api`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
