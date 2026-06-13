import { IsString, IsNotEmpty, Matches, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncRepositoryDto {
  @ApiProperty({
    description: 'GitHub owner',
    example: 'nestjs',
  })
  @IsString()
  @IsNotEmpty()
  owner: string;

  @ApiProperty({
    description: 'repo name',
    example: 'nest',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.\-]+$/, {
    message: 'repo must contain only alphanumeric characters, dots, hyphens, and underscores',
  })
  repo: string;

  @ApiPropertyOptional({
    description: 'count commits to download',
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
