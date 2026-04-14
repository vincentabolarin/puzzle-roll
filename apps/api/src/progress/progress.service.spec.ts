import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { UsersService } from '../users/users.service';
import { GameType, Difficulty } from '@puzzle-roll/shared';

jest.mock('@puzzle-roll/database', () => ({
  prisma: {
    gamePuzzle: { findUnique: jest.fn() },
    gameCompletion: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    userStats: { findMany: jest.fn() },
  },
}));

const { prisma } = jest.requireMock('@puzzle-roll/database');

const mockUsersService = {
  upsertStats: jest.fn().mockResolvedValue(undefined),
};

const MOCK_COMPLETION_DTO = {
  puzzleId: 'puzzle_1',
  gameType: GameType.SUDOKU,
  difficulty: Difficulty.MEDIUM,
  isDaily: false,
  elapsedSeconds: 300,
  hintsUsed: 1,
  completedAt: new Date().toISOString(),
};

describe('ProgressService', () => {
  let service: ProgressService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
    jest.clearAllMocks();
  });

  describe('completeGame', () => {
    it('creates a completion record', async () => {
      prisma.gamePuzzle.findUnique.mockResolvedValue({ id: 'puzzle_1' });
      prisma.gameCompletion.findUnique.mockResolvedValue(null);
      prisma.gameCompletion.create.mockResolvedValue({
        id: 'completion_1',
        userId: 'user_1',
        puzzleId: 'puzzle_1',
        elapsedSeconds: 300,
        hintsUsed: 1,
        completedAt: new Date(),
      });

      const result = await service.completeGame('user_1', MOCK_COMPLETION_DTO);
      expect(result.id).toBe('completion_1');
      expect(mockUsersService.upsertStats).toHaveBeenCalledOnce?.();
    });

    it('throws NotFoundException for unknown puzzle', async () => {
      prisma.gamePuzzle.findUnique.mockResolvedValue(null);

      await expect(service.completeGame('user_1', MOCK_COMPLETION_DTO)).rejects.toThrow(
        NotFoundException
      );
    });

    it('returns existing completion idempotently', async () => {
      prisma.gamePuzzle.findUnique.mockResolvedValue({ id: 'puzzle_1' });
      const existing = { id: 'existing_completion', userId: 'user_1', puzzleId: 'puzzle_1' };
      prisma.gameCompletion.findUnique.mockResolvedValue(existing);

      const result = await service.completeGame('user_1', MOCK_COMPLETION_DTO);
      expect(result.id).toBe('existing_completion');
      expect(prisma.gameCompletion.create).not.toHaveBeenCalled();
    });
  });

  describe('syncProgress', () => {
    it('returns success/failure counts', async () => {
      prisma.gamePuzzle.findUnique.mockResolvedValue({ id: 'puzzle_1' });
      prisma.gameCompletion.findUnique.mockResolvedValue(null);
      prisma.gameCompletion.create.mockResolvedValue({ id: 'c1' });

      const result = await service.syncProgress('user_1', {
        completions: [MOCK_COMPLETION_DTO, MOCK_COMPLETION_DTO],
      });

      expect(result.total).toBe(2);
      expect(result.succeeded).toBeGreaterThan(0);
    });
  });
});
