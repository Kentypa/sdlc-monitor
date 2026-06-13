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
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    RepositoriesModule,
    GithubModule,
    MetricsModule,
    MlModule,
  ],
  controllers: [AppController],
})
export class AppModule { }
