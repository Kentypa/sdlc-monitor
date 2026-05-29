import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { MetricsModule } from './metrics/metrics.module';
import { GithubModule } from './github/github.module';
import { MlModule } from './ml/ml.module';

import { AppController } from './app.controller';

@Module({
  imports: [
    // Глобальная конфигурация из .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Prisma ORM — глобальный модуль
    PrismaModule,
    // GitHub синхронизация и репозитории
    RepositoriesModule,
    GithubModule,
    MetricsModule,
    MlModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
