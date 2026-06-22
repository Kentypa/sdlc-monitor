import { Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  constructor(private readonly metricsService: MetricsService) {}

  @Get(':owner/:repo/burnout')
  @ApiOperation({ summary: 'Get burnout index for developer' })
  @ApiParam({ name: 'owner', example: 'nestjs' })
  @ApiParam({ name: 'repo', example: 'nest' })
  async getBurnout(@Param('owner') owner: string, @Param('repo') repo: string) {
    this.logger.log(`Incoming request: [GET] /api/metrics/${owner}/${repo}/burnout`);
    return this.metricsService.calculateBurnout(owner, repo);
  }

  @Get(':owner/:repo/graph')
  @ApiOperation({ summary: 'Get Social Graph (Code Review)' })
  async getSocialGraph(@Param('owner') owner: string, @Param('repo') repo: string) {
    this.logger.log(`Incoming request: [GET] /api/metrics/${owner}/${repo}/graph`);
    return this.metricsService.calculateSocialGraph(owner, repo);
  }

  @Get(':owner/:repo/process')
  @ApiOperation({ summary: 'Get (Lead Time, Churn)' })
  async getProcessMetrics(@Param('owner') owner: string, @Param('repo') repo: string) {
    this.logger.log(`Incoming request: [GET] /api/metrics/${owner}/${repo}/process`);
    return this.metricsService.calculateProcessMetrics(owner, repo);
  }

  @Post(':owner/:repo/snapshot')
  @ApiOperation({ summary: 'Generate and save snapshot of metrics' })
  async generateSnapshot(@Param('owner') owner: string, @Param('repo') repo: string) {
    this.logger.log(`Incoming request: [POST] /api/metrics/${owner}/${repo}/snapshot`);
    return this.metricsService.generateSnapshot(owner, repo);
  }
}
