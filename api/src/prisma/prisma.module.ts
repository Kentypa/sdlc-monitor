import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() делает PrismaService доступным во всём приложении
// без необходимости импортировать PrismaModule в каждом модуле
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
