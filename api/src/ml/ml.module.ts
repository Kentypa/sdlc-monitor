import { Module } from '@nestjs/common';
import { MlService } from './ml.service';
import { MlController } from './ml.controller';
import { MetricsModule } from '../metrics/metrics.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [MetricsModule, PrismaModule],
  controllers: [MlController],
  providers: [MlService],
})
export class MlModule {}
