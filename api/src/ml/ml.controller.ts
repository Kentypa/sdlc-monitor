import { Controller, Get, Param, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { MlService } from './ml.service';

@ApiTags('ml')
@Controller('ml')
export class MlController {
  private readonly logger = new Logger(MlController.name);

  constructor(private readonly mlService: MlService) {}

  @Get(':owner/:repo/predict')
  @ApiOperation({ summary: 'OLS Lead Time Prediction — прогнозування часу виконання PR (лінійна регресія)' })
  @ApiParam({ name: 'owner', example: 'nestjs' })
  @ApiParam({ name: 'repo', example: 'nest' })
  async predictLeadTime(@Param('owner') owner: string, @Param('repo') repo: string) {
    this.logger.log(`Incoming request: [GET] /api/ml/${owner}/${repo}/predict`);
    return this.mlService.predictLeadTime(owner, repo);
  }
}
