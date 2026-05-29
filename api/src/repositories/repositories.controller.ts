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

  constructor(private readonly repositoriesService: RepositoriesService) {}

  /**
   * GET /api/repositories
   * Список всех синхронизированных репозиториев
   */
  @Get()
  @ApiOperation({ summary: 'Список синхронизированных репозиториев' })
  @ApiResponse({ status: 200, description: 'Массив репозиториев с количеством коммитов и PR' })
  findAll() {
    this.logger.log('Incoming request: [GET] /api/repositories');
    return this.repositoriesService.findAll();
  }

  /**
   * POST /api/repositories/sync
   * Запускает синхронизацию данных GitHub для репозитория
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Синхронизировать репозиторий с GitHub',
    description:
      'Загружает коммиты, Pull Requests и ревью. Сохраняет в БД. Занимает 30-120 секунд.',
  })
  @ApiResponse({
    status: 200,
    description: 'Результат синхронизации с количеством загруженных объектов',
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
  @ApiResponse({ status: 404, description: 'Репозиторий не найден на GitHub' })
  @ApiResponse({ status: 400, description: 'Неверный формат запроса' })
  async sync(@Body() dto: SyncRepositoryDto) {
    this.logger.log(`Incoming request: [POST] /api/repositories/sync`, dto);
    const result = await this.repositoriesService.syncRepository(dto);
    return {
      success: true,
      ...result,
    };
  }

  /**
   * POST /api/repositories/sync/:owner/:repo
   * Примусова синхронізація репозиторію
   */
  @Post('sync/:owner/:repo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Примусова синхронізація репозиторію з GitHub' })
  async syncRepository(@Param('owner') owner: string, @Param('repo') repo: string) {
    this.logger.log(`Incoming request: [POST] /api/repositories/sync/${owner}/${repo}`);
    const result = await this.repositoriesService.syncRepository({ owner, repo, commitLimit: 500 });
    return {
      success: true,
      ...result,
    };
  }

  /**
   * GET /api/repositories/:owner/:repo
   * Информация о конкретном репозитории
   */
  @Get(':owner/:repo')
  @ApiOperation({ summary: 'Получить информацию о репозитории' })
  @ApiParam({ name: 'owner', example: 'nestjs' })
  @ApiParam({ name: 'repo', example: 'nest' })
  @ApiResponse({ status: 200, description: 'Данные репозитория' })
  @ApiResponse({ status: 404, description: 'Репозиторий не синхронизирован' })
  findOne(@Param('owner') owner: string, @Param('repo') repo: string) {
    this.logger.log(`Incoming request: [GET] /api/repositories/${owner}/${repo}`);
    return this.repositoriesService.findOne(owner, repo);
  }
}
