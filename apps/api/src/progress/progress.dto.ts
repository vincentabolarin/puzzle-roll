import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Difficulty, GameType } from '@puzzle-roll/shared';

export class CompleteGameDto {
  @ApiProperty()
  @IsString()
  puzzleId: string;

  @ApiProperty({ enum: GameType })
  @IsEnum(GameType)
  gameType: GameType;

  @ApiProperty({ enum: Difficulty })
  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @ApiProperty()
  @IsBoolean()
  isDaily: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dailyPuzzleId?: string;

  @ApiProperty({ description: 'Elapsed time in seconds' })
  @IsInt()
  @Min(1)
  elapsedSeconds: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  hintsUsed: number;

  @ApiProperty()
  @IsISO8601()
  completedAt: string;

  @ApiPropertyOptional({ description: 'Wordle-style emoji share string' })
  @IsOptional()
  @IsString()
  shareableResult?: string;
}

export class SyncProgressDto {
  @ApiProperty({ type: [CompleteGameDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteGameDto)
  completions: CompleteGameDto[];
}
