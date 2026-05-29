import { IsString, IsNotEmpty, Matches, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncRepositoryDto {
  @ApiProperty({
    description: 'GitHub owner (организация или пользователь)',
    example: 'nestjs',
  })
  @IsString()
  @IsNotEmpty()
  owner: string;

  @ApiProperty({
    description: 'Название репозитория',
    example: 'nest',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.\-]+$/, {
    message: 'repo must contain only alphanumeric characters, dots, hyphens, and underscores',
  })
  repo: string;

  @ApiPropertyOptional({
    description: 'Количество коммитов для загрузки (по умолчанию 500)',
    example: 500,
    minimum: 1,
    maximum: 1000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  commitLimit?: number = 500;
}
