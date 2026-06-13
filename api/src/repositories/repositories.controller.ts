import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { RepositoriesService } from './repositories.service';
import { SyncRepositoryDto } from './dto/sync-repository.dto';

@ApiTags('repositories')
@Controller('repositories')
export class RepositoriesController {
  private readonly logger = new Logger(RepositoriesController.name);

  constructor(private readonly repositoriesService: RepositoriesService) { }

  @Get()
  @ApiOperation({ summary: 'Get synced repos' })
  @ApiResponse({ status: 200, description: 'Array repos with count commits and PR' })
  findAll() {
    this.logger.log('Incoming request: [GET] /api/repositories');
    return this.repositoriesService.findAll();
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sync repos with GitHyb',
    description:
      'Downloads commits, pull requests, and reviews. Saves to the database. Takes 30-120 seconds.',
  })
  @ApiResponse({
    status: 200,
    description: 'Synchronization result with the number of downloaded objects',
    schema: {
      example: {
        repository: 'nestjs/nest',
        commits: 487,
        pullRequests: 95,
        reviews: 312,
        developers: 43,
        skippedCommits: 13,
        rateLimit: { remaining: 4870, limit: 5000 },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Repository not found' })
  @ApiResponse({ status: 400, description: 'Invalid request format' })
  async sync(@Body() dto: SyncRepositoryDto) {
    this.logger.log(`Incoming request: [POST] /api/repositories/sync`, dto);
    const result = await this.repositoriesService.syncRepository(dto);
    return {
      success: true,
      ...result,
    };
  }

  @Post('sync/:owner/:repo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forced synchronization of the repository with GitHub' })
  async syncRepository(@Param('owner') owner: string, @Param('repo') repo: string) {
    this.logger.log(`Incoming request: [POST] /api/repositories/sync/${owner}/${repo}`);
    const result = await this.repositoriesService.syncRepository({ owner, repo, commitLimit: 500 });
    return {
      success: true,
      ...result,
    };
  }

  @Get(':owner/:repo')
  @ApiOperation({ summary: 'Get repos info' })
  @ApiParam({ name: 'owner', example: 'nestjs' })
  @ApiParam({ name: 'repo', example: 'nest' })
  @ApiResponse({ status: 200, description: 'Repos info' })
  @ApiResponse({ status: 404, description: 'Repository not found' })
  findOne(@Param('owner') owner: string, @Param('repo') repo: string) {
    this.logger.log(`Incoming request: [GET] /api/repositories/${owner}/${repo}`);
    return this.repositoriesService.findOne(owner, repo);
  }
}
