import { Controller, Get, Logger } from '@nestjs/common';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  @Get('health')
  getHealth() {
    this.logger.log('Incoming request: [GET] /api/health');
    return {
      status: 'ok',
      time: new Date(),
    };
  }
}
