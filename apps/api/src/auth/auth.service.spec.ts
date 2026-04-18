import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

// Mock prisma
jest.mock('@puzzle-roll/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const { prisma } = jest.requireMock('@puzzle-roll/database');

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
}));

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock_token'),
  verify: jest.fn().mockReturnValue({
    sub: 'user_id',
    email: 'test@example.com',
    isAnonymous: false,
    iat: 0,
    exp: 9999999999,
  }),
};

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('test_secret'),
  get: jest.fn().mockReturnValue('15m'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('creates a user and returns tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user_id',
        email: 'test@example.com',
        isAnonymous: false,
      });

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('mock_token');
      expect(result.refreshToken).toBe('mock_token');
      expect(result.userId).toBe('user_id');
      expect(result.isAnonymous).toBe(false);
    });

    it('throws ConflictException if email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing', email: 'test@example.com' });

      await expect(
        service.register({ email: 'test@example.com', password: 'password123' })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns tokens on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user_id',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        isAnonymous: false,
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('mock_token');
    });

    it('throws UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nope@example.com', password: 'password123' })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      const bcrypt = jest.requireMock('bcryptjs');
      bcrypt.compare.mockResolvedValueOnce(false);

      prisma.user.findUnique.mockResolvedValue({
        id: 'user_id',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        isAnonymous: false,
      });

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' })
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('createAnonymousSession', () => {
    it('creates new anonymous user when no deviceId provided', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'anon_id',
        email: null,
        isAnonymous: true,
        deviceId: 'some-device-id',
      });

      const result = await service.createAnonymousSession({});
      expect(result.isAnonymous).toBe(true);
    });

    it('restores existing anonymous session by deviceId', async () => {
      const existingUser = {
        id: 'anon_id',
        email: null,
        isAnonymous: true,
        deviceId: 'known-device',
      };
      prisma.user.findUnique.mockResolvedValue(existingUser);

      const result = await service.createAnonymousSession({ deviceId: 'known-device' });
      expect(result.userId).toBe('anon_id');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
